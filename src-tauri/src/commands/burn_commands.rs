use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use tauri::{path::BaseDirectory, AppHandle, Emitter, Manager};

const BURN_PROGRESS_EVENT: &str = "subforge://burn-progress";
const ALLOWED_FONT_NAMES: [&str; 5] = [
    "Arimo",
    "Roboto",
    "Noto Sans",
    "Source Sans 3",
    "Atkinson Hyperlegible",
];
const ALLOWED_FONT_COLORS: [&str; 4] = ["#FFFFFF", "#FFFF00", "#00FFFF", "#00FF00"];

#[derive(Debug, Serialize, Deserialize)]
pub struct AudioStreamInfo {
    pub index: i32,
    pub codec_name: Option<String>,
    pub channels: Option<u32>,
    pub language: Option<String>,
    pub title: Option<String>,
    pub is_default: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SubtitleStreamInfo {
    pub index: i32,
    pub codec_name: Option<String>,
    pub language: Option<String>,
    pub title: Option<String>,
    pub is_default: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ProbeMediaStreamsResponse {
    pub audio_streams: Vec<AudioStreamInfo>,
    pub subtitle_streams: Vec<SubtitleStreamInfo>,
    pub has_embedded_subtitles: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BurnSubtitlesRequest {
    pub video_path: String,
    pub subtitle_path: String,
    pub font_name: String,
    pub font_color: String,
    pub font_size: f32,
    pub outline: f32,
    pub margin_v: i32,
    pub remove_embedded_subtitles: bool,
    pub remove_audio_stream_indices: Vec<i32>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BurnSubtitlesResponse {
    pub output_path: String,
    pub used_video_codec: String,
    pub amf_attempted: bool,
}

#[derive(Debug, Serialize, Clone)]
pub struct BurnProgressEvent {
    pub phase: String,
    pub codec: String,
    pub processed_seconds: f64,
    pub duration_seconds: f64,
    pub percent: f64,
    pub speed: Option<f64>,
    pub eta_seconds: Option<f64>,
    pub status: String,
}

#[derive(Debug, Deserialize)]
struct FfprobeResponse {
    #[serde(default)]
    streams: Vec<FfprobeStream>,
    format: Option<FfprobeFormat>,
}

#[derive(Debug, Deserialize)]
struct FfprobeFormat {
    duration: Option<String>,
}

#[derive(Debug, Deserialize)]
struct FfprobeStream {
    index: i32,
    codec_type: Option<String>,
    codec_name: Option<String>,
    channels: Option<u32>,
    tags: Option<HashMap<String, String>>,
    disposition: Option<FfprobeDisposition>,
}

#[derive(Debug, Deserialize)]
struct FfprobeDisposition {
    #[serde(rename = "default")]
    default_track: Option<i32>,
}

#[tauri::command]
pub async fn pick_subtitle_file(app: AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let file = app
        .dialog()
        .file()
        .add_filter(
            "Legendas",
            &["srt", "ass", "ssa", "vtt", "SRT", "ASS", "SSA", "VTT"],
        )
        .blocking_pick_file();

    Ok(file.map(|f| f.to_string()))
}

#[tauri::command]
pub async fn probe_media_streams(video_path: String) -> Result<ProbeMediaStreamsResponse, String> {
    let probe = run_ffprobe(&video_path)?;

    let mut audio_streams = Vec::new();
    let mut subtitle_streams = Vec::new();

    for stream in probe.streams {
        let language = stream
            .tags
            .as_ref()
            .and_then(|t| t.get("language"))
            .cloned();
        let title = stream.tags.as_ref().and_then(|t| t.get("title")).cloned();
        let is_default = stream
            .disposition
            .as_ref()
            .and_then(|d| d.default_track)
            .unwrap_or(0)
            == 1;

        match stream.codec_type.as_deref() {
            Some("audio") => audio_streams.push(AudioStreamInfo {
                index: stream.index,
                codec_name: stream.codec_name,
                channels: stream.channels,
                language,
                title,
                is_default,
            }),
            Some("subtitle") => subtitle_streams.push(SubtitleStreamInfo {
                index: stream.index,
                codec_name: stream.codec_name,
                language,
                title,
                is_default,
            }),
            _ => {}
        }
    }

    Ok(ProbeMediaStreamsResponse {
        has_embedded_subtitles: !subtitle_streams.is_empty(),
        audio_streams,
        subtitle_streams,
    })
}

#[tauri::command]
pub async fn burn_subtitles(
    app: AppHandle,
    request: BurnSubtitlesRequest,
) -> Result<Option<BurnSubtitlesResponse>, String> {
    use tauri_plugin_dialog::DialogExt;

    let input_video = PathBuf::from(&request.video_path);
    if !input_video.exists() {
        return Err("Video nao encontrado.".to_string());
    }

    let input_subtitle = PathBuf::from(&request.subtitle_path);
    if !input_subtitle.exists() {
        return Err("Arquivo de legenda nao encontrado.".to_string());
    }

    if !ALLOWED_FONT_NAMES.contains(&request.font_name.as_str()) {
        return Err("Fonte invalida. Escolha uma fonte embarcada da lista.".to_string());
    }

    if !ALLOWED_FONT_COLORS.contains(&request.font_color.to_uppercase().as_str()) {
        return Err("Cor invalida. Escolha uma cor preset da lista.".to_string());
    }

    let suggested_name = suggested_output_name(&input_video);
    let mut dialog = app
        .dialog()
        .file()
        .set_file_name(&suggested_name)
        .add_filter(
            "Video",
            &["mp4", "mkv", "mov", "avi", "webm", "MP4", "MKV", "MOV", "AVI", "WEBM"],
        );

    if let Some(parent) = input_video.parent() {
        dialog = dialog.set_directory(parent);
    }

    let Some(output_file) = dialog.blocking_save_file() else {
        return Ok(None);
    };

    let output_path = output_file.to_string();
    let probe = run_ffprobe(&request.video_path)?;
    let duration_seconds = extract_duration_seconds(&probe);
    let fonts_dir = resolve_embedded_fonts_dir(&app)?;
    let audio_indices: Vec<i32> = probe
        .streams
        .iter()
        .filter(|s| s.codec_type.as_deref() == Some("audio"))
        .map(|s| s.index)
        .collect();

    let remove_set: HashSet<i32> = request.remove_audio_stream_indices.iter().copied().collect();
    let keep_audio_indices: Vec<i32> = audio_indices
        .into_iter()
        .filter(|idx| !remove_set.contains(idx))
        .collect();

    let ffmpeg_common_args =
        build_ffmpeg_args_common(&request, &keep_audio_indices, &fonts_dir, &output_path)?;

    match run_ffmpeg_with_codec(&app, "h264_amf", &ffmpeg_common_args, duration_seconds) {
        Ok(()) => Ok(Some(BurnSubtitlesResponse {
            output_path,
            used_video_codec: "h264_amf".to_string(),
            amf_attempted: true,
        })),
        Err(amf_error) => {
            emit_burn_progress(
                &app,
                BurnProgressEvent {
                    phase: "AMF indisponivel, ativando fallback".to_string(),
                    codec: "libx264".to_string(),
                    processed_seconds: 0.0,
                    duration_seconds,
                    percent: 0.0,
                    speed: None,
                    eta_seconds: None,
                    status: "fallback".to_string(),
                },
            );

            run_ffmpeg_with_codec(&app, "libx264", &ffmpeg_common_args, duration_seconds).map_err(
                |fallback_error| {
                    format!(
                        "Falha no encode com h264_amf: {}\nFallback com libx264 tambem falhou: {}",
                        amf_error, fallback_error
                    )
                },
            )?;

            Ok(Some(BurnSubtitlesResponse {
                output_path,
                used_video_codec: "libx264".to_string(),
                amf_attempted: true,
            }))
        }
    }
}

fn run_ffprobe(video_path: &str) -> Result<FfprobeResponse, String> {
    let output = Command::new("ffprobe")
        .arg("-v")
        .arg("error")
        .arg("-print_format")
        .arg("json")
        .arg("-show_streams")
        .arg("-show_format")
        .arg(video_path)
        .output()
        .map_err(|e| format!("Falha ao executar ffprobe: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ffprobe falhou: {}", stderr.trim()));
    }

    serde_json::from_slice::<FfprobeResponse>(&output.stdout)
        .map_err(|e| format!("Falha ao parsear saida do ffprobe: {}", e))
}

fn run_ffmpeg_with_codec(
    app: &AppHandle,
    codec: &str,
    common_args: &[String],
    duration_seconds: f64,
) -> Result<(), String> {
    let mut args = common_args.to_vec();
    let output_path = args
        .pop()
        .ok_or_else(|| "Argumentos do ffmpeg invalidos: saida ausente".to_string())?;

    args.push("-c:v".to_string());
    args.push(codec.to_string());
    args.push("-c:a".to_string());
    args.push("copy".to_string());

    if common_args.iter().any(|a| a == "0:s?") {
        args.push("-c:s".to_string());
        args.push("copy".to_string());
    }

    args.push("-progress".to_string());
    args.push("pipe:1".to_string());
    args.push("-stats_period".to_string());
    args.push("0.5".to_string());
    args.push("-nostats".to_string());
    args.push(output_path);

    emit_burn_progress(
        app,
        BurnProgressEvent {
            phase: phase_label(codec).to_string(),
            codec: codec.to_string(),
            processed_seconds: 0.0,
            duration_seconds,
            percent: 0.0,
            speed: None,
            eta_seconds: None,
            status: "running".to_string(),
        },
    );

    let mut child = Command::new("ffmpeg")
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Falha ao executar ffmpeg: {}", e))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Falha ao capturar progresso do ffmpeg.".to_string())?;

    let stderr = child.stderr.take();
    let stderr_handle = std::thread::spawn(move || -> String {
        let mut stderr_text = String::new();
        if let Some(mut stream) = stderr {
            let _ = stream.read_to_string(&mut stderr_text);
        }
        stderr_text
    });

    let reader = BufReader::new(stdout);
    let mut processed_seconds = 0.0_f64;
    let mut speed = None;

    for line_result in reader.lines() {
        let line = line_result.map_err(|e| format!("Falha ao ler progresso do ffmpeg: {}", e))?;
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };

        let mut should_emit = false;

        if key == "out_time_us" || key == "out_time_ms" {
            if let Ok(out_value) = value.trim().parse::<f64>() {
                processed_seconds = (out_value / 1_000_000.0).max(0.0);
                should_emit = true;
            }
        }

        if key == "speed" {
            speed = parse_speed(value);
            should_emit = true;
        }

        if key == "progress" {
            should_emit = true;
        }

        if should_emit {
            let percent = progress_percent(processed_seconds, duration_seconds);
            let eta_seconds = calculate_eta_seconds(processed_seconds, duration_seconds, speed);
            let status = if key == "progress" && value.trim() == "end" {
                "completed"
            } else {
                "running"
            };

            emit_burn_progress(
                app,
                BurnProgressEvent {
                    phase: phase_label(codec).to_string(),
                    codec: codec.to_string(),
                    processed_seconds,
                    duration_seconds,
                    percent,
                    speed,
                    eta_seconds,
                    status: status.to_string(),
                },
            );
        }
    }

    let status = child
        .wait()
        .map_err(|e| format!("Falha ao aguardar ffmpeg: {}", e))?;
    let stderr_output = stderr_handle
        .join()
        .unwrap_or_else(|_| "Erro ao coletar stderr do ffmpeg.".to_string());

    if status.success() {
        emit_burn_progress(
            app,
            BurnProgressEvent {
                phase: phase_label(codec).to_string(),
                codec: codec.to_string(),
                processed_seconds: duration_seconds,
                duration_seconds,
                percent: 100.0,
                speed,
                eta_seconds: Some(0.0),
                status: "completed".to_string(),
            },
        );
        return Ok(());
    }

    let stderr_clean = stderr_output.trim();
    if stderr_clean.is_empty() {
        Err("ffmpeg falhou sem detalhes no stderr.".to_string())
    } else {
        Err(stderr_clean.to_string())
    }
}

fn build_ffmpeg_args_common(
    request: &BurnSubtitlesRequest,
    keep_audio_indices: &[i32],
    fonts_dir: &Path,
    output_path: &str,
) -> Result<Vec<String>, String> {
    let subtitles_filter = build_subtitles_filter(request, fonts_dir)?;
    let mut args = vec![
        "-y".to_string(),
        "-i".to_string(),
        request.video_path.clone(),
        "-vf".to_string(),
        subtitles_filter,
        "-map".to_string(),
        "0:v:0".to_string(),
    ];

    for audio_index in keep_audio_indices {
        args.push("-map".to_string());
        args.push(format!("0:{}", audio_index));
    }

    if !request.remove_embedded_subtitles {
        args.push("-map".to_string());
        args.push("0:s?".to_string());
    }

    args.push(output_path.to_string());
    Ok(args)
}

fn build_subtitles_filter(request: &BurnSubtitlesRequest, fonts_dir: &Path) -> Result<String, String> {
    let color_ass = hex_to_ass_color(&request.font_color)?;
    let subtitle_path = normalize_for_filter(&request.subtitle_path);
    let fonts_dir_path = normalize_for_filter(&fonts_dir.to_string_lossy());

    let style = format!(
        "FontName={},FontSize={:.2},PrimaryColour={},Outline={:.2},BorderStyle=1,MarginV={}",
        escape_ass_style_value(&request.font_name),
        request.font_size.max(1.0),
        color_ass,
        request.outline.max(0.0),
        request.margin_v.max(0)
    );

    Ok(format!(
        "subtitles=filename='{}':fontsdir='{}':force_style='{}'",
        escape_filename_filter_value(&subtitle_path),
        escape_filename_filter_value(&fonts_dir_path),
        escape_force_style_value(&style)
    ))
}

fn resolve_embedded_fonts_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let bundled = app
        .path()
        .resolve("subtitle-fonts", BaseDirectory::Resource)
        .map_err(|e| format!("Falha ao resolver pasta de fontes embarcadas: {}", e))?;

    if bundled.exists() {
        return Ok(bundled);
    }

    let dev_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join("subtitle-fonts");
    if dev_path.exists() {
        return Ok(dev_path);
    }

    Err("Nao foi possivel localizar as fontes embarcadas.".to_string())
}

fn normalize_for_filter(path: &str) -> String {
    path.replace('\\', "/")
}

fn escape_filename_filter_value(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace(':', "\\:")
        .replace('\'', "\\'")
        .replace(',', "\\,")
        .replace('[', "\\[")
        .replace(']', "\\]")
}

fn escape_force_style_value(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace(':', "\\:")
        .replace('\'', "\\'")
}

fn escape_ass_style_value(value: &str) -> String {
    value.replace(',', "\\,").replace('\'', "")
}

fn hex_to_ass_color(hex: &str) -> Result<String, String> {
    let raw = hex.trim().trim_start_matches('#');
    if raw.len() != 6 || !raw.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("Cor invalida. Use formato #RRGGBB.".to_string());
    }

    let r = &raw[0..2];
    let g = &raw[2..4];
    let b = &raw[4..6];
    Ok(format!("&H00{}{}{}", b.to_uppercase(), g.to_uppercase(), r.to_uppercase()))
}

fn extract_duration_seconds(probe: &FfprobeResponse) -> f64 {
    probe
        .format
        .as_ref()
        .and_then(|f| f.duration.as_deref())
        .and_then(|d| d.parse::<f64>().ok())
        .unwrap_or(0.0)
        .max(0.0)
}

fn phase_label(codec: &str) -> &'static str {
    if codec == "h264_amf" {
        "Encode de video (AMF)"
    } else {
        "Encode de video (libx264)"
    }
}

fn parse_speed(value: &str) -> Option<f64> {
    let clean = value.trim().trim_end_matches('x');
    let parsed = clean.parse::<f64>().ok()?;
    if parsed.is_finite() && parsed > 0.0 {
        Some(parsed)
    } else {
        None
    }
}

fn progress_percent(processed_seconds: f64, duration_seconds: f64) -> f64 {
    if duration_seconds <= 0.0 {
        return 0.0;
    }

    ((processed_seconds / duration_seconds) * 100.0).clamp(0.0, 100.0)
}

fn calculate_eta_seconds(
    processed_seconds: f64,
    duration_seconds: f64,
    speed: Option<f64>,
) -> Option<f64> {
    let speed = speed?;
    if duration_seconds <= 0.0 || speed <= 0.0 {
        return None;
    }

    let remaining = (duration_seconds - processed_seconds).max(0.0);
    Some(remaining / speed)
}

fn emit_burn_progress(app: &AppHandle, event: BurnProgressEvent) {
    let _ = app.emit(BURN_PROGRESS_EVENT, event);
}

fn suggested_output_name(video_path: &Path) -> String {
    let stem = video_path
        .file_stem()
        .map(|v| v.to_string_lossy().to_string())
        .unwrap_or_else(|| "output".to_string());

    let ext = video_path
        .extension()
        .map(|v| format!(".{}", v.to_string_lossy()))
        .unwrap_or_else(|| ".mp4".to_string());

    format!("{}_burned{}", stem, ext)
}

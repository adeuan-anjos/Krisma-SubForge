use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::AppHandle;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SrtSegment {
    pub index: u32,
    pub start_ms: u64,
    pub end_ms: u64,
    pub text: String,
}

/// Abre diálogo para selecionar arquivo de mídia (vídeo/áudio)
#[tauri::command]
pub async fn pick_video_file(app: AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let file = app
        .dialog()
        .file()
        .add_filter(
            "Midia",
            &[
                "mp4", "mkv", "mov", "avi", "webm",
                "wav", "mp3", "m4a", "aac", "flac", "ogg",
                "MP4", "MKV", "MOV", "AVI", "WEBM",
                "WAV", "MP3", "M4A", "AAC", "FLAC", "OGG",
            ],
        )
        .blocking_pick_file();

    Ok(file.map(|f| f.to_string()))
}

/// Abre diálogo para salvar SRT e escreve o conteúdo
#[tauri::command]
pub async fn save_srt(
    app: AppHandle,
    content: String,
    default_name: Option<String>,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    let name = default_name.unwrap_or_else(|| "legenda.srt".to_string());

    let path = app
        .dialog()
        .file()
        .set_file_name(&name)
        .add_filter("SRT", &["srt"])
        .blocking_save_file();

    if let Some(p) = path {
        let path_str = p.to_string();
        std::fs::write(&path_str, content.as_bytes())
            .map_err(|e| format!("Erro ao salvar: {}", e))?;
        return Ok(Some(path_str));
    }

    Ok(None)
}

/// Lê e parseia um arquivo SRT em segmentos
#[tauri::command]
pub async fn read_srt(path: String) -> Result<Vec<SrtSegment>, String> {
    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Erro ao ler SRT: {}", e))?;

    let segments = parse_srt(&content);
    Ok(segments)
}

/// Abre pasta no Explorer do Windows
#[tauri::command]
pub async fn open_in_explorer(path: String) -> Result<(), String> {
    let folder = if Path::new(&path).is_file() {
        Path::new(&path)
            .parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or(path)
    } else {
        path
    };

    std::process::Command::new("explorer")
        .arg(&folder)
        .spawn()
        .map_err(|e| format!("Erro ao abrir explorer: {}", e))?;

    Ok(())
}

// ─── Parser SRT ─────────────────────────────────────────────────────────────

fn parse_srt(content: &str) -> Vec<SrtSegment> {
    let mut segments = Vec::new();
    let blocks: Vec<&str> = content.trim().split("\n\n").collect();

    for block in blocks {
        let lines: Vec<&str> = block.trim().lines().collect();
        if lines.len() < 3 {
            continue;
        }

        let index: u32 = lines[0].trim().parse().unwrap_or(0);

        let timestamps: Vec<&str> = lines[1].split(" --> ").collect();
        if timestamps.len() != 2 {
            continue;
        }

        let start_ms = parse_timestamp(timestamps[0].trim());
        let end_ms = parse_timestamp(timestamps[1].trim());

        let text = lines[2..].join("\n");

        segments.push(SrtSegment {
            index,
            start_ms,
            end_ms,
            text,
        });
    }

    segments
}

fn parse_timestamp(s: &str) -> u64 {
    // Formato: HH:MM:SS,mmm
    let s = s.replace(',', ".");
    let parts: Vec<&str> = s.split(':').collect();
    if parts.len() != 3 {
        return 0;
    }

    let h: u64 = parts[0].parse().unwrap_or(0);
    let m: u64 = parts[1].parse().unwrap_or(0);

    let sec_parts: Vec<&str> = parts[2].split('.').collect();
    let sec: u64 = sec_parts[0].parse().unwrap_or(0);
    let ms: u64 = if sec_parts.len() > 1 {
        let ms_str = sec_parts[1];
        let ms_str = if ms_str.len() > 3 { &ms_str[..3] } else { ms_str };
        let parsed: u64 = ms_str.parse().unwrap_or(0);
        // Normalizar para 3 dígitos
        match ms_str.len() {
            1 => parsed * 100,
            2 => parsed * 10,
            _ => parsed,
        }
    } else {
        0
    };

    h * 3_600_000 + m * 60_000 + sec * 1_000 + ms
}

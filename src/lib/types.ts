// Telas disponíveis no app
export type AppScreen =
  | "home"
  | "processing"
  | "editor"
  | "history"
  | "settings"
  | "burn";

export interface AudioStreamInfo {
  index: number;
  codec_name?: string;
  channels?: number;
  language?: string;
  title?: string;
  is_default: boolean;
}

export interface SubtitleStreamInfo {
  index: number;
  codec_name?: string;
  language?: string;
  title?: string;
  is_default: boolean;
}

export interface ProbeMediaStreamsResponse {
  audio_streams: AudioStreamInfo[];
  subtitle_streams: SubtitleStreamInfo[];
  has_embedded_subtitles: boolean;
}

export interface BurnSubtitlesRequest {
  video_path: string;
  subtitle_path: string;
  font_name: string;
  font_color: string;
  font_size: number;
  outline: number;
  margin_v: number;
  remove_embedded_subtitles: boolean;
  remove_audio_stream_indices: number[];
}

export interface BurnSubtitlesResponse {
  output_path: string;
  used_video_codec: "h264_amf" | "libx264";
  amf_attempted: boolean;
}

export interface BurnProgressEvent {
  phase: string;
  codec: "h264_amf" | "libx264";
  processed_seconds: number;
  duration_seconds: number;
  percent: number;
  speed?: number | null;
  eta_seconds?: number | null;
  status: "running" | "fallback" | "completed";
}

// Status de um job
export type JobStatus = "pending" | "processing" | "completed" | "error" | "cancelled";

// Estágios do pipeline
export type PipelineStage =
  | "extracting"
  | "cleaning"
  | "transcribing"
  | "aligning"
  | "exporting";

// Evento de progresso vindo do sidecar Python
export interface ProgressEvent {
  type: "progress";
  stage: PipelineStage;
  percent: number;
}

export interface CompleteEvent {
  type: "complete";
  srt_path: string;
  segments_count: number;
}

export interface LogEvent {
  type: "log";
  level: "info" | "warn" | "error";
  message: string;
}

export interface ErrorEvent {
  type: "error";
  message: string;
}

export interface ConfirmEvent {
  type: "confirm";
  kind: "cleanup_failed";
  message: string;
}

export type SidecarEvent = ProgressEvent | CompleteEvent | LogEvent | ErrorEvent | ConfirmEvent;

// Segmento SRT
export interface SrtSegment {
  index: number;
  start_ms: number;
  end_ms: number;
  text: string;
}

// Job de processamento
export interface ProcessingJob {
  id: string;
  video_path: string;
  video_name: string;
  created_at: string; // ISO string
  status: JobStatus;
  srt_path?: string;
  segments_count?: number;
}

// Opções do pipeline
export interface ProcessingOptions {
  gemini_key: string;
  audio_cleanup_enabled: boolean;
}

// Configurações do app
export interface AppSettings {
  gemini_key: string;
  mfa_models_installed: boolean;
  audio_cleanup_enabled: boolean;
}

export interface CacheCleanupResult {
  removed_files: number;
  freed_bytes: number;
  scanned_dirs: number;
}

// Formata ms em HH:MM:SS,mmm
export function formatTimestamp(ms: number): string {
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1_000);
  const millis = ms % 1_000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(millis).padStart(3, "0")}`;
}

// Formata segundos para MM:SS
export function formatSeconds(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

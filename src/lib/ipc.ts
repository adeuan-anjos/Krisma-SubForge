import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  ProcessingJob,
  ProcessingOptions,
  AppSettings,
  CacheCleanupResult,
  SrtSegment,
  SidecarEvent,
  BurnSubtitlesRequest,
  BurnSubtitlesResponse,
  ProbeMediaStreamsResponse,
  BurnProgressEvent,
} from "./types";

// ─── Arquivo / Video ───────────────────────────────────────────────────────

export async function pickVideoFile(): Promise<string | null> {
  return invoke<string | null>("pick_video_file");
}

export async function saveSrt(content: string, defaultName?: string): Promise<string | null> {
  return invoke<string | null>("save_srt", { content, defaultName });
}

export async function readSrt(path: string): Promise<SrtSegment[]> {
  return invoke<SrtSegment[]>("read_srt", { path });
}

export async function openInExplorer(path: string): Promise<void> {
  return invoke<void>("open_in_explorer", { path });
}

export async function pickSubtitleFile(): Promise<string | null> {
  return invoke<string | null>("pick_subtitle_file");
}

export async function probeMediaStreams(videoPath: string): Promise<ProbeMediaStreamsResponse> {
  return invoke<ProbeMediaStreamsResponse>("probe_media_streams", { videoPath });
}

export async function burnSubtitles(
  request: BurnSubtitlesRequest
): Promise<BurnSubtitlesResponse | null> {
  return invoke<BurnSubtitlesResponse | null>("burn_subtitles", {
    request,
  });
}

// ─── Jobs ──────────────────────────────────────────────────────────────────

export async function listJobs(): Promise<ProcessingJob[]> {
  return invoke<ProcessingJob[]>("list_jobs");
}

// ─── Sidecar / Pipeline ────────────────────────────────────────────────────

export async function startProcessing(
  videoPath: string,
  options: ProcessingOptions
): Promise<void> {
  return invoke<void>("start_processing", { videoPath, options });
}

export async function cancelProcessing(): Promise<void> {
  return invoke<void>("cancel_processing");
}

export async function confirmCleanupFailure(continueWithoutCleanup: boolean): Promise<void> {
  return invoke<void>("confirm_cleanup_failure", { continueWithoutCleanup });
}

export async function checkMfaModels(): Promise<boolean> {
  return invoke<boolean>("check_mfa_models");
}

export async function downloadMfaModels(): Promise<void> {
  return invoke<void>("download_mfa_models");
}

// ─── Configurações ─────────────────────────────────────────────────────────

export async function getSettings(): Promise<AppSettings> {
  return invoke<AppSettings>("get_settings");
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  return invoke<void>("save_settings", { settings });
}

export async function clearGeminiCache(): Promise<CacheCleanupResult> {
  return invoke<CacheCleanupResult>("clear_gemini_cache");
}

// ─── Listeners de eventos do sidecar ──────────────────────────────────────

export function onSidecarEvent(callback: (event: SidecarEvent) => void) {
  return listen<SidecarEvent>("subforge://event", (e) => {
    callback(e.payload);
  });
}

export function onMfaDownloadProgress(callback: (percent: number) => void) {
  return listen<number>("subforge://mfa-progress", (e) => {
    callback(e.payload);
  });
}

export function onBurnProgress(callback: (event: BurnProgressEvent) => void) {
  return listen<BurnProgressEvent>("subforge://burn-progress", (e) => {
    callback(e.payload);
  });
}

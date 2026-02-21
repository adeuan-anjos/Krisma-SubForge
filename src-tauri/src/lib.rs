mod commands;
mod sidecar;

use commands::{
    burn_commands::{burn_subtitles, pick_subtitle_file, probe_media_streams},
    file_commands::{open_in_explorer, pick_video_file, read_srt, save_srt},
    jobs_commands::list_jobs,
    settings_commands::{
        check_mfa_models, clear_gemini_cache, download_mfa_models, get_settings, save_settings,
    },
    sidecar_commands::{
        cancel_processing, confirm_cleanup_failure, start_processing, SidecarState,
    },
};
use std::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .manage(SidecarState(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            // Arquivo
            pick_video_file,
            save_srt,
            read_srt,
            open_in_explorer,
            pick_subtitle_file,
            probe_media_streams,
            burn_subtitles,
            // Jobs
            list_jobs,
            // Sidecar
            start_processing,
            cancel_processing,
            confirm_cleanup_failure,
            // Settings
            get_settings,
            save_settings,
            check_mfa_models,
            download_mfa_models,
            clear_gemini_cache,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

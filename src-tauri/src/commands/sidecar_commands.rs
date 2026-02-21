use crate::sidecar::SidecarManager;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, State};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProcessingOptions {
    pub gemini_key: String,
    #[serde(default = "default_audio_cleanup_enabled")]
    pub audio_cleanup_enabled: bool,
}

fn default_audio_cleanup_enabled() -> bool {
    true
}

pub struct SidecarState(pub Mutex<Option<SidecarManager>>);

#[tauri::command]
pub async fn start_processing(
    app: AppHandle,
    state: State<'_, SidecarState>,
    video_path: String,
    options: ProcessingOptions,
) -> Result<(), String> {
    // Cancelar processamento anterior (dentro do lock, sem await)
    {
        let mut guard = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
        if let Some(mgr) = guard.take() {
            mgr.cancel().ok();
        }
    } // guard solto aqui antes do await

    let mgr = SidecarManager::new(app, video_path, options).await?;

    let mut guard = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    *guard = Some(mgr);

    Ok(())
}

#[tauri::command]
pub async fn cancel_processing(state: State<'_, SidecarState>) -> Result<(), String> {
    let mgr = {
        let mut guard = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
        guard.take()
    }; // guard solto antes de chamar cancel

    if let Some(mgr) = mgr {
        mgr.cancel().map_err(|e| format!("Erro ao cancelar: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
pub async fn confirm_cleanup_failure(
    state: State<'_, SidecarState>,
    continue_without_cleanup: bool,
) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| format!("Lock error: {}", e))?;
    let Some(manager) = guard.as_mut() else {
        return Err("Nenhum processamento ativo para confirmar limpeza".to_string());
    };

    manager.send_cleanup_decision(continue_without_cleanup)
}

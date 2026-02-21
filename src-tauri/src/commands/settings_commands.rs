use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(default)]
pub struct AppSettings {
    pub gemini_key: String,
    pub mfa_models_installed: bool,
    pub audio_cleanup_enabled: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CacheCleanupResult {
    pub removed_files: u64,
    pub freed_bytes: u64,
    pub scanned_dirs: u64,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            gemini_key: String::new(),
            mfa_models_installed: false,
            audio_cleanup_enabled: true,
        }
    }
}

fn settings_path() -> PathBuf {
    let app_dir = dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("krisma-subforge");
    std::fs::create_dir_all(&app_dir).ok();
    app_dir.join("settings.json")
}

fn transcript_cache_dirs() -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = Vec::new();

    if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
        let trimmed = local_app_data.trim();
        if !trimmed.is_empty() {
            dirs.push(
                PathBuf::from(trimmed)
                    .join("krisma-subforge")
                    .join("cache")
                    .join("transcripts"),
            );
        }
    }

    if let Ok(app_data) = std::env::var("APPDATA") {
        let trimmed = app_data.trim();
        if !trimmed.is_empty() {
            dirs.push(
                PathBuf::from(trimmed)
                    .join("krisma-subforge")
                    .join("cache")
                    .join("transcripts"),
            );
        }
    }

    if let Ok(user_profile) = std::env::var("USERPROFILE") {
        let trimmed = user_profile.trim();
        if !trimmed.is_empty() {
            dirs.push(
                PathBuf::from(trimmed)
                    .join("AppData")
                    .join("Local")
                    .join("krisma-subforge")
                    .join("cache")
                    .join("transcripts"),
            );
        }
    }

    dirs.push(
        std::env::temp_dir()
            .join("krisma-subforge")
            .join("cache")
            .join("transcripts"),
    );

    dirs
}

fn file_tree_stats(path: &Path) -> Result<(u64, u64), String> {
    if !path.exists() {
        return Ok((0, 0));
    }

    if path.is_file() {
        let metadata = std::fs::metadata(path)
            .map_err(|e| format!("Falha ao obter metadata de {}: {}", path.display(), e))?;
        return Ok((1, metadata.len()));
    }

    let mut files = 0_u64;
    let mut bytes = 0_u64;

    let entries = std::fs::read_dir(path)
        .map_err(|e| format!("Falha ao ler diretorio {}: {}", path.display(), e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Falha ao ler entrada em {}: {}", path.display(), e))?;
        let entry_path = entry.path();

        if entry_path.is_dir() {
            let (sub_files, sub_bytes) = file_tree_stats(&entry_path)?;
            files += sub_files;
            bytes += sub_bytes;
        } else {
            let metadata = std::fs::metadata(&entry_path).map_err(|e| {
                format!(
                    "Falha ao obter metadata de {}: {}",
                    entry_path.display(),
                    e
                )
            })?;
            files += 1;
            bytes += metadata.len();
        }
    }

    Ok((files, bytes))
}

fn mfa_command_candidates() -> Vec<PathBuf> {
    let local_app_data = std::env::var("LOCALAPPDATA").unwrap_or_default();
    let user_profile = std::env::var("USERPROFILE").unwrap_or_default();

    let mut candidates = vec![];

    if let Some(path_mfa) = find_mfa_on_path() {
        candidates.push(path_mfa);
    }

    if cfg!(target_os = "windows") {
        candidates.push(
            PathBuf::from(&user_profile)
                .join("miniconda3")
                .join("envs")
                .join("aligner")
                .join("Scripts")
                .join("mfa.exe"),
        );
        candidates.push(
            PathBuf::from(&local_app_data)
                .join("miniconda3")
                .join("envs")
                .join("aligner")
                .join("Scripts")
                .join("mfa.exe"),
        );
        candidates.push(
            PathBuf::from(&user_profile)
                .join("anaconda3")
                .join("envs")
                .join("aligner")
                .join("Scripts")
                .join("mfa.exe"),
        );
        candidates.push(
            PathBuf::from(&local_app_data)
                .join("anaconda3")
                .join("envs")
                .join("aligner")
                .join("Scripts")
                .join("mfa.exe"),
        );
    }

    candidates
}

fn find_mfa_on_path() -> Option<PathBuf> {
    let path_var = std::env::var_os("PATH")?;
    let binary_names: &[&str] = if cfg!(target_os = "windows") {
        &["mfa.exe", "mfa.cmd", "mfa.bat"]
    } else {
        &["mfa"]
    };

    for dir in std::env::split_paths(&path_var) {
        for name in binary_names {
            let candidate = dir.join(name);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }

    None
}

fn find_mfa_command() -> Option<PathBuf> {
    for candidate in mfa_command_candidates() {
        if candidate.exists() {
            return Some(candidate);
        }
    }
    None
}

fn mfa_root_candidates() -> Vec<PathBuf> {
    let mut roots: Vec<PathBuf> = Vec::new();

    if let Ok(env_root) = std::env::var("MFA_ROOT_DIR") {
        let trimmed = env_root.trim();
        if !trimmed.is_empty() {
            roots.push(PathBuf::from(trimmed));
        }
    }

    if let Ok(user_profile) = std::env::var("USERPROFILE") {
        roots.push(PathBuf::from(&user_profile).join("Documents").join("MFA"));
    }

    if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
        roots.push(PathBuf::from(&local_app_data).join("Montreal Forced Aligner"));
        roots.push(PathBuf::from(&local_app_data).join("MFA"));
    }

    roots
}

fn has_local_model(model_type: &str, model_name: &str) -> bool {
    let wanted = model_name.to_lowercase();

    for root in mfa_root_candidates() {
        let model_dir = root.join("pretrained_models").join(model_type);
        if !model_dir.is_dir() {
            continue;
        }

        let Ok(entries) = std::fs::read_dir(&model_dir) else {
            continue;
        };

        for entry in entries.flatten() {
            let file_name = entry.file_name();
            let Some(name) = file_name.to_str() else {
                continue;
            };

            if name.to_lowercase().starts_with(&wanted) {
                return true;
            }
        }
    }

    false
}

#[tauri::command]
pub async fn get_settings() -> Result<AppSettings, String> {
    let path = settings_path();
    if !path.exists() {
        return Ok(AppSettings::default());
    }

    let content = std::fs::read_to_string(&path).map_err(|e| format!("Erro ao ler settings: {}", e))?;

    serde_json::from_str(&content).map_err(|e| format!("Erro ao parsear settings: {}", e))
}

#[tauri::command]
pub async fn save_settings(settings: AppSettings) -> Result<(), String> {
    let path = settings_path();
    let content =
        serde_json::to_string_pretty(&settings).map_err(|e| format!("Erro ao serializar settings: {}", e))?;

    std::fs::write(&path, content).map_err(|e| format!("Erro ao salvar settings: {}", e))
}

#[tauri::command]
pub async fn check_mfa_models() -> Result<bool, String> {
    let Some(_mfa_cmd) = find_mfa_command() else {
        return Ok(false);
    };

    let has_dictionary = has_local_model("dictionary", "english_us_arpa");
    let has_acoustic = has_local_model("acoustic", "english_us_arpa");
    Ok(has_dictionary && has_acoustic)
}

#[tauri::command]
pub async fn download_mfa_models() -> Result<(), String> {
    Err(
        "Download automatico de modelos MFA nao esta disponivel neste build. \
Instale manualmente o MFA e baixe os modelos necessarios:\n\
1) conda create -n aligner -c conda-forge montreal-forced-aligner=3.3.9\n\
2) conda activate aligner\n\
3) mfa model download acoustic english_us_arpa\n\
4) mfa model download dictionary english_us_arpa"
            .to_string(),
    )
}

#[tauri::command]
pub async fn clear_gemini_cache() -> Result<CacheCleanupResult, String> {
    let mut removed_files = 0_u64;
    let mut freed_bytes = 0_u64;
    let mut scanned_dirs = 0_u64;

    let mut visited: HashSet<String> = HashSet::new();

    for dir in transcript_cache_dirs() {
        let normalized = dir
            .to_string_lossy()
            .replace('\\', "/")
            .to_ascii_lowercase();

        if !visited.insert(normalized) {
            continue;
        }

        scanned_dirs += 1;

        if !dir.exists() {
            continue;
        }

        let (files, bytes) = file_tree_stats(&dir)?;
        removed_files += files;
        freed_bytes += bytes;

        std::fs::remove_dir_all(&dir)
            .map_err(|e| format!("Falha ao remover cache em {}: {}", dir.display(), e))?;
    }

    Ok(CacheCleanupResult {
        removed_files,
        freed_bytes,
        scanned_dirs,
    })
}

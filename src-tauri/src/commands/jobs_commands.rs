use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProcessingJob {
    pub id: String,
    pub video_path: String,
    pub video_name: String,
    pub created_at: String,
    pub status: String,
    pub srt_path: Option<String>,
    pub segments_count: Option<u32>,
}

fn jobs_path() -> PathBuf {
    let app_dir = dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("krisma-subforge");
    std::fs::create_dir_all(&app_dir).ok();
    app_dir.join("jobs.json")
}

pub fn load_jobs() -> Vec<ProcessingJob> {
    let path = jobs_path();
    if !path.exists() {
        return Vec::new();
    }

    let content = match std::fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return Vec::new(),
    };

    serde_json::from_str(&content).unwrap_or_default()
}

pub fn save_jobs(jobs: &[ProcessingJob]) {
    let path = jobs_path();
    if let Ok(content) = serde_json::to_string_pretty(jobs) {
        std::fs::write(&path, content).ok();
    }
}

pub fn add_job(job: ProcessingJob) {
    let mut jobs = load_jobs();
    jobs.insert(0, job);
    jobs.truncate(50); // Manter últimos 50 jobs
    save_jobs(&jobs);
}

pub fn update_job(id: &str, status: &str, srt_path: Option<&str>, segments_count: Option<u32>) {
    let mut jobs = load_jobs();
    if let Some(job) = jobs.iter_mut().find(|j| j.id == id) {
        job.status = status.to_string();
        if let Some(path) = srt_path {
            job.srt_path = Some(path.to_string());
        }
        if let Some(count) = segments_count {
            job.segments_count = Some(count);
        }
    }
    save_jobs(&jobs);
}

#[tauri::command]
pub async fn list_jobs() -> Result<Vec<ProcessingJob>, String> {
    Ok(load_jobs())
}

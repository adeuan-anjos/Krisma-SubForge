use crate::commands::sidecar_commands::ProcessingOptions;
use serde_json::Value;
use std::io::Write;
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use tauri::{AppHandle, Emitter};

pub struct SidecarManager {
    child: Option<Child>,
    stdin: Option<ChildStdin>,
}

// Programa + argumentos separados para Command::new
struct SidecarCmd {
    program: PathBuf,
    args: Vec<String>,
}

impl SidecarManager {
    pub async fn new(
        app: AppHandle,
        video_path: String,
        options: ProcessingOptions,
    ) -> Result<Self, String> {
        let cmd = Self::find_sidecar_cmd(&app)?;

        let sidecar_cmd_line = if cmd.args.is_empty() {
            cmd.program.display().to_string()
        } else {
            format!("{} {}", cmd.program.display(), cmd.args.join(" "))
        };

        app.emit(
            "subforge://event",
            serde_json::json!({
                "type": "log",
                "level": "info",
                "message": format!("Iniciando sidecar: {}", sidecar_cmd_line),
            }),
        )
        .ok();

        let mut command = Command::new(&cmd.program);
        command
            .args(&cmd.args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .env("PYTHONUTF8", "1")
            .env("PYTHONIOENCODING", "utf-8")
            .env_remove("PYTHONHOME")
            .env_remove("PYTHONPATH")
            .env_remove("CONDA_PREFIX")
            .env_remove("CONDA_DEFAULT_ENV")
            .env_remove("CONDA_PROMPT_MODIFIER")
            .env_remove("CONDA_SHLVL")
            .env_remove("CONDA_EXE")
            .env_remove("CONDA_PYTHON_EXE");

        let mut child = command
            .spawn()
            .map_err(|e| format!("Erro ao iniciar sidecar '{}': {}", cmd.program.display(), e))?;

        let mut stdin = child
            .stdin
            .take()
            .ok_or("Não foi possível capturar stdin do sidecar")?;

        let stdout = child
            .stdout
            .take()
            .ok_or("Não foi possível capturar stdout do sidecar")?;

        // Enviar comando de início
        let payload = serde_json::json!({
            "cmd": "process",
            "video_path": video_path,
            "options": {
                "gemini_key": options.gemini_key,
                "audio_cleanup_enabled": options.audio_cleanup_enabled
            }
        });

        writeln!(stdin, "{}", payload)
            .map_err(|e| format!("Erro ao enviar comando: {}", e))?;

        let stderr = child
            .stderr
            .take()
            .ok_or("Não foi possível capturar stderr do sidecar")?;

        // Thread leitora de stdout → eventos Tauri
        let app_clone = app.clone();
        std::thread::spawn(move || {
            use std::io::{BufRead, BufReader};
            let reader = BufReader::new(stdout);

            for line in reader.lines() {
                match line {
                    Ok(l) if !l.trim().is_empty() => {
                        if let Ok(val) = serde_json::from_str::<Value>(&l) {
                            app_clone.emit("subforge://event", val).ok();
                        } else {
                            app_clone
                                .emit(
                                    "subforge://event",
                                    serde_json::json!({
                                        "type": "log",
                                        "level": "warn",
                                        "message": format!("Saida sidecar nao-JSON: {}", l),
                                    }),
                                )
                                .ok();
                        }
                    }
                    _ => {}
                }
            }
        });

        // Thread lê stderr para evitar deadlock e trazer diagnóstico ao UI
        let app_err = app.clone();
        std::thread::spawn(move || {
            use std::io::{BufRead, BufReader};
            let reader = BufReader::new(stderr);
            for line in reader.lines() {
                if let Ok(l) = line {
                    let text = l.trim();
                    if text.is_empty() {
                        continue;
                    }

                    app_err
                        .emit(
                            "subforge://event",
                            serde_json::json!({
                                "type": "log",
                                "level": "warn",
                                "message": format!("[sidecar stderr] {}", text),
                            }),
                        )
                        .ok();
                }
            }
        });

        Ok(Self {
            child: Some(child),
            stdin: Some(stdin),
        })
    }

    pub fn cancel(mut self) -> Result<(), String> {
        if let Some(mut stdin) = self.stdin.take() {
            let payload = serde_json::json!({"cmd": "cancel"});
            writeln!(stdin, "{}", payload).ok();
        }

        if let Some(mut child) = self.child.take() {
            let _ = child.kill();
            let _ = child.wait();
        }

        Ok(())
    }

    pub fn send_cleanup_decision(&mut self, continue_without_cleanup: bool) -> Result<(), String> {
        let Some(stdin) = self.stdin.as_mut() else {
            return Err("stdin do sidecar indisponivel".to_string());
        };

        let payload = serde_json::json!({
            "cmd": "cleanup_decision",
            "continue_without_cleanup": continue_without_cleanup,
        });

        writeln!(stdin, "{}", payload).map_err(|e| format!("Erro ao enviar decisao de limpeza: {}", e))
    }

    fn find_sidecar_cmd(app: &AppHandle) -> Result<SidecarCmd, String> {
        use tauri::Manager;

        // ── Produção: executável compilado pelo PyInstaller ────────────────────
        // Em `tauri dev` sempre preferimos python-sidecar/main.py para evitar
        // executar binários antigos em cache de resources.
        if !cfg!(debug_assertions) {
            let resource_dir = app
                .path()
                .resource_dir()
                .map_err(|e| format!("Erro ao obter resource dir: {}", e))?;

            let exe_name = if cfg!(target_os = "windows") {
                "subforge-x86_64-pc-windows-msvc.exe"
            } else if cfg!(target_os = "macos") {
                "subforge-aarch64-apple-darwin"
            } else {
                "subforge-x86_64-unknown-linux-gnu"
            };

            let compiled = resource_dir.join(exe_name);
            if compiled.exists() {
                return Ok(SidecarCmd {
                    program: compiled,
                    args: vec![],
                });
            }
        }

        // ── Dev: python do venv + main.py ─────────────────────────────────────
        // current_dir em dev é src-tauri/, então subimos um nível
        let project_root = std::env::current_dir()
            .unwrap_or_default()
            .parent()
            .map(|p| p.to_path_buf())
            .unwrap_or_default();

        let sidecar_dir = project_root.join("python-sidecar");
        let main_py = sidecar_dir.join("main.py");

        if !main_py.exists() {
            return Err(format!(
                "python-sidecar/main.py não encontrado em '{}'",
                sidecar_dir.display()
            ));
        }

        // Tentar venv primeiro
        let venv_python = sidecar_dir.join(if cfg!(target_os = "windows") {
            ".venv/Scripts/python.exe"
        } else {
            ".venv/bin/python"
        });

        let program = if venv_python.exists() {
            venv_python
        } else {
            // Fallback: python do sistema
            PathBuf::from("python")
        };

        Ok(SidecarCmd {
            program,
            args: vec![main_py.to_string_lossy().into_owned()],
        })
    }
}

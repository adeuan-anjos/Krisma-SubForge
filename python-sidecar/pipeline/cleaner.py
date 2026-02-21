"""Limpador de voz com audio-separator (MDX + DirectML)."""
from __future__ import annotations

import logging
import os
import shutil
import subprocess
import tempfile
import threading
import time
from typing import Callable


class VoiceCleaner:
    MODEL_NAME = "UVR_MDXNET_Main.onnx"
    PREVIEW_SUBDIR = "onlyvoice"

    def __init__(
        self,
        on_progress: Callable[[float], None] | None = None,
        on_log: Callable[[str, str], None] | None = None,
    ) -> None:
        self._on_progress = on_progress or (lambda _: None)
        self._on_log = on_log or (lambda level, msg: None)

    def clean_to_asr_wav(self, hq_wav_path: str, source_media_path: str | None = None) -> str:
        model_dir = self._resolve_model_dir(create=True)
        run_dir = tempfile.mkdtemp(prefix="subforge_sep_")
        cleaned_wav_path = self._resolve_clean_output_path(hq_wav_path, source_media_path)

        try:
            self._on_progress(10)
            separator = self._build_separator(model_dir=model_dir, output_dir=run_dir)

            model_path = os.path.join(model_dir, self.MODEL_NAME)
            if os.path.exists(model_path):
                self._on_log("info", f"Modelo de limpeza encontrado localmente: {model_path}")
            else:
                self._on_log("info", "Modelo de limpeza nao encontrado. Baixando automaticamente (primeiro uso)...")

            self._run_with_heartbeat(
                task_name="carregar modelo de limpeza",
                func=lambda: separator.load_model(self.MODEL_NAME),
                progress_start=25.0,
                progress_end=40.0,
                heartbeat_message="Preparando modelo de limpeza...",
            )

            providers = self._normalize_providers(getattr(separator, "onnx_execution_provider", []))
            self._on_log("info", f"Audio cleaner providers: {providers or ['unknown']}")
            if "DmlExecutionProvider" not in providers:
                raise RuntimeError("DirectML nao disponivel para limpeza de voz")

            self._on_log("info", "Iniciando separacao vocal (GPU)...")
            outputs_obj = self._run_with_heartbeat(
                task_name="separacao vocal",
                func=lambda: separator.separate([hq_wav_path]),
                progress_start=45.0,
                progress_end=80.0,
                heartbeat_message="Separacao vocal em andamento...",
            )
            outputs = outputs_obj if isinstance(outputs_obj, list) else []
            if not outputs:
                raise RuntimeError("Separacao vocal nao retornou arquivos")

            vocals_path = self._pick_vocals_output(outputs, run_dir)
            if not vocals_path or not os.path.exists(vocals_path):
                raise RuntimeError("Stem vocal nao encontrado apos separacao")

            self._on_progress(85)
            self._convert_to_16k_mono(vocals_path, cleaned_wav_path)
            self._on_progress(100)
            return cleaned_wav_path
        finally:
            shutil.rmtree(run_dir, ignore_errors=True)

    def _run_with_heartbeat(
        self,
        task_name: str,
        func,
        progress_start: float,
        progress_end: float,
        heartbeat_message: str,
        heartbeat_seconds: float = 8.0,
    ):
        started_at = time.time()
        result_holder: dict[str, object] = {}
        error_holder: dict[str, BaseException] = {}
        done = threading.Event()

        def _worker() -> None:
            try:
                result_holder["value"] = func()
            except BaseException as exc:
                error_holder["error"] = exc
            finally:
                done.set()

        thread = threading.Thread(target=_worker, daemon=True)
        thread.start()

        self._on_progress(progress_start)
        last_log_ts = time.time()
        progress_tick = progress_start

        while not done.wait(timeout=0.3):
            now = time.time()
            if now - last_log_ts >= heartbeat_seconds:
                span = max(0.0, progress_end - progress_start)
                progress_tick = min(progress_end - 0.5, progress_tick + max(1.0, span / 20.0))
                self._on_progress(max(progress_start, progress_tick))
                self._on_log("info", heartbeat_message)
                last_log_ts = now

        thread.join()

        if "error" in error_holder:
            raise RuntimeError(f"Falha em {task_name}: {error_holder['error']}")

        elapsed = time.time() - started_at
        self._on_progress(progress_end)
        self._on_log("info", f"{task_name.capitalize()} concluida em {elapsed:.2f}s")
        return result_holder.get("value")

    def _resolve_clean_output_path(self, hq_wav_path: str, source_media_path: str | None) -> str:
        if source_media_path:
            source_abs = os.path.abspath(source_media_path)
            source_dir = os.path.dirname(source_abs)
            source_base = os.path.splitext(os.path.basename(source_abs))[0]
        else:
            source_abs = os.path.abspath(hq_wav_path)
            source_dir = os.path.dirname(source_abs)
            source_base = os.path.splitext(os.path.basename(source_abs))[0]

        output_dir = os.path.join(source_dir, self.PREVIEW_SUBDIR)
        os.makedirs(output_dir, exist_ok=True)
        return os.path.join(output_dir, f"{source_base}_clean_16k.wav")

    def _build_separator(self, model_dir: str, output_dir: str):
        os.environ.setdefault("TQDM_DISABLE", "1")

        try:
            from audio_separator.separator import Separator  # type: ignore
        except ImportError as exc:
            raise RuntimeError(
                "Dependencia audio-separator indisponivel. Rode setup_env.bat para instalar o limpador de voz."
            ) from exc

        return Separator(
            log_level=logging.WARNING,
            use_directml=True,
            model_file_dir=model_dir,
            output_dir=output_dir,
            output_format="WAV",
        )

    def _resolve_model_dir(self, create: bool) -> str:
        candidates: list[str] = []

        local_app_data = os.environ.get("LOCALAPPDATA", "").strip()
        app_data = os.environ.get("APPDATA", "").strip()
        user_profile = os.environ.get("USERPROFILE", "").strip()

        if local_app_data:
            candidates.append(os.path.join(local_app_data, "krisma-subforge", "models", "audio-separator"))
        if app_data:
            candidates.append(os.path.join(app_data, "krisma-subforge", "models", "audio-separator"))
        if user_profile:
            candidates.append(
                os.path.join(
                    user_profile,
                    "AppData",
                    "Local",
                    "krisma-subforge",
                    "models",
                    "audio-separator",
                )
            )

        candidates.append(os.path.join(tempfile.gettempdir(), "krisma-subforge", "models", "audio-separator"))

        seen: set[str] = set()
        for candidate in candidates:
            normalized = os.path.normpath(candidate)
            if normalized in seen:
                continue
            seen.add(normalized)
            try:
                if create:
                    os.makedirs(normalized, exist_ok=True)
                elif not os.path.isdir(normalized):
                    continue
            except OSError:
                continue
            return normalized

        raise RuntimeError("Nao foi possivel preparar diretorio de modelos do limpador de voz")

    def _normalize_providers(self, providers: object) -> list[str]:
        if isinstance(providers, str):
            return [providers]
        if isinstance(providers, list):
            return [str(item) for item in providers]
        return []

    def _pick_vocals_output(self, outputs: list[str], output_dir: str) -> str | None:
        resolved: list[str] = []
        for item in outputs:
            if os.path.isabs(item):
                resolved.append(item)
            else:
                resolved.append(os.path.join(output_dir, item))

        for candidate in resolved:
            name = os.path.basename(candidate).lower()
            if "(vocals)" in name or "vocals" in name:
                return candidate

        return resolved[0] if resolved else None

    def _convert_to_16k_mono(self, input_path: str, output_path: str) -> None:
        cmd = [
            "ffmpeg",
            "-y",
            "-i",
            input_path,
            "-ac",
            "1",
            "-ar",
            "16000",
            "-sample_fmt",
            "s16",
            output_path,
        ]

        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            tail = (result.stderr or "")[-700:]
            raise RuntimeError(f"Falha ao converter audio limpo para 16 kHz mono: {tail}")

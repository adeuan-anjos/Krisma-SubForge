"""Extrator de audio com perfis ASR e HQ via FFmpeg."""
from __future__ import annotations

import os
import subprocess
import tempfile
import threading
from typing import Callable


class AudioExtractor:
    def __init__(
        self,
        on_progress: Callable[[float], None] | None = None,
        on_log: Callable[[str, str], None] | None = None,
    ) -> None:
        self._on_progress = on_progress or (lambda _: None)
        self._on_log = on_log or (lambda level, msg: None)

    def extract(self, video_path: str) -> str:
        """Compat: extrai no perfil ASR (16 kHz mono)."""
        return self.extract_asr(video_path)

    def extract_asr(self, video_path: str) -> str:
        """Extrai audio pronto para Gemini/MFA: 16 kHz mono."""
        return self._extract_wav(video_path, sample_rate=16000, channels=1, output_suffix="asr")

    def extract_hq(self, video_path: str) -> str:
        """Extrai audio de alta qualidade para separacao vocal: 44.1 kHz stereo."""
        return self._extract_wav(video_path, sample_rate=44100, channels=2, output_suffix="hq")

    def _extract_wav(
        self,
        input_path: str,
        sample_rate: int,
        channels: int,
        output_suffix: str,
    ) -> str:
        """Extrai WAV PCM 16-bit com sample-rate/channels definidos."""
        out_dir = tempfile.mkdtemp(prefix="subforge_")
        base = os.path.splitext(os.path.basename(input_path))[0]
        wav_path = os.path.join(out_dir, f"{base}_{output_suffix}.wav")

        self._on_progress(10)

        # Obter duração para calcular progresso
        duration = self._get_duration(input_path)
        self._on_log("info", f"Duração do vídeo detectada: {duration:.2f}s")

        cmd = [
            "ffmpeg",
            "-i", input_path,
            "-vn",                  # sem video
            "-ar", str(sample_rate),
            "-ac", str(channels),
            "-sample_fmt", "s16",  # PCM 16-bit
            "-f", "wav",
            "-progress", "pipe:1",
            "-y",
            wav_path,
        ]

        self._on_log("info", f"Executando FFmpeg: {' '.join(cmd)}")
        self._on_progress(20)

        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            stdin=subprocess.DEVNULL,
            text=True,
        )

        stderr_lines: list[str] = []

        def _drain_stderr() -> None:
            if process.stderr:
                for line in process.stderr:
                    line = line.rstrip()
                    if line:
                        stderr_lines.append(line)

        t_err = threading.Thread(target=_drain_stderr, daemon=True)
        t_err.start()

        # Ler progresso da stdout (pipe:1)
        if process.stdout:
            for line in process.stdout:
                line = line.strip()
                if line.startswith("out_time_ms=") and duration > 0:
                    try:
                        elapsed_ms = int(line.split("=")[1]) / 1000
                        elapsed_s = elapsed_ms / 1000
                        pct = min(90, 20 + (elapsed_s / duration) * 70)
                        self._on_progress(pct)
                    except (ValueError, ZeroDivisionError):
                        pass

        process.wait()
        t_err.join()

        stderr_output = "\n".join(stderr_lines)
        if stderr_output:
            self._on_log("info", f"FFmpeg stderr: {stderr_output[:2000]}")

        if process.returncode != 0:
            raise RuntimeError(f"FFmpeg falhou (código {process.returncode}): {stderr_output[-500:]}")

        self._on_progress(100)
        return wav_path

    def _get_duration(self, video_path: str) -> float:
        """Retorna duração do vídeo em segundos via ffprobe."""
        try:
            result = subprocess.run(
                [
                    "ffprobe",
                    "-v", "error",
                    "-show_entries", "format=duration",
                    "-of", "default=noprint_wrappers=1:nokey=1",
                    video_path,
                ],
                capture_output=True,
                text=True,
                timeout=10,
            )
            return float(result.stdout.strip())
        except Exception:
            return 0.0

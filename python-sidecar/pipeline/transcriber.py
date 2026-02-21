"""Transcriber: WAV -> lista de segmentos textuais usando Gemini."""
from __future__ import annotations

import hashlib
import json
import os
import tempfile
from datetime import datetime, timezone
from typing import Any, Callable


class TranscriptSegment:
    def __init__(self, text: str) -> None:
        self.text = text

    def to_dict(self) -> dict[str, Any]:
        return {"text": self.text}


class GeminiTranscriber:
    MODEL = "gemini-3-pro-preview"
    PROMPT_VERSION = "v2_strict_text_segments"
    CACHE_SCHEMA_VERSION = 1

    def __init__(
        self,
        api_key: str,
        on_progress: Callable[[float], None] | None = None,
        on_log: Callable[[str, str], None] | None = None,
    ) -> None:
        self.api_key = api_key
        self._on_progress = on_progress or (lambda _: None)
        self._on_log = on_log or (lambda level, msg: None)

    def transcribe(self, wav_path: str) -> list[TranscriptSegment]:
        """Transcreve o WAV e retorna lista de segmentos de texto."""
        # Ler arquivo de áudio
        audio_size_mb = os.path.getsize(wav_path) / (1024 * 1024)
        self._on_log("info", f"Carregando áudio: {wav_path} ({audio_size_mb:.2f} MB)")

        with open(wav_path, "rb") as f:
            audio_bytes = f.read()

        self._on_progress(20)

        prompt = self._prompt_text()
        cache_key = self._build_cache_key(audio_bytes)
        cached_lines = self._load_cached_transcript(cache_key)
        if cached_lines:
            self._on_log("info", f"CACHE HIT transcript key={cache_key}")
            self._on_log("info", f"Transcricao recuperada do cache: {len(cached_lines)} linhas")
            self._on_progress(100)
            return [TranscriptSegment(text=line) for line in cached_lines]

        self._on_log("info", f"CACHE MISS transcript key={cache_key}")

        if not self.api_key:
            raise ValueError(
                "Chave da API Gemini nao configurada. "
                "Va em Configuracoes e insira sua API key."
            )

        try:
            from google import genai  # type: ignore
            from google.genai import types  # type: ignore
        except ImportError:
            raise ImportError(
                "Biblioteca google-genai nao instalada. "
                "Execute: pip install google-genai"
            )

        self._on_log("info", f"Inicializando cliente Gemini (modelo: {self.MODEL})...")
        client = genai.Client(api_key=self.api_key)
        self._on_progress(30)

        self._on_log("info", f"Enviando audio para Gemini ({self.MODEL})... ({audio_size_mb:.2f} MB)")

        try:
            response = client.models.generate_content(
                model=self.MODEL,
                contents=[
                    types.Part.from_bytes(data=audio_bytes, mime_type="audio/wav"),
                    prompt,
                ],
                config=types.GenerateContentConfig(
                    response_mime_type="text/plain",
                    temperature=0.1,
                    max_output_tokens=65536,
                ),
            )
        except Exception as e:
            raise RuntimeError(f"Erro na API Gemini: {e}")

        self._on_progress(85)

        raw = (response.text or "").strip()
        self._on_log("info", f"Resposta recebida. Tamanho: {len(raw)} chars")
        self._on_log("info", f"Primeiros 120 chars: {raw[:120]!r}")

        lines = self._extract_text_lines(raw)
        if not lines:
            raise ValueError("Gemini retornou transcricao vazia.")

        self._save_cached_transcript(cache_key, wav_path, audio_bytes, lines)
        self._on_log("info", f"CACHE MISS saved key={cache_key}")

        self._on_log("info", f"Resposta textual parseada em {len(lines)} linhas uteis")
        segments = [TranscriptSegment(text=line) for line in lines]

        self._on_log("info", f"Transcricao parseada: {len(segments)} segmentos")
        self._on_progress(100)
        return segments

    def _prompt_text(self) -> str:
        return """Listen carefully to this audio and transcribe every spoken word.

Return plain text only (no JSON, no markdown, no explanations).
Format:
- One segment per line
- 1-2 sentences per line
- Preserve natural sentence boundaries
- Do not include music, sound effects, or non-speech labels"""

    def _build_cache_key(self, wav_bytes: bytes) -> str:
        digest = hashlib.sha256()
        digest.update(wav_bytes)
        digest.update(b"\x00")
        digest.update(self.MODEL.encode("utf-8"))
        digest.update(b"\x00")
        digest.update(self.PROMPT_VERSION.encode("utf-8"))
        return digest.hexdigest()

    def _cache_dir_candidates(self) -> list[str]:
        local_app_data = os.environ.get("LOCALAPPDATA", "").strip()
        app_data = os.environ.get("APPDATA", "").strip()
        user_profile = os.environ.get("USERPROFILE", "").strip()

        candidates: list[str] = []
        if local_app_data:
            candidates.append(os.path.join(local_app_data, "krisma-subforge", "cache", "transcripts"))
        if app_data:
            candidates.append(os.path.join(app_data, "krisma-subforge", "cache", "transcripts"))
        if user_profile:
            candidates.append(
                os.path.join(user_profile, "AppData", "Local", "krisma-subforge", "cache", "transcripts")
            )

        candidates.append(os.path.join(tempfile.gettempdir(), "krisma-subforge", "cache", "transcripts"))

        deduped: list[str] = []
        seen: set[str] = set()
        for path in candidates:
            norm = os.path.normpath(path)
            if norm not in seen:
                seen.add(norm)
                deduped.append(norm)

        return deduped

    def _resolve_cache_file_path(self, cache_key: str, create: bool) -> str | None:
        for cache_dir in self._cache_dir_candidates():
            try:
                if create:
                    os.makedirs(cache_dir, exist_ok=True)
                elif not os.path.isdir(cache_dir):
                    continue
            except OSError:
                continue
            return os.path.join(cache_dir, f"{cache_key}.json")
        return None

    def _load_cached_transcript(self, cache_key: str) -> list[str] | None:
        cache_path = self._resolve_cache_file_path(cache_key, create=False)
        if not cache_path or not os.path.exists(cache_path):
            return None

        try:
            with open(cache_path, "r", encoding="utf-8") as f:
                payload = json.load(f)
        except (OSError, json.JSONDecodeError) as exc:
            self._on_log("warn", f"Cache corrompido ({cache_path}): {exc}")
            return None

        if payload.get("schema_version") != self.CACHE_SCHEMA_VERSION:
            return None

        lines = payload.get("transcript_lines")
        if not isinstance(lines, list):
            self._on_log("warn", f"Cache invalido (transcript_lines ausente): {cache_path}")
            return None

        cleaned_lines: list[str] = []
        for line in lines:
            if isinstance(line, str):
                value = line.strip()
                if value:
                    cleaned_lines.append(value)

        if not cleaned_lines:
            return None

        return cleaned_lines

    def _save_cached_transcript(
        self,
        cache_key: str,
        wav_path: str,
        wav_bytes: bytes,
        transcript_lines: list[str],
    ) -> None:
        cache_path = self._resolve_cache_file_path(cache_key, create=True)
        if not cache_path:
            self._on_log("warn", "Nao foi possivel resolver diretorio de cache para transcricao")
            return

        wav_hash = hashlib.sha256(wav_bytes).hexdigest()
        payload = {
            "schema_version": self.CACHE_SCHEMA_VERSION,
            "cache_key": cache_key,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "model": self.MODEL,
            "prompt_version": self.PROMPT_VERSION,
            "wav_sha256": wav_hash,
            "source_wav": os.path.basename(wav_path),
            "transcript_lines": transcript_lines,
        }

        try:
            with open(cache_path, "w", encoding="utf-8") as f:
                json.dump(payload, f, ensure_ascii=False)
        except OSError as exc:
            self._on_log("warn", f"Falha ao salvar cache de transcricao: {exc}")

    def _extract_text_lines(self, raw: str) -> list[str]:
        cleaned = raw.strip()
        if not cleaned:
            return []

        # Tolerar fence markdown caso o modelo desobedeça o prompt.
        if cleaned.startswith("```"):
            fence_lines = cleaned.splitlines()
            if len(fence_lines) >= 3:
                cleaned = "\n".join(fence_lines[1:-1]).strip()
                self._on_log("warn", "Resposta veio com markdown fence; removendo fence.")

        lines: list[str] = []
        for line in cleaned.splitlines():
            value = line.strip()
            if value and value != "```":
                lines.append(value)
        return lines

"""
SubForge Python Sidecar
Orquestrador de pipeline: lê comandos do stdin (JSON), emite eventos no stdout (JSON).
"""
from __future__ import annotations

import json
import sys
import threading
import traceback
from typing import Any

from pipeline.extractor import AudioExtractor
from pipeline.cleaner import VoiceCleaner
from pipeline.transcriber import GeminiTranscriber
from pipeline.aligner import MFAAligner
from pipeline.exporter import SrtExporter


def emit(event: dict[str, Any]) -> None:
    """Emite evento JSON para o stdout (Tauri lê linha a linha)."""
    print(json.dumps(event, ensure_ascii=False), flush=True)


def emit_progress(stage: str, percent: float) -> None:
    emit({"type": "progress", "stage": stage, "percent": percent})


def emit_log(level: str, message: str) -> None:
    emit({"type": "log", "level": level, "message": message})


def emit_error(message: str) -> None:
    emit({"type": "error", "message": message})


def emit_complete(srt_path: str, segments_count: int) -> None:
    emit({"type": "complete", "srt_path": srt_path, "segments_count": segments_count})


def emit_confirm(kind: str, message: str) -> None:
    emit({"type": "confirm", "kind": kind, "message": message})


_cancel_event = threading.Event()
_cleanup_decision_event = threading.Event()
_cleanup_decision_lock = threading.Lock()
_cleanup_continue_decision: bool | None = None


def _reset_cleanup_decision_state() -> None:
    global _cleanup_continue_decision
    with _cleanup_decision_lock:
        _cleanup_continue_decision = None
    _cleanup_decision_event.clear()


def _set_cleanup_decision(should_continue: bool) -> None:
    global _cleanup_continue_decision
    with _cleanup_decision_lock:
        _cleanup_continue_decision = should_continue
    _cleanup_decision_event.set()


def _wait_for_cleanup_decision() -> bool:
    global _cleanup_continue_decision

    while True:
        if _cancel_event.is_set():
            raise RuntimeError("Processamento cancelado durante confirmacao de limpeza de voz.")

        signaled = _cleanup_decision_event.wait(timeout=0.2)
        if not signaled:
            continue

        with _cleanup_decision_lock:
            decision = _cleanup_continue_decision

        if decision is None:
            _cleanup_decision_event.clear()
            continue

        _cleanup_decision_event.clear()
        return decision


def run_pipeline(video_path: str, options: dict[str, Any]) -> None:
    """Executa o pipeline completo."""
    try:
        gemini_key: str = options.get("gemini_key", "")
        audio_cleanup_enabled: bool = bool(options.get("audio_cleanup_enabled", True))
        _reset_cleanup_decision_state()

        emit_log(
            "info",
            f"Pipeline iniciado. video_path={video_path!r}, audio_cleanup_enabled={audio_cleanup_enabled}",
        )

        # ── Etapa 1: Extração de áudio ────────────────────────────────────────
        emit_log("info", "Iniciando extração de áudio...")
        emit_progress("extracting", 0)

        extractor = AudioExtractor(
            on_progress=lambda p: emit_progress("extracting", p),
            on_log=emit_log,
        )
        if audio_cleanup_enabled:
            emit_log("info", "Extraindo audio HQ para limpeza vocal...")
            hq_wav_path = extractor.extract_hq(video_path)
            wav_path = ""
        else:
            emit_log("info", "Extraindo audio ASR (16 kHz mono)...")
            wav_path = extractor.extract_asr(video_path)
            hq_wav_path = ""

        if _cancel_event.is_set():
            emit_log("info", "Processamento cancelado.")
            return

        emit_progress("extracting", 100)
        emit_log("info", f"Áudio extraído: {hq_wav_path or wav_path}")

        # ── Etapa 1.5: Limpeza vocal (opcional, DirectML) ───────────────────
        if audio_cleanup_enabled:
            emit_log("info", "Iniciando limpeza de voz (MDX + DirectML)...")
            emit_progress("cleaning", 0)

            cleaner = VoiceCleaner(
                on_progress=lambda p: emit_progress("cleaning", p),
                on_log=emit_log,
            )

            try:
                wav_path = cleaner.clean_to_asr_wav(hq_wav_path, source_media_path=video_path)
                emit_log("info", f"Áudio limpo pronto: {wav_path}")
                emit_progress("cleaning", 100)
            except Exception as clean_exc:
                emit_log(
                    "warn",
                    f"Limpeza de voz falhou: {clean_exc}",
                )

                emit_confirm(
                    "cleanup_failed",
                    "A limpeza de voz falhou. Deseja continuar sem limpeza?",
                )
                emit_log("info", "Aguardando decisao do usuario para continuar sem limpeza de voz...")

                should_continue_without_cleanup = _wait_for_cleanup_decision()
                if should_continue_without_cleanup:
                    emit_log("info", "Usuario confirmou continuar sem limpeza de voz.")
                    emit_progress("cleaning", 50)

                    fallback_extractor = AudioExtractor(
                        on_progress=lambda p: emit_progress(
                            "cleaning",
                            min(99.0, 50.0 + (max(0.0, min(100.0, p)) * 0.45)),
                        ),
                        on_log=emit_log,
                    )
                    wav_path = fallback_extractor.extract_asr(video_path)

                    emit_progress("cleaning", 100)
                    emit_log("info", f"Audio ASR pronto sem limpeza: {wav_path}")
                else:
                    raise RuntimeError("Limpeza de voz falhou e o usuario optou por nao continuar sem limpeza.")
        else:
            emit_log("info", "Limpeza de voz desativada nas configuracoes.")
            emit_progress("cleaning", 100)

        if _cancel_event.is_set():
            emit_log("info", "Processamento cancelado.")
            return

        # ── Preflight MFA (modo estrito) ─────────────────────────────────────
        emit_log("info", "Validando MFA antes da transcricao Gemini...")
        aligner = MFAAligner(
            on_progress=lambda p: emit_progress("aligning", p),
            on_log=emit_log,
        )
        mfa_exe = aligner.require_mfa_available()
        emit_log("info", f"Preflight MFA OK: {mfa_exe}")

        # ── Etapa 2: Transcrição ──────────────────────────────────────────────
        emit_log("info", "Iniciando transcrição com Gemini...")
        emit_progress("transcribing", 0)

        transcriber = GeminiTranscriber(
            api_key=gemini_key,
            on_progress=lambda p: emit_progress("transcribing", p),
            on_log=emit_log,
        )
        transcript = transcriber.transcribe(wav_path)

        if _cancel_event.is_set():
            return

        emit_progress("transcribing", 100)
        emit_log("info", f"Transcrição concluída: {len(transcript)} segmentos")

        # ── Etapa 3: Alinhamento MFA ──────────────────────────────────────────
        emit_log("info", "Iniciando alinhamento forçado...")
        emit_progress("aligning", 0)
        segments = aligner.align(wav_path, transcript)

        if _cancel_event.is_set():
            return

        emit_progress("aligning", 100)
        emit_log("info", f"Alinhamento concluído: {len(segments)} segmentos")

        # ── Etapa 4: Exportação SRT ───────────────────────────────────────────
        emit_log("info", "Exportando SRT...")
        emit_progress("exporting", 0)

        exporter = SrtExporter(on_log=emit_log)
        srt_path = exporter.export(video_path, segments)

        emit_progress("exporting", 100)
        emit_log("info", f"SRT exportado: {srt_path}")

        emit_complete(srt_path, len(segments))

    except Exception as exc:
        emit_error(str(exc))
        emit_log("error", traceback.format_exc())


def main() -> None:
    """Loop principal: lê comandos JSON do stdin."""
    emit_log("info", "SubForge sidecar iniciado. Aguardando comandos no stdin...")

    for raw_line in sys.stdin:
        line = raw_line.strip()
        if not line:
            continue

        try:
            cmd = json.loads(line)
        except json.JSONDecodeError as e:
            emit_error(f"JSON inválido: {e}")
            continue

        action = cmd.get("cmd", "")
        emit_log("info", f"Comando recebido: {action!r} — payload: {json.dumps(cmd, ensure_ascii=False)[:300]}")

        if action == "process":
            _cancel_event.clear()
            video_path = cmd.get("video_path", "")
            options = cmd.get("options", {})

            def pipeline_thread_target() -> None:
                try:
                    run_pipeline(video_path, options)
                except Exception:
                    emit_log("error", f"Exceção não capturada na thread do pipeline:\n{traceback.format_exc()}")

            thread = threading.Thread(
                target=pipeline_thread_target,
                daemon=True,
            )
            thread.start()

        elif action == "cancel":
            _cancel_event.set()
            emit_log("info", "Cancelamento solicitado.")

        elif action == "cleanup_decision":
            should_continue = cmd.get("continue_without_cleanup")
            if isinstance(should_continue, bool):
                _set_cleanup_decision(should_continue)
                emit_log(
                    "info",
                    f"Decisao de limpeza recebida: continuar_sem_limpeza={should_continue}",
                )
            else:
                emit_error("Comando cleanup_decision invalido: campo continue_without_cleanup ausente")

        else:
            emit_error(f"Comando desconhecido: {action}")


if __name__ == "__main__":
    main()

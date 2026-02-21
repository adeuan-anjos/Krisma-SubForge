"""
Exportador: lista de AlignedSegment → arquivo SRT.
"""
from __future__ import annotations

import os
from typing import Callable

from .aligner import AlignedSegment


def ms_to_srt_time(ms: int) -> str:
    """Converte milissegundos para formato SRT: HH:MM:SS,mmm"""
    h = ms // 3_600_000
    m = (ms % 3_600_000) // 60_000
    s = (ms % 60_000) // 1_000
    millis = ms % 1_000
    return f"{h:02d}:{m:02d}:{s:02d},{millis:03d}"


class SrtExporter:
    def __init__(self, on_log: Callable[[str, str], None] | None = None) -> None:
        self._on_log = on_log or (lambda level, msg: None)

    def export(self, video_path: str, segments: list[AlignedSegment]) -> str:
        """Gera SRT a partir dos segmentos e salva ao lado do vídeo."""
        base = os.path.splitext(video_path)[0]
        srt_path = f"{base}.srt"

        self._on_log("info", f"Exportando SRT para: {srt_path} ({len(segments)} segmentos)")

        lines: list[str] = []
        for seg in segments:
            lines.append(str(seg.index))
            lines.append(f"{ms_to_srt_time(seg.start_ms)} --> {ms_to_srt_time(seg.end_ms)}")
            lines.append(seg.text)
            lines.append("")  # linha em branco entre blocos

        srt_content = "\n".join(lines)

        with open(srt_path, "w", encoding="utf-8") as f:
            f.write(srt_content)

        self._on_log("info", f"SRT salvo: {srt_path}")
        return srt_path

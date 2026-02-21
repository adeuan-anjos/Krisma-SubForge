"""Aligner: usa MFA (Montreal Forced Aligner) de forma obrigatoria."""
from __future__ import annotations

import math
import os
import re
import shutil
import subprocess
import tempfile
import threading
from dataclasses import dataclass
from difflib import SequenceMatcher
from typing import Any, Callable

from .transcriber import TranscriptSegment


class AlignedSegment:
    def __init__(self, index: int, start_ms: int, end_ms: int, text: str) -> None:
        self.index = index
        self.start_ms = start_ms
        self.end_ms = end_ms
        self.text = text

    def to_dict(self) -> dict[str, Any]:
        return {
            "index": self.index,
            "start_ms": self.start_ms,
            "end_ms": self.end_ms,
            "text": self.text,
        }


_SILENCE_LABELS = {"", "sp", "sil", "<eps>", "<unk>"}
_EDGE_STRIP = ".,;:!?\"()[]{}"


@dataclass
class _TokenUnit:
    display: str
    norm: str
    start_ms: int
    end_ms: int


@dataclass
class _CueDraft:
    start_word: int
    end_word: int
    text: str
    chars: int


def _normalize_token(text: str) -> str:
    cleaned = text.strip(_EDGE_STRIP).strip().lower().replace("’", "'")
    cleaned = re.sub(r"^[^a-z0-9']+", "", cleaned)
    cleaned = re.sub(r"[^a-z0-9']+$", "", cleaned)
    return cleaned


def _tokenize_with_display(text: str) -> list[tuple[str, str]]:
    tokens: list[tuple[str, str]] = []
    for raw in text.split():
        display = raw.strip()
        norm = _normalize_token(display)
        if norm:
            tokens.append((display, norm))
    return tokens


def _ends_natural_break(token: str) -> bool:
    stripped = token.rstrip("\"')]")
    return stripped.endswith((".", "!", "?", ";", ":", ","))


def _cue_char_count(text: str) -> int:
    return len(text.replace("\n", ""))


class MFAAligner:
    BEAM = 400
    RETRY_BEAM = 4000
    SPEAKER = "speaker1"
    MAX_CPS = 20.0
    MAX_LINE_CHARS = 42
    MAX_CUE_LINES = 2
    MIN_CUE_MS = 1000
    MAX_CUE_MS = 6000
    MIN_GAP_MS = 100

    def __init__(
        self,
        on_progress: Callable[[float], None] | None = None,
        on_log: Callable[[str, str], None] | None = None,
    ) -> None:
        self._on_progress = on_progress or (lambda _: None)
        self._on_log = on_log or (lambda level, msg: None)

    def align(
        self,
        wav_path: str,
        transcript: list[TranscriptSegment],
    ) -> list[AlignedSegment]:
        mfa_exe = self.require_mfa_available()
        self._on_log("info", f"MFA encontrado: {mfa_exe}")
        return self._align_mfa(mfa_exe, wav_path, transcript)

    def require_mfa_available(self) -> str:
        self._on_log("info", "Validando instalacao do MFA...")
        mfa_exe = self._find_mfa_exe()
        if not mfa_exe:
            raise RuntimeError(
                "MFA e obrigatorio para gerar timestamps. "
                "Instale com: conda create -n aligner -c conda-forge montreal-forced-aligner=3.3.9"
            )

        self._on_log("info", f"MFA executavel encontrado: {mfa_exe}")
        self._on_log("info", "Verificando modelos locais MFA english_us_arpa...")

        dictionary_path = self._find_local_model("dictionary", "english_us_arpa")
        acoustic_path = self._find_local_model("acoustic", "english_us_arpa")
        if not dictionary_path or not acoustic_path:
            roots = self._model_root_candidates()
            roots_text = ", ".join(roots) if roots else "nenhum root detectado"
            raise RuntimeError(
                "Modelos locais english_us_arpa nao encontrados para MFA. "
                "Instale com: mfa model download acoustic english_us_arpa && "
                "mfa model download dictionary english_us_arpa. "
                f"Roots verificados: {roots_text}"
            )

        self._on_log("info", f"Modelo dictionary OK: {dictionary_path}")
        self._on_log("info", f"Modelo acoustic OK: {acoustic_path}")

        return mfa_exe

    def _mfa_env(self, mfa_exe: str) -> dict[str, str]:
        env = os.environ.copy()
        env["PYTHONUNBUFFERED"] = "1"
        env["TERM"] = "dumb"
        env["NO_COLOR"] = "1"

        exe_norm = os.path.normpath(mfa_exe)
        exe_dir = os.path.dirname(exe_norm)
        if exe_dir and os.path.basename(exe_dir).lower() == "scripts":
            env_root = os.path.dirname(exe_dir)
            conda_bins = [
                env_root,
                os.path.join(env_root, "Library", "mingw-w64", "bin"),
                os.path.join(env_root, "Library", "usr", "bin"),
                os.path.join(env_root, "Library", "bin"),
                os.path.join(env_root, "Scripts"),
            ]
            existing = [p for p in conda_bins if os.path.isdir(p)]
            if existing:
                current = env.get("PATH", "")
                env["PATH"] = os.pathsep.join(existing + ([current] if current else []))

        return env

    def _model_root_candidates(self) -> list[str]:
        roots: list[str] = []

        mfa_root_env = os.environ.get("MFA_ROOT_DIR", "").strip()
        if mfa_root_env:
            roots.append(mfa_root_env)

        up = os.environ.get("USERPROFILE", "")
        lad = os.environ.get("LOCALAPPDATA", "")
        if up:
            roots.append(os.path.join(up, "Documents", "MFA"))
        if lad:
            roots.append(os.path.join(lad, "Montreal Forced Aligner"))
            roots.append(os.path.join(lad, "MFA"))

        seen: set[str] = set()
        ordered: list[str] = []
        for root in roots:
            norm = os.path.normpath(root)
            if norm not in seen:
                seen.add(norm)
                ordered.append(norm)

        return ordered

    def _find_local_model(self, model_type: str, model_name: str) -> str | None:
        wanted = model_name.lower()
        for root in self._model_root_candidates():
            model_dir = os.path.join(root, "pretrained_models", model_type)
            if not os.path.isdir(model_dir):
                continue

            try:
                entries = os.listdir(model_dir)
            except OSError:
                continue

            for entry in entries:
                if entry.lower().startswith(wanted):
                    return os.path.join(model_dir, entry)

        return None

    def _find_mfa_exe(self) -> str | None:
        found = shutil.which("mfa")
        if found:
            return found

        lad = os.environ.get("LOCALAPPDATA", "")
        up = os.environ.get("USERPROFILE", "")
        candidates = [
            os.path.join(up, "miniconda3", "envs", "aligner", "Scripts", "mfa.exe"),
            os.path.join(lad, "miniconda3", "envs", "aligner", "Scripts", "mfa.exe"),
            os.path.join(up, "anaconda3", "envs", "aligner", "Scripts", "mfa.exe"),
            os.path.join(lad, "anaconda3", "envs", "aligner", "Scripts", "mfa.exe"),
            os.path.join(up, "miniconda3", "Scripts", "mfa.exe"),
            os.path.join(up, "anaconda3", "Scripts", "mfa.exe"),
        ]

        for candidate in candidates:
            if os.path.exists(candidate):
                return candidate

        return None

    def _align_mfa(
        self,
        mfa_exe: str,
        wav_path: str,
        transcript: list[TranscriptSegment],
    ) -> list[AlignedSegment]:
        self._on_log("info", "Preparando corpus MFA (formato speaker/file)...")
        self._on_progress(5)

        tmp_dir = tempfile.mkdtemp(prefix="subforge_mfa_")
        speaker_dir = os.path.join(tmp_dir, "corpus", self.SPEAKER)
        out_dir = os.path.join(tmp_dir, "output")
        os.makedirs(speaker_dir, exist_ok=True)
        os.makedirs(out_dir, exist_ok=True)

        try:
            wav_dest = os.path.join(speaker_dir, "audio.wav")
            shutil.copy2(wav_path, wav_dest)

            full_text = " ".join(s.text for s in transcript)
            lab_path = os.path.join(speaker_dir, "audio.lab")
            with open(lab_path, "w", encoding="utf-8") as f:
                f.write(full_text)

            self._on_log("info", f".lab: {full_text[:120]}...")
            self._on_progress(15)

            corpus_dir = os.path.join(tmp_dir, "corpus")
            cmd = [
                mfa_exe,
                "align",
                corpus_dir,
                "english_us_arpa",
                "english_us_arpa",
                out_dir,
                "--clean",
                "--beam",
                str(self.BEAM),
                "--retry_beam",
                str(self.RETRY_BEAM),
                "--fine_tune",
                "--single_speaker",
                "--output_format",
                "long_textgrid",
                "--include_original_text",
            ]

            self._on_log("info", f"Executando MFA (beam={self.BEAM}, retry={self.RETRY_BEAM}, fine_tune=True):")
            self._on_log("info", " ".join(cmd))
            self._on_progress(20)

            env = self._mfa_env(mfa_exe)

            proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                stdin=subprocess.DEVNULL,
                text=True,
                encoding="utf-8",
                errors="replace",
                env=env,
            )

            stderr_lines: list[str] = []

            def _stream(pipe, lines: list[str], level: str) -> None:
                for line in pipe:
                    line = line.rstrip()
                    if line:
                        lines.append(line)
                        self._on_log(level, f"[MFA] {line}")

            t_out = threading.Thread(target=_stream, args=(proc.stdout, [], "info"))
            t_err = threading.Thread(target=_stream, args=(proc.stderr, stderr_lines, "info"))
            t_out.start()
            t_err.start()

            try:
                proc.wait(timeout=600)
            except subprocess.TimeoutExpired:
                proc.kill()
                raise RuntimeError("MFA excedeu 10 minutos.")

            t_out.join()
            t_err.join()
            self._on_progress(80)

            if proc.returncode != 0:
                raise RuntimeError(f"MFA retornou codigo {proc.returncode}.\n" + "\n".join(stderr_lines[-15:]))

            tg_path = os.path.join(out_dir, self.SPEAKER, "audio.TextGrid")
            if not os.path.exists(tg_path):
                for root, _, files in os.walk(out_dir):
                    for fname in files:
                        if fname.endswith(".TextGrid"):
                            tg_path = os.path.join(root, fname)
                            self._on_log("info", f"TextGrid encontrado em: {tg_path}")
                            break

            if not os.path.exists(tg_path):
                raise RuntimeError(f"TextGrid nao encontrado em {out_dir}")

            self._on_log("info", f"Parseando TextGrid: {tg_path}")
            segments = self._parse_textgrid(tg_path, transcript)
            self._on_progress(100)
            self._on_log("info", "Alinhamento MFA concluido com sucesso.")
            return segments

        finally:
            shutil.rmtree(tmp_dir, ignore_errors=True)

    def _parse_textgrid(
        self,
        tg_path: str,
        transcript: list[TranscriptSegment],
    ) -> list[AlignedSegment]:
        try:
            from praatio import textgrid as tgio  # type: ignore
        except ImportError as e:
            raise RuntimeError(
                "Dependencia 'praatio' nao encontrada para parse do TextGrid. "
                "Reinstale o ambiente do sidecar Python (setup_env.bat)."
            ) from e

        tg = tgio.openTextgrid(tg_path, includeEmptyIntervals=True)
        word_tier = self._extract_word_tier(tg)

        mfa_words: list[dict[str, Any]] = []
        for entry in getattr(word_tier, "entries", []):
            label = str(getattr(entry, "label", "")).strip()
            if label.lower() in _SILENCE_LABELS:
                continue

            start_s = float(getattr(entry, "start", 0.0))
            end_s = float(getattr(entry, "end", 0.0))
            if end_s < start_s:
                end_s = start_s

            norm = _normalize_token(label)
            if not norm:
                continue

            mfa_words.append(
                {
                    "label": label,
                    "norm": norm,
                    "start_ms": int(start_s * 1000),
                    "end_ms": int(end_s * 1000),
                }
            )

        if not mfa_words:
            raise RuntimeError("TextGrid sem palavras alinhadas pelo MFA.")

        transcript_tokens: list[tuple[str, str]] = []
        for seg in transcript:
            transcript_tokens.extend(_tokenize_with_display(seg.text))

        if not transcript_tokens:
            raise RuntimeError("Transcricao vazia apos segmentacao textual do Gemini.")

        self._on_log("info", f"Palavras Gemini: {len(transcript_tokens)} | Palavras MFA alinhadas: {len(mfa_words)}")

        mapped_indices = self._build_monotonic_mapping(transcript_tokens, mfa_words)

        token_units: list[_TokenUnit] = []
        matched_exact = 0
        for i, (display, norm) in enumerate(transcript_tokens):
            mfa_idx = mapped_indices[i]
            mfa_word = mfa_words[mfa_idx]
            if norm == mfa_word["norm"]:
                matched_exact += 1
            token_units.append(
                _TokenUnit(
                    display=display,
                    norm=norm,
                    start_ms=int(mfa_word["start_ms"]),
                    end_ms=int(mfa_word["end_ms"]),
                )
            )

        self._on_log(
            "info",
            f"Mapeamento monotonic Gemini->MFA: {matched_exact}/{len(token_units)} tokens com match exato",
        )

        cue_drafts = self._draft_netflix_cues(token_units)
        timed_cues = self._apply_timing_constraints(cue_drafts, token_units)

        segments: list[AlignedSegment] = []
        for idx, cue in enumerate(timed_cues, start=1):
            segments.append(
                AlignedSegment(
                    index=idx,
                    start_ms=cue["start_ms"],
                    end_ms=cue["end_ms"],
                    text=cue["text"],
                )
            )

        self._on_log("info", f"Cues Netflix gerados: {len(segments)}")
        return segments

    def _extract_word_tier(self, tg: Any) -> Any:
        tier_names: list[str] = []
        for attr in ("tierNames", "tierNameList"):
            value = getattr(tg, attr, None)
            if value:
                tier_names.extend([str(v) for v in value])

        if not tier_names:
            for tier in list(getattr(tg, "tiers", [])):
                name = getattr(tier, "name", None)
                if isinstance(name, str) and name:
                    tier_names.append(name)

        seen: set[str] = set()
        ordered: list[str] = []
        for name in tier_names:
            if name not in seen:
                seen.add(name)
                ordered.append(name)

        for name in ordered:
            if "word" in name.lower():
                self._on_log("info", f"Usando tier: '{name}'")
                return tg.getTier(name)

        tiers = list(getattr(tg, "tiers", []))
        if len(tiers) == 1:
            fallback_name = getattr(tiers[0], "name", "<sem nome>")
            self._on_log(
                "warn",
                f"Tier 'words' nao encontrado; usando unico tier disponivel: '{fallback_name}'",
            )
            return tiers[0]

        raise RuntimeError(f"Tier de palavras nao encontrado no TextGrid. Tiers disponiveis: {ordered}")

    def _build_monotonic_mapping(
        self,
        transcript_tokens: list[tuple[str, str]],
        mfa_words: list[dict[str, Any]],
    ) -> list[int]:
        a = [norm for _, norm in transcript_tokens]
        b = [str(w["norm"]) for w in mfa_words]
        max_mfa_idx = len(b) - 1

        matcher = SequenceMatcher(None, a, b, autojunk=False)
        mapped: list[int | None] = [None] * len(a)
        for block in matcher.get_matching_blocks():
            if block.size <= 0:
                continue
            for offset in range(block.size):
                mapped[block.a + offset] = block.b + offset

        if all(value is None for value in mapped):
            if len(a) == 1:
                return [0]
            result: list[int] = []
            for i in range(len(a)):
                frac = i / max(len(a) - 1, 1)
                idx = int(round(frac * max_mfa_idx))
                result.append(max(0, min(max_mfa_idx, idx)))
            return result

        prev_known: list[tuple[int, int] | None] = [None] * len(mapped)
        next_known: list[tuple[int, int] | None] = [None] * len(mapped)

        current: tuple[int, int] | None = None
        for i in range(len(mapped)):
            if mapped[i] is not None:
                current = (i, int(mapped[i]))
            prev_known[i] = current

        current = None
        for i in range(len(mapped) - 1, -1, -1):
            if mapped[i] is not None:
                current = (i, int(mapped[i]))
            next_known[i] = current

        filled: list[int] = [0] * len(mapped)
        for i in range(len(mapped)):
            if mapped[i] is not None:
                filled[i] = int(mapped[i])
                continue

            left = prev_known[i]
            right = next_known[i]

            if left and right and right[0] != left[0]:
                ratio = (i - left[0]) / (right[0] - left[0])
                guess = left[1] + ratio * (right[1] - left[1])
                filled[i] = int(round(guess))
            elif left:
                filled[i] = left[1]
            elif right:
                filled[i] = right[1]
            else:
                filled[i] = 0

        last = 0
        for i in range(len(filled)):
            value = max(last, filled[i])
            value = max(0, min(max_mfa_idx, value))
            filled[i] = value
            last = value

        return filled

    def _draft_netflix_cues(self, token_units: list[_TokenUnit]) -> list[_CueDraft]:
        drafts: list[_CueDraft] = []
        cursor = 0
        total = len(token_units)

        while cursor < total:
            best: _CueDraft | None = None
            candidate_words: list[str] = []

            for end_idx in range(cursor, total):
                candidate_words.append(token_units[end_idx].display)
                formatted = self._format_two_lines(candidate_words)
                if formatted is None:
                    break

                start_ms = token_units[cursor].start_ms
                end_ms = token_units[end_idx].end_ms
                span_ms = max(1, end_ms - start_ms)
                chars = _cue_char_count(formatted)
                min_cps_duration_ms = int(math.ceil((chars / self.MAX_CPS) * 1000.0))

                if min_cps_duration_ms > self.MAX_CUE_MS:
                    break

                if span_ms > self.MAX_CUE_MS and best is not None:
                    break

                score = 0.0
                if _ends_natural_break(token_units[end_idx].display):
                    score += 4.0
                if span_ms <= self.MAX_CUE_MS:
                    score += 1.0
                score -= abs(3000.0 - float(span_ms)) / 2500.0

                draft = _CueDraft(
                    start_word=cursor,
                    end_word=end_idx,
                    text=formatted,
                    chars=chars,
                )
                if best is None or score >= self._score_draft(best, token_units):
                    best = draft

            if best is None:
                word = token_units[cursor].display
                best = _CueDraft(start_word=cursor, end_word=cursor, text=word, chars=len(word))

            drafts.append(best)
            cursor = best.end_word + 1

        return drafts

    def _score_draft(self, draft: _CueDraft, token_units: list[_TokenUnit]) -> float:
        start_ms = token_units[draft.start_word].start_ms
        end_ms = token_units[draft.end_word].end_ms
        span_ms = max(1, end_ms - start_ms)

        score = 0.0
        if _ends_natural_break(token_units[draft.end_word].display):
            score += 4.0
        if span_ms <= self.MAX_CUE_MS:
            score += 1.0
        score -= abs(3000.0 - float(span_ms)) / 2500.0
        return score

    def _format_two_lines(self, words: list[str]) -> str | None:
        text = " ".join(words).strip()
        if not text:
            return None

        if len(text) <= self.MAX_LINE_CHARS:
            return text

        best_text: str | None = None
        best_score: float | None = None
        for split in range(1, len(words)):
            left = " ".join(words[:split]).strip()
            right = " ".join(words[split:]).strip()
            if not left or not right:
                continue
            if len(left) > self.MAX_LINE_CHARS or len(right) > self.MAX_LINE_CHARS:
                continue

            score = float(abs(len(left) - len(right)))
            if _ends_natural_break(words[split - 1]):
                score -= 2.0

            if best_score is None or score < best_score:
                best_score = score
                best_text = f"{left}\n{right}"

        return best_text

    def _apply_timing_constraints(
        self,
        cue_drafts: list[_CueDraft],
        token_units: list[_TokenUnit],
    ) -> list[dict[str, Any]]:
        cues: list[dict[str, Any]] = []
        prev_end = -self.MIN_GAP_MS

        for draft in cue_drafts:
            first_word_start = token_units[draft.start_word].start_ms
            last_word_end = token_units[draft.end_word].end_ms

            start_ms = max(first_word_start, prev_end + self.MIN_GAP_MS)

            min_for_cps = int(math.ceil((draft.chars / self.MAX_CPS) * 1000.0))
            target_end = max(last_word_end, start_ms + self.MIN_CUE_MS, start_ms + min_for_cps)
            end_ms = min(start_ms + self.MAX_CUE_MS, target_end)
            end_ms = max(end_ms, last_word_end)

            if end_ms <= start_ms:
                end_ms = start_ms + 1

            cues.append(
                {
                    "start_ms": int(start_ms),
                    "end_ms": int(end_ms),
                    "text": draft.text,
                }
            )
            prev_end = int(end_ms)

        return cues

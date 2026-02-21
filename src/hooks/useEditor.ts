import { useCallback, useEffect, useState } from "react";
import { readSrt, saveSrt } from "@/lib/ipc";
import type { SrtSegment } from "@/lib/types";
import { formatTimestamp } from "@/lib/types";

export function useEditor(srtPath: string) {
  const [segments, setSegments] = useState<SrtSegment[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!srtPath) return;
    readSrt(srtPath)
      .then((segs) => {
        setSegments(segs);
        setIsDirty(false);
      })
      .catch((e) => setError(String(e)));
  }, [srtPath]);

  const updateSegmentText = useCallback((index: number, text: string) => {
    setSegments((prev) =>
      prev.map((s) => (s.index === index ? { ...s, text } : s))
    );
    setIsDirty(true);
  }, []);

  const selectSegment = useCallback((index: number) => {
    setSelectedIndex(index);
  }, []);

  async function exportSrt(): Promise<string | null> {
    setIsSaving(true);
    setError(null);
    try {
      const content = buildSrtContent(segments);
      const videoName = srtPath.split(/[\\/]/).pop()?.replace(/\.srt$/i, ".srt") ?? "legenda.srt";
      const saved = await saveSrt(content, videoName);
      if (saved) setIsDirty(false);
      return saved;
    } catch (e) {
      setError(String(e));
      return null;
    } finally {
      setIsSaving(false);
    }
  }

  return {
    segments,
    selectedIndex,
    isDirty,
    isSaving,
    saveError,
    updateSegmentText,
    selectSegment,
    exportSrt,
  };
}

function buildSrtContent(segments: SrtSegment[]): string {
  return segments
    .map(
      (s) =>
        `${s.index}\n${formatTimestamp(s.start_ms)} --> ${formatTimestamp(s.end_ms)}\n${s.text}\n`
    )
    .join("\n");
}

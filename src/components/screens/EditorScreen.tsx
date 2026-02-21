import { useRef, useState, useCallback, useEffect } from "react";
import {
  Subtitles,
  Download,
  FolderOpen,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Play,
  Pause,
} from "lucide-react";
import { AppHeader } from "../layout/AppHeader";
import { Button } from "../ui/button";
import { cn } from "@/lib/utils";
import { useEditor } from "@/hooks/useEditor";
import { openInExplorer } from "@/lib/ipc";
import { formatTimestamp } from "@/lib/types";
import type { AppScreen } from "@/lib/types";

// Converte asset:// URL para o vídeo no Tauri
function getVideoUrl(path: string): string {
  if (!path) return "";
  // No Tauri, protocol "asset://" serve arquivos locais
  const normalized = path.replace(/\\/g, "/");
  return `asset://localhost/${normalized.replace(/^\//, "")}`;
}

interface ResizeHandle {
  isDragging: boolean;
  startX: number;
  startWidth: number;
}

interface EditorScreenProps {
  videoPath: string;
  srtPath: string;
  onNavigate: (screen: AppScreen) => void;
}

export function EditorScreen({ videoPath, srtPath, onNavigate: _ }: EditorScreenProps) {
  const {
    segments,
    selectedIndex,
    isDirty,
    isSaving,
    saveError,
    updateSegmentText,
    selectSegment,
    exportSrt,
  } = useEditor(srtPath);

  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  // Largura do painel esquerdo (player)
  const [playerWidth, setPlayerWidth] = useState(50); // percentual
  const resizeRef = useRef<ResizeHandle | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const videoName = videoPath.split(/[\\/]/).pop() ?? videoPath;

  // Seek no player ao selecionar segmento
  useEffect(() => {
    if (selectedIndex === null || !videoRef.current) return;
    const seg = segments.find((s) => s.index === selectedIndex);
    if (seg) {
      videoRef.current.currentTime = seg.start_ms / 1000;
    }
  }, [selectedIndex, segments]);

  // Destacar segmento atual durante reprodução
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    function onTimeUpdate() {
      setCurrentTime(video!.currentTime * 1000);
    }
    function onPlay() {
      setIsPlaying(true);
    }
    function onPause() {
      setIsPlaying(false);
    }

    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);

    return () => {
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
    };
  }, []);

  function togglePlay() {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
  }

  // ── Resize do split ────────────────────────────────────────────────────────
  const onMouseDownResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      resizeRef.current = {
        isDragging: true,
        startX: e.clientX,
        startWidth: playerWidth,
      };
    },
    [playerWidth]
  );

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!resizeRef.current?.isDragging || !containerRef.current) return;
      const containerW = containerRef.current.offsetWidth;
      const delta = e.clientX - resizeRef.current.startX;
      const newWidth = Math.min(
        75,
        Math.max(25, resizeRef.current.startWidth + (delta / containerW) * 100)
      );
      setPlayerWidth(newWidth);
    }
    function onMouseUp() {
      if (resizeRef.current) resizeRef.current.isDragging = false;
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  async function handleExport() {
    await exportSrt();
  }

  async function handleOpenFolder() {
    await openInExplorer(srtPath || videoPath);
  }

  const activeSegmentIndex = segments.find(
    (s) => currentTime >= s.start_ms && currentTime <= s.end_ms
  )?.index ?? null;

  return (
    <div className="relative flex flex-col flex-1 overflow-hidden">
      {/* Background */}
      <div className="bg-chess-pattern board-pattern absolute inset-0 pointer-events-none gpu-accelerated" />

      <AppHeader
        title={videoName}
        subtitle="editor de legendas"
        icon={Subtitles}
        actions={
          <>
            {saveError && (
              <div className="flex items-center gap-1.5 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5" />
                {saveError}
              </div>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={handleOpenFolder}
            >
              <FolderOpen className="h-3.5 w-3.5" />
              Abrir pasta
            </Button>
            <Button
              variant={isDirty ? "default" : "outline"}
              size="sm"
              onClick={handleExport}
              disabled={isSaving || segments.length === 0}
            >
              {isSaving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : isDirty ? (
                <Download className="h-3.5 w-3.5" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              {isSaving ? "Salvando..." : "Exportar SRT"}
            </Button>
          </>
        }
      />

      {/* Split view */}
      <div
        ref={containerRef}
        className="relative z-10 flex flex-1 overflow-hidden"
      >
        {/* Painel esquerdo — player */}
        <div
          className="flex flex-col overflow-hidden"
          style={{ width: `${playerWidth}%` }}
        >
          <div className="flex-1 flex flex-col items-center justify-center bg-black/40 p-4 gap-3">
            {videoPath ? (
              <>
                <video
                  ref={videoRef}
                  src={getVideoUrl(videoPath)}
                  className="max-h-full max-w-full rounded-lg object-contain"
                  controls={false}
                  preload="metadata"
                />
                {/* Controles customizados */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={togglePlay}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-foreground hover:bg-white/[0.10] transition-colors"
                  >
                    {isPlaying ? (
                      <Pause className="h-3.5 w-3.5" />
                    ) : (
                      <Play className="h-3.5 w-3.5 ml-0.5" />
                    )}
                  </button>
                  <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
                    {formatTimestamp(Math.round(currentTime))}
                  </span>
                </div>
              </>
            ) : (
              <div className="text-xs text-muted-foreground/50">
                Vídeo não disponível
              </div>
            )}
          </div>
        </div>

        {/* Handle de resize */}
        <div
          onMouseDown={onMouseDownResize}
          className="group w-2 cursor-col-resize bg-white/5 hover:bg-primary/20 active:bg-primary/30 z-10 flex items-center justify-center transition-colors"
        >
          <div className="h-8 w-0.5 rounded-full bg-white/20 group-hover:bg-primary/50 transition-colors" />
        </div>

        {/* Painel direito — lista de segmentos */}
        <div className="flex flex-col flex-1 overflow-hidden border-l border-white/[0.06]">
          {/* Header da lista */}
          <div className="flex items-center gap-2 border-b border-white/10 bg-card/50 px-4 py-2">
            <span className="text-[11px] text-muted-foreground">
              <span className="font-medium text-foreground/70">Segmentos</span>
              <span className="mx-1.5 text-white/20">·</span>
              <span className="tabular-nums">{segments.length} linhas</span>
            </span>
          </div>

          {/* Segmentos */}
          <div className="flex-1 overflow-y-auto divide-y divide-white/[0.05]">
            {segments.length === 0 && (
              <div className="flex items-center justify-center py-12 text-xs text-muted-foreground">
                Nenhum segmento carregado.
              </div>
            )}

            {segments.map((seg) => {
              const isSelected = selectedIndex === seg.index;
              const isActive = activeSegmentIndex === seg.index;

              return (
                <div
                  key={seg.index}
                  onClick={() => selectSegment(seg.index)}
                  className={cn(
                    "group flex items-start gap-3 px-4 py-2.5 transition-colors cursor-pointer",
                    isSelected && "bg-primary/10",
                    isActive && !isSelected && "bg-primary/5",
                    !isSelected && !isActive && "hover:bg-white/[0.03]"
                  )}
                >
                  {/* Número */}
                  <span className="shrink-0 mt-0.5 text-right w-7 tabular-nums text-[10px] text-muted-foreground/40 font-mono">
                    {seg.index}
                  </span>

                  {/* Conteúdo */}
                  <div className="flex-1 min-w-0">
                    {/* Timestamp */}
                    <p className="text-[10px] font-mono text-primary/60 mb-1 tabular-nums">
                      {formatTimestamp(seg.start_ms)} → {formatTimestamp(seg.end_ms)}
                    </p>

                    {/* Texto editável */}
                    <textarea
                      value={seg.text}
                      onChange={(e) => updateSegmentText(seg.index, e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      rows={Math.max(1, seg.text.split("\n").length)}
                      className={cn(
                        "w-full resize-none bg-transparent text-xs leading-relaxed",
                        "focus:outline-none placeholder:text-muted-foreground/30",
                        isSelected ? "text-foreground" : "text-foreground/80"
                      )}
                    />
                  </div>

                  {/* Indicador ativo */}
                  {isActive && (
                    <div className="shrink-0 mt-1 h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

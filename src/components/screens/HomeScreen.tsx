import { useCallback, useEffect, useRef, useState } from "react";
import {
  Upload,
  Film,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Home,
  Plus,
} from "lucide-react";
import { AppHeader } from "../layout/AppHeader";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { cn } from "@/lib/utils";
import { pickVideoFile, listJobs, getSettings } from "@/lib/ipc";
import type { AppScreen, ProcessingJob, ProcessingOptions } from "@/lib/types";

const ACCEPTED_EXTENSIONS = [
  "mp4",
  "mkv",
  "mov",
  "avi",
  "webm",
  "wav",
  "mp3",
  "m4a",
  "aac",
  "flac",
  "ogg",
];

function statusBadge(status: string) {
  switch (status) {
    case "completed":
      return <Badge variant="success">Concluído</Badge>;
    case "processing":
      return <Badge variant="default">Processando</Badge>;
    case "error":
      return <Badge variant="destructive">Erro</Badge>;
    case "cancelled":
      return <Badge variant="secondary">Cancelado</Badge>;
    default:
      return <Badge variant="secondary">Pendente</Badge>;
  }
}

function statusIcon(status: string) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
    case "processing":
      return <Loader2 className="h-4 w-4 text-primary animate-spin" />;
    case "error":
      return <XCircle className="h-4 w-4 text-destructive" />;
    default:
      return <Film className="h-4 w-4 text-muted-foreground/50" />;
  }
}

interface HomeScreenProps {
  onStartProcessing: (videoPath: string, options: ProcessingOptions) => void;
  onNavigate: (screen: AppScreen) => void;
}

export function HomeScreen({ onStartProcessing, onNavigate }: HomeScreenProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [jobs, setJobs] = useState<ProcessingJob[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listJobs()
      .then(setJobs)
      .catch(() => {});
  }, []);

  async function handleFile(filePath: string) {
    const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      return;
    }

    setIsLoading(true);
    try {
      const settings = await getSettings();
      const options: ProcessingOptions = {
        gemini_key: settings.gemini_key,
        audio_cleanup_enabled: settings.audio_cleanup_enabled,
      };
      onStartProcessing(filePath, options);
    } finally {
      setIsLoading(false);
    }
  }

  async function handlePickFile() {
    const path = await pickVideoFile();
    if (path) {
      await handleFile(path);
    }
  }

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    if (!dropRef.current?.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  }, []);

  const onDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);

      const files = Array.from(e.dataTransfer.files);
      const mediaFile = files.find((f) => {
        const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
        return ACCEPTED_EXTENSIONS.includes(ext);
      });

      if (mediaFile) {
        // No Tauri, o caminho real do arquivo é acessível via path property
        const path = (mediaFile as File & { path?: string }).path ?? mediaFile.name;
        await handleFile(path);
      }
    },
    [onStartProcessing]
  );

  function formatDate(iso: string) {
    try {
      return new Date(iso).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  }

  return (
    <div className="relative flex flex-col flex-1 overflow-hidden">
      {/* Background */}
      <div className="bg-chess-pattern board-pattern absolute inset-0 pointer-events-none gpu-accelerated" />

      <AppHeader
        title="SubForge"
        subtitle="subtitle generator"
        icon={Home}
        actions={
          <Button onClick={handlePickFile} disabled={isLoading} size="sm">
            <Plus className="h-3.5 w-3.5" />
            Novo Job
          </Button>
        }
      />

      <div className="relative z-10 flex-1 overflow-y-auto px-6 py-6 space-y-6">
        {/* Área de drop */}
        <div
          ref={dropRef}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={handlePickFile}
          className={cn(
            "relative flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed transition-all cursor-pointer",
            "min-h-[220px] px-8",
            isDragOver
              ? "border-primary/60 bg-primary/5 shadow-[0_0_30px_rgba(217,119,6,0.15)]"
              : "border-white/10 bg-card/30 hover:border-white/20 hover:bg-card/50",
            isLoading && "pointer-events-none opacity-60"
          )}
        >
          {isLoading ? (
            <Loader2 className="h-10 w-10 text-primary animate-spin" />
          ) : (
            <div
              className={cn(
                "flex h-16 w-16 items-center justify-center rounded-2xl transition-all",
                isDragOver ? "bg-primary/20" : "bg-primary/10"
              )}
            >
              <Upload
                className={cn(
                  "h-8 w-8 transition-colors",
                  isDragOver ? "text-primary" : "text-primary/70"
                )}
              />
            </div>
          )}

          {!isLoading && (
            <>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">
                  {isDragOver ? "Solte para começar" : "Arraste uma midia ou clique para selecionar"}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Video: MP4, MKV, MOV, AVI, WebM | Audio: WAV, MP3, M4A, AAC, FLAC, OGG
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="pointer-events-none">
                  <Upload className="h-3.5 w-3.5" />
                  Selecionar arquivo
                </Button>
              </div>
            </>
          )}
        </div>

        {/* Jobs recentes */}
        {jobs.length > 0 && (
          <div>
            <div className="mb-3 flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              <h2 className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
                Jobs Recentes
              </h2>
              <span className="ml-auto text-[11px] text-muted-foreground/50">
                {jobs.length} {jobs.length === 1 ? "job" : "jobs"}
              </span>
            </div>

            <div className="space-y-1.5">
              {jobs.slice(0, 10).map((job) => (
                <button
                  key={job.id}
                  onClick={() => {
                    if (job.status === "completed" && job.srt_path) {
                      onNavigate("history");
                    }
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 rounded-xl border bg-card/50 px-4 py-3 text-left transition-all backdrop-blur-sm",
                    "border-white/10 hover:border-white/20 hover:bg-card/70",
                    job.status === "completed" && "cursor-pointer"
                  )}
                >
                  {statusIcon(job.status)}

                  <div className="flex-1 min-w-0">
                    <p className="truncate text-xs font-medium text-foreground">
                      {job.video_name}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {formatDate(job.created_at)}
                      {job.segments_count && (
                        <>
                          <span className="mx-1.5 text-white/20">·</span>
                          <span>{job.segments_count} segmentos</span>
                        </>
                      )}
                    </p>
                  </div>

                  {statusBadge(job.status)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Estado vazio */}
        {jobs.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Film className="h-8 w-8 text-muted-foreground/30 mb-3" />
            <p className="text-xs text-muted-foreground/50">
              Nenhum job ainda. Importe uma midia para comecar.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

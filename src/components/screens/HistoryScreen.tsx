import { useEffect, useState } from "react";
import {
  Clock,
  Film,
  CheckCircle2,
  XCircle,
  Loader2,
  FileText,
} from "lucide-react";
import { AppHeader } from "../layout/AppHeader";
import { Badge } from "../ui/badge";
import { cn } from "@/lib/utils";
import { listJobs } from "@/lib/ipc";
import type { AppScreen, ProcessingJob } from "@/lib/types";

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

interface HistoryScreenProps {
  onNavigate: (screen: AppScreen) => void;
  onOpenSrt: (srtPath: string, videoPath: string) => void;
}

export function HistoryScreen({ onNavigate: _, onOpenSrt }: HistoryScreenProps) {
  const [jobs, setJobs] = useState<ProcessingJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    listJobs()
      .then(setJobs)
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  function formatDate(iso: string) {
    try {
      return new Date(iso).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  }

  return (
    <div className="relative flex flex-col flex-1 overflow-hidden">
      <div className="bg-chess-pattern board-pattern absolute inset-0 pointer-events-none gpu-accelerated" />

      <AppHeader
        title="Histórico"
        subtitle="jobs recentes"
        icon={Clock}
      />

      <div className="relative z-10 flex-1 overflow-y-auto px-6 py-5">
        {/* Status bar */}
        <div className="flex items-center gap-2 mb-4 border-b border-white/10 pb-3">
          <span className="text-[11px] text-muted-foreground">
            <span className="font-medium text-foreground/70">Jobs</span>
            <span className="mx-1.5 text-white/20">·</span>
            <span className="tabular-nums">{jobs.length} registros</span>
          </span>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 text-primary animate-spin" />
          </div>
        )}

        {!isLoading && jobs.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Clock className="h-8 w-8 text-muted-foreground/30 mb-3" />
            <p className="text-xs text-muted-foreground/50">
              Nenhum job no histórico.
            </p>
          </div>
        )}

        <div className="space-y-1.5">
          {jobs.map((job) => (
            <button
              key={job.id}
              onClick={() => {
                if (job.status === "completed" && job.srt_path) {
                  onOpenSrt(job.srt_path, job.video_path);
                }
              }}
              disabled={job.status !== "completed" || !job.srt_path}
              className={cn(
                "w-full flex items-center gap-3 rounded-xl border bg-card/50 px-4 py-3 text-left transition-all backdrop-blur-sm",
                "border-white/10 hover:border-white/20 hover:bg-card/70",
                job.status === "completed" && job.srt_path
                  ? "cursor-pointer"
                  : "cursor-default"
              )}
            >
              {statusIcon(job.status)}

              <div className="flex-1 min-w-0">
                <p className="truncate text-xs font-medium text-foreground">
                  {job.video_name}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                  <span className="font-mono truncate max-w-xs text-muted-foreground/50">
                    {job.video_path}
                  </span>
                  <span className="mx-1.5 text-white/20">·</span>
                  <span>{formatDate(job.created_at)}</span>
                  {job.segments_count && (
                    <>
                      <span className="mx-1.5 text-white/20">·</span>
                      <span>{job.segments_count} segmentos</span>
                    </>
                  )}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {statusBadge(job.status)}
                {job.status === "completed" && job.srt_path && (
                  <FileText className="h-3.5 w-3.5 text-muted-foreground/40" />
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

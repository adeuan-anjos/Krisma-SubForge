import { useEffect, useRef } from "react";
import {
  Layers,
  CheckCircle2,
  XCircle,
  Loader2,
  AudioWaveform,
  Sparkles,
  Brain,
  AlignCenter,
  FileText,
  X,
} from "lucide-react";
import { AppHeader } from "../layout/AppHeader";
import { Button } from "../ui/button";
import { Progress } from "../ui/progress";
import { cn } from "@/lib/utils";
import { useProcessing, type StageState } from "@/hooks/useProcessing";
import type { ProcessingOptions } from "@/lib/types";

const STAGE_ICONS = {
  extracting: AudioWaveform,
  cleaning: Sparkles,
  transcribing: Brain,
  aligning: AlignCenter,
  exporting: FileText,
};

function StageCard({ stage }: { stage: StageState }) {
  const Icon = STAGE_ICONS[stage.id];

  return (
    <div
      className={cn(
        "flex items-center gap-4 rounded-xl border px-4 py-3 transition-all",
        stage.status === "active" &&
          "border-primary/40 bg-primary/5 shadow-[0_0_20px_rgba(217,119,6,0.08)]",
        stage.status === "done" && "border-emerald-400/20 bg-emerald-400/[0.03]",
        stage.status === "error" && "border-destructive/40 bg-destructive/5",
        stage.status === "pending" && "border-white/[0.06] bg-card/30"
      )}
    >
      {/* Ícone de status */}
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
          stage.status === "active" && "bg-primary/15",
          stage.status === "done" && "bg-emerald-400/15",
          stage.status === "error" && "bg-destructive/15",
          stage.status === "pending" && "bg-white/[0.04]"
        )}
      >
        {stage.status === "active" && (
          <Loader2
            className={cn(
              "h-4 w-4 animate-spin",
              stage.status === "active" ? "text-primary" : "text-muted-foreground/40"
            )}
          />
        )}
        {stage.status === "done" && (
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
        )}
        {stage.status === "error" && (
          <XCircle className="h-4 w-4 text-destructive" />
        )}
        {stage.status === "pending" && (
          <Icon className="h-4 w-4 text-muted-foreground/30" />
        )}
      </div>

      {/* Label + Progress */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1.5">
          <p
            className={cn(
              "text-xs font-medium",
              stage.status === "active" && "text-foreground",
              stage.status === "done" && "text-emerald-400",
              stage.status === "error" && "text-destructive",
              stage.status === "pending" && "text-muted-foreground/40"
            )}
          >
            {stage.label}
          </p>
          <span
            className={cn(
              "text-[10px] font-mono tabular-nums",
              stage.status === "active" ? "text-primary" : "text-muted-foreground/40"
            )}
          >
            {stage.status === "done" ? "100%" : stage.status === "active" ? `${Math.round(stage.percent)}%` : "—"}
          </span>
        </div>

        <Progress
          value={stage.status === "done" ? 100 : stage.percent}
          className={cn(
            "h-1",
            stage.status === "done" && "[&>div]:bg-emerald-400",
            stage.status === "error" && "[&>div]:bg-destructive",
            stage.status === "pending" && "opacity-30"
          )}
        />
      </div>
    </div>
  );
}

interface ProcessingScreenProps {
  videoPath: string;
  options: ProcessingOptions;
  onComplete: (srtPath: string) => void;
  onCancel: () => void;
}

export function ProcessingScreen({
  videoPath,
  options,
  onComplete,
  onCancel,
}: ProcessingScreenProps) {
  const { stages, logs, error, isRunning, handleCancel } = useProcessing(
    videoPath,
    options,
    onComplete,
    onCancel
  );

  const logEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll do log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const videoName = videoPath.split(/[\\/]/).pop() ?? videoPath;

  return (
    <div className="relative flex flex-col flex-1 overflow-hidden">
      {/* Background */}
      <div className="bg-chess-pattern board-pattern absolute inset-0 pointer-events-none gpu-accelerated" />

      <AppHeader
        title={videoName}
        subtitle="processando"
        icon={Layers}
        actions={
          <Button
            variant="destructive"
            size="sm"
            onClick={handleCancel}
            disabled={!isRunning}
          >
            <X className="h-3.5 w-3.5" />
            Cancelar
          </Button>
        }
      />

      <div className="relative z-10 flex-1 overflow-y-auto px-6 py-5 space-y-4">
        {/* Erro */}
        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-2.5 text-xs text-destructive">
            <XCircle className="h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Cards de estágios */}
        <div className="space-y-2">
          {stages.map((stage) => (
            <StageCard key={stage.id} stage={stage} />
          ))}
        </div>

        {/* Área de log */}
        <div className="rounded-xl border border-white/[0.06] bg-black/30 overflow-hidden">
          <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-1.5">
            <div className="flex gap-1">
              <div className="h-2.5 w-2.5 rounded-full bg-white/10" />
              <div className="h-2.5 w-2.5 rounded-full bg-white/10" />
              <div className="h-2.5 w-2.5 rounded-full bg-white/10" />
            </div>
            <span className="text-[10px] text-muted-foreground/50 font-mono">console</span>
          </div>

          <div className="h-48 overflow-y-auto px-3 py-2 space-y-0.5">
            {logs.length === 0 && (
              <p className="text-[10px] text-muted-foreground/30 font-mono">
                Aguardando logs...
              </p>
            )}
            {logs.map((log, i) => (
              <p
                key={i}
                className={cn(
                  "font-mono text-[10px] leading-relaxed",
                  log.startsWith("[ERR]")
                    ? "text-destructive/80"
                    : log.startsWith("[WARN]")
                    ? "text-amber-400/70"
                    : "text-muted-foreground/60"
                )}
              >
                {log}
              </p>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import {
  startProcessing,
  cancelProcessing,
  confirmCleanupFailure,
  onSidecarEvent,
} from "@/lib/ipc";
import type {
  PipelineStage,
  ProcessingOptions,
  SidecarEvent,
} from "@/lib/types";

export interface StageState {
  id: PipelineStage;
  label: string;
  percent: number;
  status: "pending" | "active" | "done" | "error";
}

const STAGE_ORDER: PipelineStage[] = [
  "extracting",
  "cleaning",
  "transcribing",
  "aligning",
  "exporting",
];

const STAGE_LABELS: Record<PipelineStage, string> = {
  extracting: "Extração de áudio",
  cleaning: "Limpeza de voz",
  transcribing: "Transcrição",
  aligning: "Alinhamento forçado",
  exporting: "Exportação SRT",
};

function initialStages(): StageState[] {
  return STAGE_ORDER.map((id) => ({
    id,
    label: STAGE_LABELS[id],
    percent: 0,
    status: "pending",
  }));
}

export function useProcessing(
  videoPath: string,
  options: ProcessingOptions,
  onComplete: (srtPath: string) => void,
  onCancel: () => void
) {
  const [stages, setStages] = useState<StageState[]>(initialStages);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const unlistenRef = useRef<(() => void) | null>(null);
  const startedRef = useRef<string>(""); // guarda o videoPath já iniciado

  useEffect(() => {
    if (!videoPath) return;
    if (startedRef.current === videoPath) return; // evitar dupla execução
    startedRef.current = videoPath;

    setIsRunning(true);
    setError(null);
    setStages(initialStages());
    setLogs([]);

    let activeStageIdx = -1;

    // Registrar listener de eventos
    onSidecarEvent((event: SidecarEvent) => {
      if (event.type === "progress") {
        const stageIdx = STAGE_ORDER.indexOf(event.stage);

        setStages((prev) => {
          const next = [...prev];

          // Marcar estágios anteriores como done
          if (stageIdx > activeStageIdx) {
            for (let i = 0; i < stageIdx; i++) {
              if (next[i].status !== "done") {
                next[i] = { ...next[i], status: "done", percent: 100 };
              }
            }
            activeStageIdx = stageIdx;
          }

          // Atualizar estágio atual
          if (stageIdx >= 0) {
            next[stageIdx] = {
              ...next[stageIdx],
              percent: event.percent,
              status: event.percent >= 100 ? "done" : "active",
            };
          }

          return next;
        });
      } else if (event.type === "complete") {
        setStages((prev) =>
          prev.map((s) => ({ ...s, status: "done", percent: 100 }))
        );
        setIsRunning(false);
        onComplete(event.srt_path);
      } else if (event.type === "log") {
        const prefix = event.level === "error" ? "[ERR]" : event.level === "warn" ? "[WARN]" : "[INFO]";
        setLogs((prev) => [...prev.slice(-49), `${prefix} ${event.message}`]);
      } else if (event.type === "error") {
        setError(event.message);
        setIsRunning(false);
        setStages((prev) =>
          prev.map((s) =>
            s.status === "active" ? { ...s, status: "error" } : s
          )
        );
      } else if (event.type === "confirm") {
        if (event.kind === "cleanup_failed") {
          const shouldContinue = window.confirm(
            `${event.message}\n\nClique em OK para continuar sem limpeza de voz, ou Cancelar para encerrar o processamento.`
          );

          confirmCleanupFailure(shouldContinue).catch((err) => {
            setLogs((prev) => [...prev.slice(-49), `[ERR] Falha ao enviar confirmacao: ${String(err)}`]);
            setError("Nao foi possivel enviar sua decisao para o sidecar.");
            setIsRunning(false);
          });
        }
      }
    }).then((unlisten) => {
      unlistenRef.current = unlisten;
    });

    // Iniciar processamento
    startProcessing(videoPath, options).catch((e) => {
      setError(String(e));
      setIsRunning(false);
    });

    return () => {
      unlistenRef.current?.();
    };
  }, [videoPath]);

  async function handleCancel() {
    await cancelProcessing().catch(() => {});
    unlistenRef.current?.();
    setIsRunning(false);
    onCancel();
  }

  return { stages, logs, error, isRunning, handleCancel };
}

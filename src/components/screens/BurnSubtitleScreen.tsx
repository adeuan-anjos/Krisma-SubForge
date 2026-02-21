import { useEffect, useMemo, useRef, useState } from "react";
import {
  Flame,
  Film,
  Type,
  Loader2,
  AudioLines,
  Captions,
  CheckCircle2,
  AlertCircle,
  FolderOpen,
} from "lucide-react";
import { AppHeader } from "../layout/AppHeader";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Progress } from "../ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import {
  burnSubtitles,
  onBurnProgress,
  openInExplorer,
  pickSubtitleFile,
  pickVideoFile,
  probeMediaStreams,
} from "@/lib/ipc";
import type { AppScreen, BurnProgressEvent, BurnSubtitlesResponse, ProbeMediaStreamsResponse } from "@/lib/types";

interface BurnSubtitleScreenProps {
  onNavigate: (screen: AppScreen) => void;
}

const DEFAULT_FONT_SIZE = 16;
const DEFAULT_OUTLINE = 1.0;
const DEFAULT_MARGIN_V = 15;

const FONT_OPTIONS = ["Arimo", "Roboto", "Noto Sans", "Source Sans 3", "Atkinson Hyperlegible"] as const;

const COLOR_PRESETS = [
  { label: "Branco", hex: "#FFFFFF" },
  { label: "Amarelo", hex: "#FFFF00" },
  { label: "Ciano", hex: "#00FFFF" },
  { label: "Verde", hex: "#00FF00" },
] as const;

function formatEta(seconds?: number | null) {
  if (!seconds || !Number.isFinite(seconds) || seconds < 0) return "--:--";
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatProcessed(seconds?: number) {
  if (!seconds || !Number.isFinite(seconds) || seconds < 0) return "00:00";
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatTrackLabel(
  index: number,
  language?: string,
  title?: string,
  codecName?: string,
  channels?: number
) {
  const parts = [
    `#${index}`,
    language ? language.toUpperCase() : undefined,
    title,
    codecName,
    channels ? `${channels}ch` : undefined,
  ].filter(Boolean);
  return parts.join(" - ");
}

export function BurnSubtitleScreen({ onNavigate: _ }: BurnSubtitleScreenProps) {
  const [videoPath, setVideoPath] = useState("");
  const [subtitlePath, setSubtitlePath] = useState("");
  const [fontName, setFontName] = useState<(typeof FONT_OPTIONS)[number]>("Arimo");
  const [fontColor, setFontColor] = useState("#FFFFFF");
  const [fontSize, setFontSize] = useState(DEFAULT_FONT_SIZE);
  const [outline, setOutline] = useState(DEFAULT_OUTLINE);
  const [marginV, setMarginV] = useState(DEFAULT_MARGIN_V);
  const [removeEmbeddedSubtitles, setRemoveEmbeddedSubtitles] = useState(false);
  const [removeAudioIndices, setRemoveAudioIndices] = useState<number[]>([]);

  const [streams, setStreams] = useState<ProbeMediaStreamsResponse | null>(null);
  const [isProbing, setIsProbing] = useState(false);
  const [isBurning, setIsBurning] = useState(false);
  const [burnProgress, setBurnProgress] = useState<BurnProgressEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BurnSubtitlesResponse | null>(null);
  const unlistenBurnRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    onBurnProgress((event) => {
      setBurnProgress(event);
    }).then((unlisten) => {
      unlistenBurnRef.current = unlisten;
    });

    return () => {
      unlistenBurnRef.current?.();
    };
  }, []);

  const videoName = useMemo(() => {
    if (!videoPath) return "Burn-in de legenda";
    return videoPath.split(/[\\/]/).pop() ?? videoPath;
  }, [videoPath]);

  async function handlePickVideo() {
    setError(null);
    const path = await pickVideoFile();
    if (!path) return;
    setVideoPath(path);
    setResult(null);
    setStreams(null);
    setRemoveAudioIndices([]);

    setIsProbing(true);
    try {
      const probe = await probeMediaStreams(path);
      setStreams(probe);
    } catch (e) {
      setError(`Falha ao inspecionar streams: ${String(e)}`);
    } finally {
      setIsProbing(false);
    }
  }

  async function handlePickSubtitle() {
    setError(null);
    const path = await pickSubtitleFile();
    if (path) {
      setSubtitlePath(path);
      setResult(null);
    }
  }

  function toggleRemoveAudio(index: number) {
    setRemoveAudioIndices((prev) =>
      prev.includes(index) ? prev.filter((v) => v !== index) : [...prev, index]
    );
  }

  async function handleBurnSubtitles() {
    if (!videoPath) {
      setError("Selecione um video antes de iniciar.");
      return;
    }
    if (!subtitlePath) {
      setError("Selecione um arquivo de legenda antes de iniciar.");
      return;
    }

    setIsBurning(true);
    setError(null);
    setResult(null);
    setBurnProgress({
      phase: "Preparando encode",
      codec: "h264_amf",
      processed_seconds: 0,
      duration_seconds: 0,
      percent: 0,
      speed: null,
      eta_seconds: null,
      status: "running",
    });

    try {
      const burnResult = await burnSubtitles({
        video_path: videoPath,
        subtitle_path: subtitlePath,
        font_name: fontName,
        font_color: fontColor,
        font_size: Number.isFinite(fontSize) ? fontSize : DEFAULT_FONT_SIZE,
        outline: Number.isFinite(outline) ? outline : DEFAULT_OUTLINE,
        margin_v: Number.isFinite(marginV) ? marginV : DEFAULT_MARGIN_V,
        remove_embedded_subtitles: removeEmbeddedSubtitles,
        remove_audio_stream_indices: [...removeAudioIndices].sort((a, b) => a - b),
      });

      if (!burnResult) {
        setError("Operacao cancelada no Salvar como.");
        return;
      }

      setResult(burnResult);
    } catch (e) {
      setError(`Falha ao aplicar burn-in: ${String(e)}`);
    } finally {
      setIsBurning(false);
    }
  }

  return (
    <div className="relative flex flex-col flex-1 overflow-hidden">
      <div className="bg-chess-pattern board-pattern absolute inset-0 pointer-events-none gpu-accelerated" />

      <AppHeader
        title={videoName}
        subtitle="burn-in com ffmpeg"
        icon={Flame}
        actions={
          <Button onClick={handleBurnSubtitles} disabled={isBurning || isProbing} size="sm">
            {isBurning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Flame className="h-3.5 w-3.5" />}
            {isBurning ? "Processando..." : "Queimar legenda"}
          </Button>
        }
      />

      <div className="relative z-10 flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-3xl space-y-5">
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-2.5 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {error}
            </div>
          )}

          {result && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-4 py-2.5 text-xs text-emerald-300">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                <span>
                  Concluido com codec <span className="font-mono">{result.used_video_codec}</span>
                  {result.used_video_codec === "libx264" && " (fallback)"}.
                </span>
              </div>
              <Button variant="secondary" size="sm" onClick={() => openInExplorer(result.output_path)}>
                <FolderOpen className="h-3.5 w-3.5" />
                Abrir pasta
              </Button>
            </div>
          )}

          {(isBurning || burnProgress) && (
            <section className="rounded-xl border border-white/10 bg-card/50 backdrop-blur-sm overflow-hidden">
              <div className="border-b border-white/[0.06] px-4 py-2.5">
                <h2 className="text-[11px] uppercase tracking-wide font-medium text-muted-foreground">Progresso</h2>
              </div>

              <div className="px-4 py-4 space-y-2.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">
                    {burnProgress?.phase || "Inicializando"}
                    {burnProgress?.codec ? ` - ${burnProgress.codec}` : ""}
                  </span>
                  <span className="tabular-nums font-mono text-foreground">
                    {Math.round(burnProgress?.percent || 0)}%
                  </span>
                </div>
                <Progress value={Math.max(0, Math.min(100, burnProgress?.percent || 0))} />

                <div className="grid grid-cols-2 gap-2 text-[10px] text-muted-foreground/80 md:grid-cols-4">
                  <p>
                    ETA: <span className="font-mono">{formatEta(burnProgress?.eta_seconds)}</span>
                  </p>
                  <p>
                    Velocidade: <span className="font-mono">{burnProgress?.speed ? `${burnProgress.speed.toFixed(2)}x` : "--"}</span>
                  </p>
                  <p>
                    Processado: <span className="font-mono">{formatProcessed(burnProgress?.processed_seconds)}</span>
                  </p>
                  <p>
                    Status: <span className="font-mono">{burnProgress?.status || "running"}</span>
                  </p>
                </div>
              </div>
            </section>
          )}

          <section className="rounded-xl border border-white/10 bg-card/50 backdrop-blur-sm overflow-hidden">
            <div className="border-b border-white/[0.06] px-4 py-2.5">
              <h2 className="text-[11px] uppercase tracking-wide font-medium text-muted-foreground">Arquivos</h2>
            </div>

            <div className="px-4 py-4 space-y-3">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handlePickVideo} disabled={isBurning}>
                  <Film className="h-3.5 w-3.5" />
                  Escolher video
                </Button>
                <p className="text-[11px] text-muted-foreground truncate">{videoPath || "Nenhum video selecionado"}</p>
              </div>

              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handlePickSubtitle} disabled={isBurning}>
                  <Captions className="h-3.5 w-3.5" />
                  Escolher legenda
                </Button>
                <p className="text-[11px] text-muted-foreground truncate">{subtitlePath || "Nenhuma legenda selecionada"}</p>
              </div>

              <p className="text-[10px] text-muted-foreground/60">
                O Salvar como abre ao iniciar o burn-in e ja sugere <span className="font-mono">_burned</span> na pasta original.
              </p>
            </div>
          </section>

          <section className="rounded-xl border border-white/10 bg-card/50 backdrop-blur-sm overflow-hidden">
            <div className="border-b border-white/[0.06] px-4 py-2.5">
              <h2 className="text-[11px] uppercase tracking-wide font-medium text-muted-foreground">Estilo da legenda</h2>
            </div>

            <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label className="mb-1.5 block">Fonte</Label>
                <Select value={fontName} onValueChange={(value) => setFontName(value as (typeof FONT_OPTIONS)[number])}>
                  <SelectTrigger>
                    <div className="flex items-center gap-2">
                      <Type className="h-3.5 w-3.5 text-muted-foreground/50" />
                      <SelectValue placeholder="Escolha a fonte" />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    {FONT_OPTIONS.map((font) => (
                      <SelectItem key={font} value={font}>
                        {font}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="mb-1.5 block">Cor da fonte</Label>
                <Select value={fontColor} onValueChange={setFontColor}>
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha a cor" />
                  </SelectTrigger>
                  <SelectContent>
                    {COLOR_PRESETS.map((preset) => (
                      <SelectItem key={preset.hex} value={preset.hex}>
                        {preset.label} ({preset.hex})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="mb-1.5 block">Tamanho da fonte</Label>
                <Input
                  type="number"
                  value={fontSize}
                  onChange={(e) => setFontSize(Number(e.target.value))}
                  min={1}
                  step={1}
                />
              </div>

              <div>
                <Label className="mb-1.5 block">Outline</Label>
                <Input
                  type="number"
                  value={outline}
                  onChange={(e) => setOutline(Number(e.target.value))}
                  min={0}
                  step={0.1}
                />
              </div>

              <div>
                <Label className="mb-1.5 block">Margem vertical</Label>
                <Input
                  type="number"
                  value={marginV}
                  onChange={(e) => setMarginV(Number(e.target.value))}
                  min={0}
                  step={1}
                />
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-white/10 bg-card/50 backdrop-blur-sm overflow-hidden">
            <div className="border-b border-white/[0.06] px-4 py-2.5">
              <h2 className="text-[11px] uppercase tracking-wide font-medium text-muted-foreground">Streams</h2>
            </div>

            <div className="px-4 py-4 space-y-3">
              <div className="flex items-start justify-between gap-3 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2.5">
                <div>
                  <p className="text-xs font-medium text-foreground">Remover legendas embutidas</p>
                  <p className="mt-1 text-[10px] text-muted-foreground/60">
                    {streams?.has_embedded_subtitles
                      ? `Este arquivo possui ${streams.subtitle_streams.length} faixa(s) de legenda embutida(s).`
                      : "Nenhuma faixa de legenda embutida detectada."}
                  </p>
                </div>
                <Switch
                  checked={removeEmbeddedSubtitles}
                  onCheckedChange={setRemoveEmbeddedSubtitles}
                  disabled={isBurning || !streams?.has_embedded_subtitles}
                />
              </div>

              <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2.5">
                <div className="mb-2 flex items-center gap-1.5">
                  <AudioLines className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-xs font-medium text-foreground">Faixas de audio para remover</p>
                </div>

                {isProbing && (
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Inspecionando streams...
                  </div>
                )}

                {!isProbing && (streams?.audio_streams.length ?? 0) === 0 && (
                  <p className="text-[11px] text-muted-foreground/60">Nenhuma faixa de audio detectada.</p>
                )}

                {!isProbing && (streams?.audio_streams.length ?? 0) > 0 && (
                  <div className="space-y-1.5">
                    {streams!.audio_streams.map((track) => {
                      const checked = removeAudioIndices.includes(track.index);
                      return (
                        <label
                          key={track.index}
                          className="flex items-center gap-2 rounded-md border border-white/[0.08] px-2.5 py-1.5 text-[11px] text-muted-foreground hover:bg-white/[0.03]"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleRemoveAudio(track.index)}
                            disabled={isBurning}
                          />
                          <span className="truncate">
                            {formatTrackLabel(
                              track.index,
                              track.language,
                              track.title,
                              track.codec_name,
                              track.channels
                            )}
                            {track.is_default && " (default)"}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

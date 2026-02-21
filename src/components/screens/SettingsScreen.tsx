import { useEffect, useState } from "react";
import {
  Settings,
  Eye,
  EyeOff,
  Download,
  CheckCircle2,
  Loader2,
  Save,
  AlertCircle,
  Trash2,
} from "lucide-react";
import { AppHeader } from "../layout/AppHeader";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Progress } from "../ui/progress";
import { Switch } from "../ui/switch";
import {
  getSettings,
  saveSettings,
  checkMfaModels,
  downloadMfaModels,
  onMfaDownloadProgress,
  clearGeminiCache,
} from "@/lib/ipc";
import type { AppSettings, AppScreen } from "@/lib/types";

interface SettingsScreenProps {
  onNavigate: (screen: AppScreen) => void;
}

function formatBytesToMb(value: number): string {
  return (value / (1024 * 1024)).toFixed(2);
}

export function SettingsScreen({ onNavigate: _ }: SettingsScreenProps) {
  const [settings, setSettings] = useState<AppSettings>({
    gemini_key: "",
    mfa_models_installed: false,
    audio_cleanup_enabled: true,
  });

  const [showKey, setShowKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [mfaDownloading, setMfaDownloading] = useState(false);
  const [mfaProgress, setMfaProgress] = useState(0);

  const [cacheBusy, setCacheBusy] = useState(false);
  const [cacheStatus, setCacheStatus] = useState<string | null>(null);

  useEffect(() => {
    getSettings().then(setSettings).catch(() => {});
    checkMfaModels()
      .then((installed) => {
        setSettings((prev) => ({ ...prev, mfa_models_installed: installed }));
      })
      .catch(() => {});
  }, []);

  async function handleSave() {
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      await saveSettings(settings);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (e) {
      setSaveError(String(e));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDownloadMfa() {
    setMfaDownloading(true);
    setMfaProgress(0);

    const unlisten = await onMfaDownloadProgress((pct) => {
      setMfaProgress(pct);
    });

    try {
      await downloadMfaModels();
      const installed = await checkMfaModels();
      setSettings((prev) => ({ ...prev, mfa_models_installed: installed }));
      if (!installed) {
        setSaveError("Modelos MFA ainda nao disponiveis. Instale manualmente o MFA e os modelos english_us_arpa.");
      }
    } catch (e) {
      setSaveError(`Configuracao MFA: ${e}`);
    } finally {
      unlisten();
      setMfaDownloading(false);
    }
  }

  async function handleClearGeminiCache() {
    setCacheBusy(true);
    setCacheStatus(null);
    setSaveError(null);

    try {
      const result = await clearGeminiCache();
      setCacheStatus(
        `Cache Gemini limpo: ${result.removed_files} arquivos removidos, ${formatBytesToMb(result.freed_bytes)} MB liberados.`
      );
    } catch (e) {
      setSaveError(`Falha ao limpar cache Gemini: ${e}`);
    } finally {
      setCacheBusy(false);
    }
  }

  return (
    <div className="relative flex flex-col flex-1 overflow-hidden">
      <div className="bg-chess-pattern board-pattern absolute inset-0 pointer-events-none gpu-accelerated" />

      <AppHeader
        title="Configuracoes"
        subtitle="pipeline settings"
        icon={Settings}
        actions={
          <Button onClick={handleSave} disabled={isSaving} size="sm">
            {isSaving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : saveSuccess ? (
              <CheckCircle2 className="h-3.5 w-3.5" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {saveSuccess ? "Salvo!" : "Salvar"}
          </Button>
        }
      />

      <div className="relative z-10 flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto max-w-lg space-y-5">
          {saveError && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/25 bg-destructive/10 px-4 py-2.5 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {saveError}
            </div>
          )}

          <section className="rounded-xl border border-white/10 bg-card/50 backdrop-blur-sm overflow-hidden">
            <div className="border-b border-white/[0.06] px-4 py-2.5">
              <h2 className="text-[11px] uppercase tracking-wide font-medium text-muted-foreground">API Gemini</h2>
            </div>

            <div className="px-4 py-4 space-y-3">
              <div>
                <Label className="mb-2 block">Gemini API Key</Label>
                <div className="relative">
                  <Input
                    type={showKey ? "text" : "password"}
                    value={settings.gemini_key}
                    onChange={(e) => setSettings((prev) => ({ ...prev, gemini_key: e.target.value }))}
                    placeholder="AIza..."
                    className="pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                  >
                    {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>
                <p className="mt-1.5 text-[10px] text-muted-foreground/50">
                  Necessaria para transcricao textual via Gemini 3 Pro Preview. Obtenha em{" "}
                  <span className="text-primary/70 font-mono">aistudio.google.com</span>
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-white/10 bg-card/50 backdrop-blur-sm overflow-hidden">
            <div className="border-b border-white/[0.06] px-4 py-2.5">
              <h2 className="text-[11px] uppercase tracking-wide font-medium text-muted-foreground">Pipeline</h2>
            </div>

            <div className="px-4 py-4 space-y-3">
              <div className="flex items-start justify-between gap-3 rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2.5">
                <div>
                  <p className="text-xs font-medium text-foreground">Limpeza de voz automatica (GPU)</p>
                  <p className="mt-1 text-[10px] text-muted-foreground/60">
                    Usa separacao vocal MDX com DirectML e baixa o modelo automaticamente na primeira execucao.
                  </p>
                </div>

                <Switch
                  checked={settings.audio_cleanup_enabled}
                  onCheckedChange={(checked) =>
                    setSettings((prev) => ({ ...prev, audio_cleanup_enabled: checked }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Button variant="outline" size="sm" onClick={handleClearGeminiCache} disabled={cacheBusy} className="w-full">
                  {cacheBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  Limpar cache Gemini
                </Button>

                {cacheStatus && <p className="text-[10px] text-emerald-400">{cacheStatus}</p>}
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-white/10 bg-card/50 backdrop-blur-sm overflow-hidden">
            <div className="border-b border-white/[0.06] px-4 py-2.5">
              <h2 className="text-[11px] uppercase tracking-wide font-medium text-muted-foreground">MFA Models</h2>
            </div>

            <div className="px-4 py-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-foreground">English US ARPA</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5">Modelos para alinhamento forcado</p>
                </div>

                <div className="flex items-center gap-2">
                  {settings.mfa_models_installed ? (
                    <div className="flex items-center gap-1.5 text-[11px] text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Instalado
                    </div>
                  ) : (
                    <div className="text-[11px] text-muted-foreground/50">Nao instalado</div>
                  )}
                </div>
              </div>

              {mfaDownloading && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>Baixando modelos...</span>
                    <span className="tabular-nums font-mono">{Math.round(mfaProgress)}%</span>
                  </div>
                  <Progress value={mfaProgress} />
                </div>
              )}

              {!settings.mfa_models_installed && !mfaDownloading && (
                <Button variant="outline" size="sm" onClick={handleDownloadMfa} className="w-full">
                  <Download className="h-3.5 w-3.5" />
                  Ver instrucoes de instalacao
                </Button>
              )}

              <p className="text-[10px] text-muted-foreground/40">
                O Gemini gera apenas texto. O MFA e obrigatorio para gerar timestamps. Sem MFA disponivel, o processamento falha com erro explicito.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

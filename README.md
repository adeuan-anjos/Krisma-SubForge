# Krisma SubForge

App Tauri 2 para extracao automatica de legendas SRT de midia em ingles.

## Pipeline

```
Midia (video/audio) -> FFmpeg HQ -> (opcional) MDX vocal cleaner com DirectML -> WAV 16kHz mono -> Gemini 3 Pro Preview (transcricao textual) -> MFA (timestamps por forced alignment) -> SRT
```

O pipeline opera em modo estrito:
- Gemini gera apenas texto (sem timestamps)
- MFA é obrigatório para gerar timestamps
- Se o MFA estiver indisponível ou falhar, o job falha com erro claro (sem fallback)
- Transcricao textual do Gemini usa cache local em `%LOCALAPPDATA%/krisma-subforge/cache/transcripts`
- Limpeza de voz pode ser ativada em Configuracoes; o modelo MDX e baixado automaticamente no primeiro uso
- Se a limpeza de voz falhar, o app pergunta se deve continuar sem limpeza
- Quando a limpeza estiver ativa, o audio limpo e salvo em `onlyvoice/<nome>_clean_16k.wav` ao lado da midia original

## Regras de legenda (Netflix strict)

- Segmentacao final em no maximo 2 linhas por cue
- Maximo de 42 caracteres por linha
- CPS maximo de 20
- Duracao por cue entre 1.0s e 6.0s quando possivel
- Gap minimo de 100ms entre cues

## Requisitos

- Node.js 18+
- Rust (stable)
- Python 3.11
- FFmpeg (no PATH ou em `src-tauri/binaries/`)

## Setup Dev

### Frontend + Rust

```bash
npm install --legacy-peer-deps
npm run tauri dev
```

### Python Sidecar

```bash
cd python-sidecar
setup_env.bat          # cria .venv e instala dependências
```

## Build Produção

### 1. Compilar sidecar Python

```bash
cd python-sidecar
build_sidecar.bat
```

### 2. Baixar FFmpeg

Baixar FFmpeg static build para Windows x64:
- Renomear para `ffmpeg-x86_64-pc-windows-msvc.exe`
- Colocar em `src-tauri/binaries/`

### 3. Build Tauri

```bash
npm run tauri build
```

## Configuração

Na primeira execução, vá em **Configurações** e:
1. Insira sua **Gemini API Key** (obtenha em aistudio.google.com)
2. (Opcional) Ative **Limpeza de voz automatica (GPU)**
3. Instale o MFA e os modelos `english_us_arpa` (acoustic + dictionary)

## Estrutura

```
krisma-subforge/
├── src/                    # React frontend
│   ├── components/
│   │   ├── ui/             # shadcn/ui (não editar)
│   │   ├── layout/         # AppSidebar, AppHeader
│   │   └── screens/        # HomeScreen, ProcessingScreen, EditorScreen, SettingsScreen, HistoryScreen
│   ├── hooks/              # useProcessing, useEditor
│   └── lib/                # types, utils, ipc.ts
├── src-tauri/              # Backend Rust
│   └── src/
│       ├── commands/       # file, jobs, settings, sidecar
│       └── sidecar.rs      # gerenciamento do sidecar Python
└── python-sidecar/         # Pipeline Python
    └── pipeline/           # extractor, transcriber, aligner, exporter
```

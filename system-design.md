# System Design — Database Screen

> Tokens, padrões visuais e anatomia de componentes extraídos exclusivamente da tela de Base de Dados (`DatabaseScreen.tsx`).
> Referência para reutilização em novos projetos com o mesmo visual.

---

## 1. Tipografia

| Papel | Fonte | Classe Tailwind | Pesos |
|-------|-------|-----------------|-------|
| Títulos / Modais | **Merriweather** (serif) | `font-serif` | 400, 700 |
| Interface / UI | **Inter** (sans-serif) | `font-sans` | 400, 500, 600 |

**Escala tipográfica da tela:**

| Elemento | Tamanho | Classe |
|----------|---------|--------|
| Título principal (header) | 16px / bold | `text-base font-bold tracking-tight font-serif` |
| Subtítulo (header) | 10px / caps | `text-[10px] font-medium uppercase tracking-widest` |
| Rótulo de seção (categoria) | 11px / caps | `text-[11px] uppercase tracking-wide text-muted-foreground` |
| Nome do card | 14px / semibold | `text-sm font-semibold text-foreground` |
| Info do card | 11px / regular | `text-[11px] text-muted-foreground` |
| Cabeçalho da tabela | 10px / caps | `text-[10px] font-medium uppercase tracking-wider` |
| Linhas da tabela | 12px | `text-xs` |
| Código mono (ECO, ID) | 10px | `font-mono text-[10px]` |
| Labels de filtro | 9px / caps | `text-[9px] font-medium uppercase tracking-widest` |
| Título de modal | 12px / semibold | `text-xs font-semibold font-serif` |
| Feedback de status | 11px | `text-[11px]` |

---

## 2. Cores — Tokens CSS

O app é sempre **dark-only**. Valores em oklch.

```css
:root {
  --radius: 0.625rem;            /* 10px — raio padrão */
  --titlebar-height: 2rem;       /* 32px */

  /* Fundos */
  --background:   oklch(0.145 0.012 50.523);       /* Stone 950 — #0c0a09 */
  --foreground:   oklch(0.97  0.001 106.424);       /* Stone 100 */

  /* Cards (com glassmorphism) */
  --card:         oklch(0.216 0.012 56.259 / 70%); /* Stone 900 @ 70% */
  --card-foreground: oklch(0.97 0.001 106.424);

  /* Popovers (sem transparência) */
  --popover:      oklch(0.216 0.012 56.259);
  --popover-foreground: oklch(0.97 0.001 106.424);

  /* Accent primário — Amber 600 (#d97706) */
  --primary:      oklch(0.666 0.179 58.318);
  --primary-foreground: oklch(1 0 0);

  /* Secundário — Stone 800 */
  --secondary:    oklch(0.268 0.007 34.298);
  --secondary-foreground: oklch(0.97 0.001 106.424);

  /* Muted */
  --muted:        oklch(0.268 0.007 34.298);        /* Stone 800 */
  --muted-foreground: oklch(0.709 0.01 56.259);     /* Stone 400 */

  /* Accent (idêntico ao primary) */
  --accent:       oklch(0.666 0.179 58.318);
  --accent-foreground: oklch(1 0 0);

  /* Destrutivo */
  --destructive:  oklch(0.577 0.245 27.325);        /* Red */

  /* Bordas / inputs */
  --border: oklch(1 0 0 / 10%);   /* white/10 */
  --input:  oklch(1 0 0 / 15%);   /* white/15 */
  --ring:   oklch(0.666 0.179 58.318);

  /* Sidebar de navegação */
  --sidebar:                   oklch(0.17 0.01 50);
  --sidebar-foreground:        oklch(0.97 0.001 106.424);
  --sidebar-primary:           oklch(0.666 0.179 58.318);
  --sidebar-primary-foreground: oklch(1 0 0);
  --sidebar-accent:            oklch(0.23 0.01 50);
  --sidebar-accent-foreground: oklch(0.97 0.001 106.424);
  --sidebar-border:            oklch(1 0 0 / 10%);
  --sidebar-ring:              oklch(0.666 0.179 58.318);
}
```

### Equivalentes Tailwind prontos

| Token | Tailwind | Hex aproximado |
|-------|----------|----------------|
| background | `bg-background` / `bg-stone-950` | `#0c0a09` |
| foreground | `text-foreground` / `text-stone-100` | `#f5f5f4` |
| primary | `text-primary` / `text-amber-600` | `#d97706` |
| muted-foreground | `text-muted-foreground` / `text-stone-400` | `#a8a29e` |
| card | `bg-card/50`, `bg-card/70` | Stone 900 |
| border | `border-white/10` | — |
| destructive | `text-destructive` / `text-red-500` | `#ef4444` |

---

## 3. Cores de Categoria (Color Map)

Usado para diferenciar grupos de itens (amber = padrão, emerald = positivo, sky = informativo).

| Cor | Ícone | Fundo do ícone | Borda do card | Hover | Selecionado |
|-----|-------|----------------|---------------|-------|-------------|
| **amber** | `text-primary` | `bg-primary/15` | `border-primary/20 hover:border-primary/40` | `hover:bg-primary/[0.04]` | `ring-1 ring-primary/40 border-primary/40` |
| **emerald** | `text-emerald-400` | `bg-emerald-400/15` | `border-emerald-400/20 hover:border-emerald-400/40` | `hover:bg-emerald-400/[0.04]` | `ring-1 ring-emerald-400/40 border-emerald-400/40` |
| **sky** | `text-sky-400` | `bg-sky-400/15` | `border-sky-400/20 hover:border-sky-400/40` | `hover:bg-sky-400/[0.04]` | `ring-1 ring-sky-400/40 border-sky-400/40` |

---

## 4. Background & Padrões

```css
/* Tabuleiro sutil — cobre o fundo inteiro */
.bg-chess-pattern {
  background-image:
    linear-gradient(45deg, #1c1917 25%, transparent 25%),
    linear-gradient(-45deg, #1c1917 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #1c1917 75%),
    linear-gradient(-45deg, transparent 75%, #1c1917 75%);
  background-size: 60px 60px;
}

/* Opacidade reduzida na tela db */
.board-pattern {
  opacity: 0.42;
}
```

**Aplicação na tela:**
```html
<!-- Camadas absolutas atrás do conteúdo -->
<div class="board-background absolute inset-0 pointer-events-none gpu-accelerated" />
<div class="bg-chess-pattern board-pattern absolute inset-0 pointer-events-none gpu-accelerated" />
```

---

## 5. Layout Geral

```
┌─────────────────────────────────────────────────────┐
│ AppSidebar (navegação, collapsível)                  │
├─────────────────────────────────────────────────────┤
│ SidebarInset                                        │
│ ┌──────────────────────────────────────────────────┐│
│ │ HEADER  h-14  bg-background/60 backdrop-blur-xl  ││
│ │ [logo/título] [barra de busca]  [ações]          ││
│ └──────────────────────────────────────────────────┘│
│ ┌─────────────────┬──┬──────────────────────────┐   │
│ │ Painel Esquerdo │  │ Painel Direito (tabela)   │   │
│ │ cards de itens  │  │ colunas + linhas          │   │
│ │ ─── resize ──── │  │                           │   │
│ │ preview panel   │  │                           │   │
│ └─────────────────┴──┴──────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

**Classes dos painéis:**
- Header: `relative z-30 flex h-14 shrink-0 items-center gap-4 border-b border-white/5 bg-background/60 px-6 backdrop-blur-xl`
- Esquerdo: `overflow-y-auto border-b border-white/10 px-6 py-4 space-y-5`
- Separador vertical (drag): `w-2 cursor-col-resize bg-white/5 hover:bg-primary/20 active:bg-primary/30 z-10`
- Separador horizontal (drag): `h-2 cursor-row-resize bg-white/5 hover:bg-primary/20 active:bg-primary/30`
- Ícone do separador: `h-4 w-4 text-muted-foreground/50 group-hover:text-primary/70`

---

## 6. Componente — Card de Item

Usado em grade com scroll horizontal, suporta drag & drop (DnD Kit).

```html
<button class="
  flex items-center gap-3
  rounded-xl border bg-card/50
  px-4 py-3
  text-left
  transition-all
  backdrop-blur-sm
  cursor-grab active:cursor-grabbing
  {border + hover da cor}
  {ring + border ao selecionar}
"
  style="min-width: 210px; opacity: isDragging ? 0 : 1"
>
  <!-- Ícone -->
  <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg {iconBg}">
    <Icon class="h-5 w-5 {iconColor}" />
  </div>

  <!-- Texto -->
  <div class="min-w-0">
    <p class="truncate text-sm font-semibold text-foreground">Nome</p>
    <p class="text-[11px] text-muted-foreground">Subtexto</p>
  </div>
</button>
```

**Card durante drag (Overlay):** `bg-card/80 shadow-2xl cursor-grabbing`

---

## 7. Componente — Seção de Categoria

Cabeçalho colapsível + grade de cards.

```html
<!-- Cabeçalho da seção -->
<button class="
  mb-2 flex items-center gap-1.5
  text-[11px] uppercase tracking-wide
  text-muted-foreground
  transition-colors hover:text-foreground
">
  <ChevronDown class="h-3 w-3" />
  Label (N)
</button>

<!-- Quando um item está sendo arrastado sobre a seção -->
<div class="rounded-lg p-1 -m-1 transition-colors bg-primary/10 ring-1 ring-primary/40">

<!-- Drop target vazio (placeholder) -->
<div class="
  flex items-center justify-center
  rounded-xl border border-dashed border-primary/50
  bg-primary/5 px-4 py-3
  text-[11px] text-primary/70
"
  style="min-width: 210px; min-height: 64px"
>
  Soltar aqui
</div>
```

---

## 8. Componente — Header da Tela

```html
<header class="relative z-30 flex h-14 shrink-0 items-center gap-4 border-b border-white/5 bg-background/60 px-6 backdrop-blur-xl">

  <!-- Título -->
  <div class="flex items-center gap-2.5">
    <Icon class="h-4 w-4 text-primary" />
    <div class="flex flex-col gap-0.5">
      <h1 class="text-base font-bold leading-none tracking-tight text-foreground font-serif">
        Título
      </h1>
      <span class="text-[10px] font-medium text-muted-foreground uppercase tracking-widest leading-none">
        subtítulo
      </span>
    </div>
  </div>

  <!-- Divisor -->
  <div class="h-6 w-px bg-white/10 hidden md:block" />

  <!-- Barra de busca central -->
  <div class="relative mx-auto flex-1 max-w-xl">
    <div class="flex h-8 items-center gap-2 rounded-md border px-3 border-white/[0.08] bg-card/40 hover:border-white/[0.10] focus-within:border-white/[0.12]">
      <SearchIcon class="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
      <input class="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
             placeholder="Buscar..." />
      <!-- Botão limpar -->
      <X class="h-3 w-3 text-muted-foreground/40 hover:text-muted-foreground/70" />
      <!-- Separador interno -->
      <div class="h-3.5 w-px bg-white/[0.08]" />
      <!-- Botão de filtros -->
      <SlidersIcon class="h-3.5 w-3.5 text-muted-foreground/60 hover:text-muted-foreground" />
    </div>
  </div>

  <!-- Ações -->
  <!-- Botão secundário -->
  <button class="flex items-center gap-1.5 rounded-md border border-white/10 bg-card/50 px-3 py-1.5 text-xs text-muted-foreground hover:bg-white/[0.06] hover:text-foreground">
    <Icon class="h-3.5 w-3.5" />
    Ação Secundária
  </button>

  <!-- Botão primário -->
  <button class="flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs text-primary hover:bg-primary/20">
    <Plus class="h-3.5 w-3.5" />
    Ação Principal
  </button>

</header>
```

---

## 9. Componente — Barra de Status da Tabela

```html
<div class="flex h-10 shrink-0 items-center gap-2 border-b border-white/10 bg-card/30 px-4">
  <span class="text-[11px] text-muted-foreground">
    <span class="font-medium text-foreground/70">Nome do recurso</span>
    <span class="mx-1.5 text-white/20">·</span>
    <span class="tabular-nums">1.234 itens</span>
  </span>

  <!-- Badge de filtros ativos -->
  <span class="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
    2 filtros ativos
  </span>
</div>
```

---

## 10. Componente — Tabela de Dados

```html
<!-- Cabeçalho da tabela -->
<div class="grid shrink-0 select-none border-b border-white/10 bg-card/50 text-[10px] font-medium uppercase tracking-wider">
  <button class="flex items-center gap-1 py-1.5 px-2 text-muted-foreground/80 hover:text-primary transition-colors">
    Coluna
    <ArrowUpDown class="h-2.5 w-2.5 opacity-40 group-hover:opacity-80" />
  </button>
</div>

<!-- Lista de linhas -->
<div class="flex-1 overflow-y-auto divide-y divide-white/[0.05]">
  <!-- Linha par (default) -->
  <button class="grid w-full text-left text-xs hover:bg-white/[0.04] transition-colors">
    <div class="px-2 py-1 tabular-nums text-muted-foreground/60">id</div>
    <div class="px-1.5 py-1 truncate text-foreground/85">valor</div>
    <div class="px-1.5 py-1 tabular-nums text-muted-foreground">num</div>
  </button>

  <!-- Linha ímpar -->
  <button class="grid ... bg-white/[0.015] hover:bg-white/[0.04]">...</button>

  <!-- Linha selecionada -->
  <button class="grid ... bg-primary/10 text-foreground">...</button>
</div>

<!-- Loader de paginação -->
<div class="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground">
  <Loader2 class="h-3.5 w-3.5 animate-spin" />
  Carregando mais...
</div>
```

**Estado vazio:**
```html
<div class="flex items-center justify-center py-12 text-xs text-muted-foreground">
  Nenhum item encontrado.
</div>
```

---

## 11. Componente — Painel de Preview

Painel flutuante ancorado no canto inferior-direito, redimensionável.

```html
<!-- Wrapper absoluto -->
<div class="
  absolute bottom-0 right-0
  flex flex-col
  rounded-tl-lg
  border border-white/10
  bg-black/20
  shadow-[0_10px_28px_rgba(0,0,0,0.35)]
  backdrop-blur-sm
">
  <!-- Handle de resize (canto superior esquerdo) -->
  <button class="absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2 h-4 w-4 cursor-nwse-resize rounded-sm border border-primary/30 bg-black/70">
    <span class="h-2.5 w-2.5 border-l border-t border-primary/80" />
  </button>

  <!-- Info do item selecionado -->
  <div class="rounded-md border border-white/10 bg-black/25 px-2 py-1.5">
    <p class="truncate text-[11px] font-medium text-foreground/90">Título do item</p>
    <p class="mt-1 truncate text-[10px] text-muted-foreground/70">
      <span class="font-mono text-primary/80">CÓDIGO</span>
      <span class="mx-1 text-white/20">•</span>
      <span>metadado</span>
    </p>
  </div>

  <!-- Grid conteúdo (notação + visualização) -->
  <div class="mt-2 grid gap-2" style="grid-template-columns: Npx minmax(0, 1fr)">
    <!-- Painel de itens (lista scrollável) -->
    <div class="min-h-0 overflow-y-auto rounded-md border border-white/10 bg-black/25 p-1.5">
      <!-- Item da lista -->
      <div class="grid items-center gap-1 text-[10px]">
        <!-- Número -->
        <span class="text-right tabular-nums text-muted-foreground/55">1.</span>
        <!-- Item ativo -->
        <button class="truncate rounded px-1 py-0.5 bg-primary/25 text-primary text-left">item</button>
        <!-- Item inativo -->
        <button class="truncate rounded px-1 py-0.5 text-foreground/85 hover:bg-white/10 text-left">item</button>
      </div>
    </div>

    <!-- Área de conteúdo visual -->
    <div class="flex items-start justify-center">
      <!-- Visualização principal (ex: thumbnail, board, preview) -->
    </div>
  </div>

  <!-- Controles de navegação -->
  <div class="mt-2.5 flex items-center justify-center gap-1.5">
    <button class="flex h-6 w-6 items-center justify-center rounded-md border border-white/10 bg-black/25 text-muted-foreground hover:border-white/25 hover:text-foreground disabled:opacity-35">
      <ChevronsLeft class="h-3.5 w-3.5" />
    </button>
    <!-- ChevronLeft / ChevronRight / ChevronsRight — mesmas classes -->
  </div>

  <!-- Posição atual -->
  <div class="mt-1 text-center text-[10px] text-muted-foreground/80">
    Label atual <span class="mx-1 text-white/20">•</span>
    <span class="tabular-nums">2/40</span>
  </div>

</div>
```

**Estado vazio do preview:**
```html
<div class="rounded-md border border-dashed border-white/10 bg-black/20 px-3 py-4 text-center text-[10px] text-muted-foreground/70">
  Selecione um item para pré-visualizar.
</div>
```

---

## 12. Componente — Painel de Filtros Avançados

Dropdown ancorado na barra de busca, estilo popover.

```html
<div class="absolute left-0 right-0 top-[calc(100%-6px)]">
  <div class="w-full rounded-b-lg border-x border-b border-white/[0.10] bg-stone-950 pt-2 shadow-2xl">
    <div class="p-3">
      <div class="grid grid-cols-2 gap-x-4 gap-y-2.5">

        <!-- Campo de texto -->
        <div>
          <label class="mb-1 block text-[9px] font-medium uppercase tracking-widest text-muted-foreground/60">
            Campo
          </label>
          <input class="
            w-full rounded border border-white/[0.06] bg-card/50
            px-2 py-1 text-[11px] text-foreground
            placeholder:text-muted-foreground/40
            transition-colors
            focus:border-white/[0.12] focus:outline-none
          " placeholder="..." />
        </div>

        <!-- Grupo de toggle buttons -->
        <div>
          <label class="mb-1 block text-[9px] font-medium uppercase tracking-widest text-muted-foreground/60">
            Opção
          </label>
          <div class="flex gap-1">
            <!-- Ativo -->
            <button class="flex-1 rounded border py-1 text-[11px] font-medium border-amber-500/40 bg-amber-500/15 text-amber-400">
              Ativo
            </button>
            <!-- Inativo -->
            <button class="flex-1 rounded border py-1 text-[11px] font-medium border-white/[0.06] bg-card/50 text-muted-foreground/50 hover:border-white/[0.08] hover:text-muted-foreground/80">
              Inativo
            </button>
          </div>
        </div>

        <!-- Campo range (De / Até) -->
        <div>
          <label class="mb-1 block text-[9px] font-medium uppercase tracking-widest text-muted-foreground/60">Range</label>
          <div class="flex items-center gap-1.5">
            <input class="w-full rounded border border-white/[0.06] bg-card/50 px-2 py-1 text-[11px] ..." placeholder="De" />
            <span class="shrink-0 text-[10px] text-muted-foreground/60">–</span>
            <input class="w-full ..." placeholder="Até" />
          </div>
        </div>

      </div>

      <!-- Footer do painel -->
      <div class="mt-3 flex items-center justify-end gap-2 border-t border-white/[0.05] pt-2.5">
        <button class="px-3 py-1 text-[11px] text-muted-foreground hover:text-foreground">
          Limpar
        </button>
        <button class="
          rounded bg-primary/90 px-4 py-1
          text-[11px] font-medium text-primary-foreground
          shadow-[0_0_12px_rgba(217,119,6,0.25)]
          hover:bg-primary transition-colors
        ">
          Aplicar
        </button>
      </div>
    </div>
  </div>
</div>
```

---

## 13. Componente — Modal (Dialog)

```html
<!-- Overlay -->
<div class="fixed inset-0 z-[9998] flex items-center justify-center">
  <div class="absolute inset-0 bg-black/30 backdrop-blur-[2px]" />

  <!-- Container -->
  <div class="relative z-10 w-full max-w-xs rounded-lg border border-white/10 bg-stone-950 shadow-2xl">

    <!-- Header -->
    <div class="border-b border-white/[0.06] px-4 py-2.5">
      <h2 class="text-center text-xs font-semibold text-foreground font-serif">Título</h2>
    </div>

    <!-- Body -->
    <div class="px-4 py-3">
      <label class="mb-1 block text-[10px] font-medium uppercase tracking-widest text-muted-foreground/55">
        Campo
      </label>
      <input class="
        w-full rounded-md border border-white/10 bg-white/[0.04]
        px-2.5 py-1.5 text-xs text-foreground
        placeholder:text-muted-foreground/40
        focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20
        transition-colors
      " />
      <!-- Para campo destrutivo: focus:border-destructive/40 focus:ring-destructive/20 -->
    </div>

    <!-- Footer -->
    <div class="flex items-center justify-end gap-2 border-t border-white/[0.06] px-4 py-2.5">
      <!-- Cancelar -->
      <button class="rounded-md px-3 py-1 text-[11px] text-muted-foreground hover:bg-white/[0.05] hover:text-foreground">
        Cancelar
      </button>
      <!-- Confirmar -->
      <button class="
        rounded-md bg-primary/90 px-4 py-1
        text-[11px] font-medium text-primary-foreground
        shadow-[0_0_12px_rgba(217,119,6,0.25)]
        hover:bg-primary disabled:opacity-40
        transition-colors
      ">
        Confirmar
      </button>
    </div>
  </div>
</div>
```

**Variação destrutiva do botão:**
```html
<button class="rounded-md bg-destructive/90 px-4 py-1 text-[11px] font-medium text-white hover:bg-destructive">
  Excluir
</button>
```

---

## 14. Componente — Context Menu

```html
<div class="
  fixed z-[9999]
  rounded-lg border border-white/10
  bg-stone-950/95 shadow-2xl backdrop-blur-sm
  py-1 min-w-[160px]
">
  <!-- Item normal -->
  <button class="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:bg-white/[0.05] hover:text-foreground">
    <Icon class="h-3.5 w-3.5" />
    Ação
  </button>

  <!-- Separador -->
  <div class="my-1 border-t border-white/[0.06]" />

  <!-- Item destrutivo -->
  <button class="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-destructive/80 hover:bg-destructive/10 hover:text-destructive">
    <Trash2 class="h-3.5 w-3.5" />
    Excluir
  </button>
</div>
```

---

## 15. Feedback de Status

```html
<!-- Sucesso -->
<div class="border-b border-emerald-500/25 bg-emerald-500/10 px-4 py-1.5 text-[11px] text-emerald-300">
  Operação realizada com sucesso.
</div>

<!-- Erro (com botão de fechar) -->
<div class="flex items-center justify-between gap-2 border-b border-destructive/25 bg-destructive/10 px-4 py-1.5 text-[11px] text-destructive">
  <span>Mensagem de erro.</span>
  <button class="shrink-0 opacity-60 hover:opacity-100"><X class="h-3 w-3" /></button>
</div>

<!-- Importando / processando (na barra de status) -->
<div class="flex items-center gap-2 text-[11px] text-muted-foreground">
  <Loader2 class="h-3.5 w-3.5 animate-spin text-primary" />
  Operação em andamento...
</div>

<!-- Badge de filtros / contagem inline -->
<span class="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
  N filtros ativos
</span>
```

---

## 16. Scrollbar Customizada

```css
::-webkit-scrollbar {
  width: 6px;
}
::-webkit-scrollbar-track {
  background: #0c0a09;
}
::-webkit-scrollbar-thumb {
  background: #44403c;     /* Stone 700 */
  border-radius: 3px;
}
```

---

## 17. Performance (classes utilitárias)

```css
/* GPU acceleration para elementos fixos ou com backdrop */
.gpu-accelerated {
  transform: translateZ(0);
  backface-visibility: hidden;
  perspective: 1000px;
}

/* Para elementos animados frequentemente */
.will-animate {
  will-change: transform, opacity;
  backface-visibility: hidden;
}

/* Para elementos drag & drop */
.draggable-item {
  touch-action: manipulation;
  user-select: none;
  -webkit-user-drag: none;
}
```

---

## 18. Checklist para nova tela no mesmo estilo

- [ ] Background: `bg-chess-pattern board-pattern absolute inset-0` (opacity 0.42)
- [ ] Header: `h-14 border-b border-white/5 bg-background/60 backdrop-blur-xl`
- [ ] Título: `font-serif` (Merriweather) / Subtítulo: `uppercase tracking-widest text-[10px]`
- [ ] UI/textos: `font-sans` (Inter)
- [ ] Cards: `rounded-xl border bg-card/50 backdrop-blur-sm` com color map (amber/emerald/sky)
- [ ] Tabela: `divide-y divide-white/[0.05]` com cabeçalho `bg-card/50`
- [ ] Linha selecionada: `bg-primary/10`
- [ ] Botão primário: `bg-primary/10 border-primary/30 text-primary hover:bg-primary/20`
- [ ] Botão CTA: `bg-primary/90 shadow-[0_0_12px_rgba(217,119,6,0.25)]`
- [ ] Modais: `bg-stone-950 border-white/10 backdrop-blur-[2px]`
- [ ] Status success: `bg-emerald-500/10 text-emerald-300`
- [ ] Status error: `bg-destructive/10 text-destructive`
- [ ] Bordas internas: `border-white/[0.06]` a `border-white/10`
- [ ] Separadores: `text-white/20` (ponto central `·`)
- [ ] Mono codes: `font-mono text-primary/70`
- [ ] Scrollbar: CSS customizado (6px, stone 700)
- [ ] Layers com `gpu-accelerated` para backgrounds fixos
- [ ] Ícones: Lucide React (`h-3.5 w-3.5` pequenos, `h-4 w-4` médios, `h-5 w-5` em cards)

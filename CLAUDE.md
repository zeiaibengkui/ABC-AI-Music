# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev            # Start Vite dev server
pnpm build          # Type-check then build for production
pnpm preview        # Preview production build locally
pnpm type-check     # Run vue-tsc type checking
pnpm lint           # Run all linters (oxlint + eslint)
pnpm lint:oxlint    # Run oxlint only (with auto-fix)
pnpm lint:eslint    # Run eslint only (with auto-fix and cache)
pnpm format         # Format src/ with prettier
```

There are no tests yet.

## Architecture

A Vue 3 SPA (Vite + TypeScript) that generates ABC music notation from natural language prompts via the Anthropic API, then renders sheet music and playback using abcjs.

**Key layers:**

- **`src/main.ts`** — App bootstrap. Sets up Pinia (with `pinia-plugin-persistedstate`), BootstrapVueNext, and FontAwesome icons, then mounts the Vue app.
- **`src/App.vue`** — Root component. 40/60 split layout: `PromptPanel` (sidebar) on the left, `MusicPanel` (sheet music + playback) on the right. Manages dark/light mode toggle via `data-bs-theme`.
- **`src/stores/music.ts`** — Central Pinia store (setup-store style). Holds all state: prompt, abcNotation, loading/playing flags, error, history, dark mode, and streaming text/thinking. The `generate()` action calls `useAiGenerator().generateStream()`. Persists `history` and `darkMode` to localStorage.
- **`src/composables/useAiGenerator.ts`** — The AI integration layer. Calls the Anthropic Messages API (SSE streaming for real-time UX, non-streaming for correction retries). Includes a self-debugging loop: generates ABC notation, validates it (checks for X:/K:/M: headers, note pitches, bar lines, balanced quotes), and retries up to 3 times with error detail. Falls back to mock generation (hardcoded tunes) when `VITE_ANTHROPIC_API_KEY` is unset — no API key needed for dev.
- **`src/components/PromptPanel.vue`** — Left sidebar: prompt textarea, generate button, live streaming preview of ABC text, collapsible "AI thinking" panel showing model reasoning, and history list.
- **`src/components/MusicPanel.vue`** — Right panel: abcjs-rendered sheet music, audio playback controls (via abcjs `SynthController`), volume slider, chord instrument/strum pattern selectors, and raw ABC notation viewer. Manages its own `AudioContext` with master gain routing. Supports MIDI download.

**Styling:** Bootstrap 5 via `bootstrap-vue-next` components, with custom Solarized Light theme (`src/solarized.scss`) overriding Bootstrap CSS variables. Dark mode uses Bootstrap's built-in dark theme (`data-bs-theme="dark"`).

**Env vars** (all `VITE_` prefixed, exposed to browser):

| Variable | Purpose |
|---|---|
| `VITE_ANTHROPIC_API_KEY` | Anthropic API key (omit for mock mode) |
| `VITE_ANTHROPIC_MODEL` | Model ID (default: `claude-sonnet-5`) |
| `VITE_ANTHROPIC_BASE_URL` | API base URL (default: `https://api.anthropic.com`) |

**Code style:** No semicolons, single quotes, 100-char print width (Prettier). Path alias `@/` maps to `src/`. TypeScript strict with `noUncheckedIndexedAccess`. ESLint flat config using `@vue/eslint-config-typescript` + oxlint plugin.

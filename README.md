# ABC-AI-Music

Generate music from text prompts using AI, rendered and played through [abcjs](https://www.abcjs.net/). Describe what you want to hear — a melody, chord progression, or full arrangement — and let the AI turn it into ABC notation, visualized and playable in the browser.

## How It Works

1. **Prompt** — describe the music you want in natural language (e.g. "a cheerful Irish jig in D major").
2. **Generate** — an LLM produces ABC notation matching your description.
3. **Render & Play** — abcjs renders the sheet music and provides playback controls, all in your browser.

## Project Setup

```sh
pnpm install
```

### Development

```sh
pnpm dev
```

### Build for Production

```sh
pnpm build
```

### Lint

```sh
pnpm lint
```

## Tech Stack

- [Vue 3](https://vuejs.org/) — UI framework
- [Vite](https://vite.dev/) — build tool
- [abcjs](https://www.abcjs.net/) — ABC notation rendering and playback
- [Pinia](https://pinia.vuejs.org/) — state management
- AI text generation (LLM)

## License

MIT

# ABC AI Music

## Overview

Let non-multi LLM produce music via abcjs, i.e. natural language.

## Preview

```abcjs
X:1
T:Complex Concerto in D minor
M:4/4
L:1/8
K:Dmin
%%MIDI program 1 40
"Bbmaj7"B2F2 "Gm7"G4 | "A7b9"A2G2 "Dm"F2ED | "Edim"E2C2 "A7"E2A2 | "Dm"D8 |
"Gm"G2B2 "C7"AGFE | "F"F2A2 "Bbmaj7"dcBA | "E7"^G2B2 "Am"e2d2 | "A7"c2e2 a2^g2 |
"B°"a2ff "E7"e2d2 | "Am"c2A2 "Dm"B2AG | "G7"F2E2 "C"E2D2 | "F"A,2C2 "Gm"F2E2 |
"Dm"F2A2 "A7"d2c2 | "Bbmaj7"B2d2 "E°"f2e2 | "A"e2c2 "Dm"a4- | a8 |]
```

## Usability

AI can process easy pieces, that said, it cannot handle even a complex rhythm.
So you'd better do things yourself, shouldn't you?

## Run

1. pnpm install
2. fill .env
3. pnpm dev

## Architecture

- Vue
- abcJS
- Anthropic API

## Env Variables

```bash
VITE_ANTHROPIC_API_KEY=sk-...
VITE_ANTHROPIC_MODEL=claude-sonnet-5
VITE_ANTHROPIC_BASE_URL=https://api.anthropic.com
```

No API key falls back to mock generation for development/testing.

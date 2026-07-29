/**
 * Composable for generating ABC notation from a text prompt via an LLM.
 *
 * - Primary generation uses SSE streaming so the user can see the model's
 *   thinking in real time.
 * - Correction retries use non-streaming requests (fast, no UI needed).
 *
 * Uses an Anthropic-compatible Messages API endpoint.
 */

const MAX_RETRIES = 3

const SYSTEM_PROMPT = `You are an expert music composer who writes ABC notation.
Given a description of music, generate valid ABC notation that matches the description.
Rules:
- Output ONLY the ABC notation, no explanation, no markdown fences, no other text.
- Include X:1, T: (title), M: (meter), L: (default note length), and K: (key) headers.
- Write a complete, playable tune — at least 8 bars with a clear A/B structure.
- Use chord symbols in double quotes where appropriate (e.g. "Am").
- Match the mood, style, and tempo described in the prompt.
- Use standard ABC syntax only.`

export interface StreamCallbacks {
  onThinking: (text: string) => void
  onTextDelta: (text: string) => void
}

export function useAiGenerator() {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY || ''

  /**
   * Streaming generation — calls onThinking / onTextDelta as chunks arrive.
   * Returns the complete ABC text once the stream finishes.
   */
  async function generateStream(
    prompt: string,
    callbacks: StreamCallbacks,
  ): Promise<string> {
    if (!apiKey) {
      console.warn('No API key set — using mock generation')
      return mockGenerate(prompt, callbacks)
    }

    let abcNotation = await callAiStream(prompt, SYSTEM_PROMPT, callbacks)

    // Self-debugging loop (non-streaming, fast)
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      const errors = validateAbc(abcNotation)
      if (errors.length === 0) break

      console.warn(
        `ABC validation failed (attempt ${attempt}/${MAX_RETRIES}):`,
        errors.join('; '),
      )

      const correctionPrompt =
        `The ABC notation you generated has the following problems:\n` +
        errors.map((e) => `- ${e}`).join('\n') +
        `\n\nHere is the broken notation:\n\`\`\`\n${abcNotation}\n\`\`\`\n\n` +
        `Please output ONLY the corrected ABC notation. Fix ALL of the issues listed above.`

      try {
        abcNotation = await callAi(correctionPrompt, SYSTEM_PROMPT)
      } catch {
        break
      }
    }

    return abcNotation
  }

  return { generateStream }
}

// ── Streaming API call ─────────────────────────────────

async function callAiStream(
  userPrompt: string,
  systemPrompt: string,
  callbacks: StreamCallbacks,
): Promise<string> {
  const baseUrl = import.meta.env.VITE_ANTHROPIC_BASE_URL || 'https://api.anthropic.com'
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY || ''
  const model = import.meta.env.VITE_ANTHROPIC_MODEL || 'claude-sonnet-5'

  const response = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      stream: true,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`API error ${response.status}: ${err}`)
  }

  // Parse SSE stream
  const reader = response.body?.getReader()
  if (!reader) throw new Error('No response body')

  const decoder = new TextDecoder()
  let buffer = ''
  let textResult = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (!data) continue

      try {
        const event = JSON.parse(data)

        // Thinking deltas
        if (event.type === 'content_block_delta') {
          const delta = event.delta
          if (delta?.type === 'thinking_delta' && delta.thinking) {
            callbacks.onThinking(delta.thinking)
          } else if (delta?.type === 'text_delta' && delta.text) {
            textResult += delta.text
            callbacks.onTextDelta(delta.text)
          }
        }
      } catch {
        // Skip unparseable events
      }
    }
  }

  return textResult.trim()
}

// ── Non-streaming API call (for correction retries) ────

async function callAi(userPrompt: string, systemPrompt: string): Promise<string> {
  const baseUrl = import.meta.env.VITE_ANTHROPIC_BASE_URL || 'https://api.anthropic.com'
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY || ''
  const model = import.meta.env.VITE_ANTHROPIC_MODEL || 'claude-sonnet-5'

  const response = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`API error ${response.status}: ${err}`)
  }

  const data = await response.json()
  const textBlock = data.content?.find(
    (c: { type: string; text?: string }) => c.type === 'text',
  )
  const text: string = textBlock?.text ?? ''
  if (!text.trim()) throw new Error('Empty response from API')
  return text.trim()
}

// ── Validation ────────────────────────────────────────

function validateAbc(abc: string): string[] {
  const errors: string[] = []
  const stripped = stripMarkdownFences(abc)

  if (!/^X:\s*\d+/m.test(stripped)) errors.push('Missing X: (reference number) header')
  if (!/^K:\s*[A-Ga-g]/m.test(stripped)) errors.push('Missing K: (key signature) header')
  if (!/^M:\s*\d+\/\d+/m.test(stripped)) errors.push('Missing M: (meter / time signature) header')

  const afterHeaders = stripped
    .split('\n')
    .filter((l) => !/^[A-Za-z]:\s/.test(l))
    .join('\n')
  if (!/[A-Ga-g][',]*/.test(afterHeaders)) errors.push('No note pitches found')
  if (!/[|:]/.test(afterHeaders)) errors.push('No bar lines (|) found')

  const quoteCount = (stripped.match(/"/g) || []).length
  if (quoteCount % 2 !== 0) errors.push('Unclosed double-quote in chord symbols')

  const headerEndMatch = stripped.match(/^K:.*$/m)
  if (headerEndMatch) {
    const headerEnd = stripped.indexOf(headerEndMatch[0]) + headerEndMatch[0].length
    const body = stripped.slice(headerEnd)
    const nonAbcLines = body
      .split('\n')
      .filter((l) => l.trim() && !/[|:]/.test(l) && !/[A-Ga-g][',]*/.test(l) && !/^w:/.test(l))
    if (nonAbcLines.length > 2) errors.push('Appears to contain non-ABC text')
  }

  return errors
}

function stripMarkdownFences(text: string): string {
  return text
    .replace(/^```(?:abc)?\s*\n?/i, '')
    .replace(/\n?```\s*$/i, '')
    .trim()
}

// ── Mock fallback ─────────────────────────────────────

async function mockGenerate(
  prompt: string,
  callbacks: StreamCallbacks,
): Promise<string> {
  const tunes = {
    waltz: `X:1\nT:Generated Waltz\nM:3/4\nL:1/4\nK:Em\n|:"Em" E2 G B | "Am" A2 c e | "D" d2 B A | "G" G2 F# E | "Em" E2 G B | "Am" A c e | "B7" ^D2 ^F A | "Em" E6 :|\n|:"C" E2 G c | "G" B2 G B | "Am" A2 c e | "Em" G2 E G | "C" E G c e | "G" B G B d | "B7" ^F A ^d f | "Em" E6 :|`,
    jig: `X:1\nT:Generated Jig\nM:6/8\nL:1/8\nK:D\n|:"D" A2 F D2 F | A2 d f2 d | "G" B2 G D2 G | B2 d g2 f | "D" a2 f d2 f | "A" e2 c A2 c | "D" d3 "A" e3 | "D" d6 :|\n|:"G" B2 G d2 B | g2 d B2 G | "D" A2 F d2 A | f2 d A2 F | "G" g2 f "D" f2 e | "A" e2 d c2 B |1 "D" A3 B3 | A6 :|2 "D" A2 B c2 e | d6 |`,
    blues: `X:1\nT:Generated Blues\nM:4/4\nL:1/8\nK:C\n|:"C7" C2 E G c2 e- | e2 d c2 _B G2 | "F7" F2 A c f2 a- | a2 g f2 A c2 | "C7" C2 E G c2 e- | e d c B G2 |\nw:Walk-in' down that lone-ly road\n|"G7" G,2 B, D G2 F | "F7" F A c f a2 g | "C7" C2 E G c2 B | "G7" G2 B d f2 d | "C7" c8 :|`,
    lullaby: `X:1\nT:Generated Lullaby\nM:3/4\nL:1/4\nK:F\n|:"F" c2 A | F2 G | A2 c | "Bb" d3 | "C7" B2 G | E2 F | G2 B | "F" c3 |\nw:Hush now, close your eyes\n|"Am" A2 F | "Dm" d2 c | "Gm" B2 G | "C7" G3 | "F" A2 G | "Bb" F2 E | "C7" G2 B | "F" F6 :|`,
  }

  const lower = prompt.toLowerCase()
  const entry = Object.entries(tunes).find(([k]) => lower.includes(k))
  const abc = entry?.[1] ?? tunes.blues

  // Simulate streaming
  callbacks.onThinking('Analyzing the prompt for musical style, key, and structure…\n')
  await sleep(300)
  callbacks.onThinking('Choosing meter and tempo appropriate for the requested mood…\n')
  await sleep(300)
  callbacks.onThinking('Drafting the A section with chord progressions…\n')
  await sleep(300)
  callbacks.onThinking('Drafting the B section for contrast and resolution…\n')
  await sleep(200)

  // Stream the ABC text character by character
  for (const char of abc) {
    callbacks.onTextDelta(char)
    await sleep(5)
  }

  return abc
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Composable for generating ABC notation via LLM tool calls.
 *
 * The AI chats naturally with the user. When it wants to produce music,
 * it calls the `generate_music` tool. We execute the tool, render the
 * ABC notation, and return the result so the AI can comment on it.
 *
 * Uses an Anthropic-compatible Messages API endpoint with SSE streaming.
 */

const MAX_RETRIES = 3

const SYSTEM_PROMPT = `You are an expert music composer and arranger. Chat naturally with the user about music.
When the user asks you to compose a new piece, call generate_music directly.
When the user asks you to MODIFY existing music, you MUST call read_abc first to view the current notation, then call generate_music with your changes. The system enforces this — generate_music will be rejected if you haven't called read_abc since the last edit.

Rules for ABC notation inside the generate_music tool:
- Include X:1, T: (title), M: (meter), L: (default note length), and K: (key) headers.
- Write a complete, playable tune — at least 8 bars with a clear A/B structure.
- Use chord symbols in double quotes where appropriate (e.g. "Am").
- Match the mood, style, and tempo described in the prompt.
- Use standard ABC syntax only.
- Include %%MIDI directives to control the sound:
  * %%MIDI program <number> — melody instrument (e.g. 40=vln, 73=flute, 0=piano, 24=guitar, 56=trumpet)
  * %%MIDI chordprog <number> — chord instrument (e.g. 0=piano, 24=nylon guitar, 25=steel guitar, 48=strings, 16=organ)
  * %%MIDI gchord <pattern> — chord strum pattern (empty=block, f8=fast strum, s8=slow strum, f16=tremolo, "B2 A2 G2 F2"=arp up, "F2 G2 A2 B2"=arp down)
  * %%MIDI bassprog <number> — bass instrument
  * %%MIDI drumon / %%MIDI drumoff — toggle drums
- Choose instruments and patterns that fit the described mood and genre.

After generating music, briefly describe what you created — mention the key, style, instruments, and anything interesting about the piece.`

const TOOLS = [
  {
    name: 'read_abc',
    description:
      'Read the current ABC notation that is already in the conversation. You MUST call this before calling generate_music when modifying existing music. This is like reading a file before editing it.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'generate_music',
    description:
      'Generate or update ABC music notation and render it for playback. IMPORTANT: when modifying existing music, you must call read_abc first — the system will reject this call if you have not read the current notation.',
    input_schema: {
      type: 'object',
      properties: {
        abc_notation: {
          type: 'string',
          description:
            'Complete, valid ABC notation for the piece. Must include X:, T:, M:, L:, K: headers, chord symbols in double quotes, %%MIDI directives for sound, and at least 8 bars of music.',
        },
      },
      required: ['abc_notation'],
    },
  },
]

// ── Read-before-write enforcement ───────────────────────

let readSinceLastWrite = true // starts true so first write is allowed

/** Check whether the conversation already contains generated music. */
function hasExistingMusic(messages: Message[]): boolean {
  return messages.some((m) => {
    if (m.role !== 'assistant' || typeof m.content === 'string') return false
    return (m.content as ContentBlock[]).some(
      (b) => b.type === 'tool_use' && b.name === 'generate_music',
    )
  })
}

/** Extract the most recent ABC notation from the conversation's tool calls. */
function getExistingAbc(messages: Message[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!
    if (m.role !== 'assistant' || typeof m.content === 'string') continue
    const blocks = m.content as ContentBlock[]
    for (let j = blocks.length - 1; j >= 0; j--) {
      const b = blocks[j]!
      if (b.type === 'tool_use' && b.name === 'generate_music' && b.input?.abc_notation) {
        return String(b.input.abc_notation)
      }
    }
  }
  return null
}

// ── Public types ────────────────────────────────────────

export interface StreamCallbacks {
  onThinking: (text: string) => void
  onTextDelta: (text: string) => void
  onToolCall: () => void
}

export interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result'
  text?: string
  id?: string
  name?: string
  input?: Record<string, unknown>
  tool_use_id?: string
  content?: string
}

export interface Message {
  role: 'user' | 'assistant'
  content: string | ContentBlock[]
}

export interface GenerateResult {
  /** Assistant's chat text */
  text: string
  /** The raw content blocks for storage in conversation */
  contentBlocks: ContentBlock[]
  /** Extracted ABC notation if a tool was called */
  abcNotation?: string
}

// ── Composable ──────────────────────────────────────────

export function useAiGenerator() {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY || ''

  /**
   * Streaming generation with tool-use support.
   *
   * Sends the conversation to the API. If the AI calls the generate_music
   * tool, we execute it and run a follow-up call so the AI can respond.
   */
  async function generateStream(
    messages: Message[],
    callbacks: StreamCallbacks,
  ): Promise<GenerateResult> {
    if (!apiKey) {
      console.warn('No API key set — using mock generation')
      return mockGenerate(messages, callbacks)
    }

    // Phase 1: stream the AI's response (may include tool calls)
    const phase1 = await streamApiCall(messages, false, callbacks)

    // Separate tool_use blocks from text
    const toolUses = phase1.contentBlocks.filter((b) => b.type === 'tool_use')
    if (toolUses.length === 0) {
      return { text: phase1.text, contentBlocks: phase1.contentBlocks }
    }

    // Process all tool_use blocks in order
    const toolResults: ContentBlock[] = []
    let abcNotation: string | undefined

    for (const toolUse of toolUses) {
      if (toolUse.name === 'read_abc') {
        const existingAbc = getExistingAbc(messages)
        readSinceLastWrite = true
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: existingAbc
            ? `Current ABC notation:\n\`\`\`\n${existingAbc}\n\`\`\``
            : 'No existing music to read. Go ahead and compose a new piece.',
        })
      } else if (toolUse.name === 'generate_music') {
        // Enforce read-before-write
        if (!readSinceLastWrite && hasExistingMusic(messages)) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content:
              'BLOCKED: You must call read_abc to view the current notation before editing. Please call read_abc first, review the current ABC, then call generate_music with your changes.',
          })
          continue
        }

        let abc = String(toolUse.input?.abc_notation ?? '')

        // Validate + auto-correct
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
          const errors = validateAbc(abc)
          if (errors.length === 0) break

          console.warn(
            `ABC validation failed (attempt ${attempt}/${MAX_RETRIES}):`,
            errors.join('; '),
          )

          const correctionPrompt =
            `The ABC notation you generated has the following problems:\n` +
            errors.map((e) => `- ${e}`).join('\n') +
            `\n\nHere is the broken notation:\n\`\`\`\n${abc}\n\`\`\`\n\n` +
            `Please output ONLY the corrected ABC notation. Fix ALL of the issues listed above.`

          try {
            abc = await callAi(correctionPrompt)
          } catch {
            break
          }
        }

        readSinceLastWrite = false
        abcNotation = abc
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: 'Music generated successfully.',
        })
      }
    }

    // Phase 3: send tool_results, get AI's final text
    const phase3Messages: Message[] = [
      ...messages,
      { role: 'assistant', content: phase1.contentBlocks },
      { role: 'user', content: toolResults },
    ]

    const phase3 = await streamApiCall(phase3Messages, true, callbacks)

    return {
      text: (phase1.text + ' ' + phase3.text).trim(),
      contentBlocks: [...phase1.contentBlocks, ...toolResults, ...phase3.contentBlocks],
      abcNotation,
    }
  }

  return { generateStream }
}

// ── Core streaming call ─────────────────────────────────

async function streamApiCall(
  messages: Message[],
  isToolResult: boolean,
  callbacks: StreamCallbacks,
): Promise<{ text: string; contentBlocks: ContentBlock[] }> {
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
      system: isToolResult
        ? 'You are a music composition assistant. If the tool result shows the music was generated successfully, briefly acknowledge it — mention a key detail or two. If the tool was BLOCKED (read-before-write), apologize briefly and call read_abc first, then you can call generate_music. If read_abc returned the current notation, acknowledge what you see and then call generate_music with your changes. Be conversational.'
        : SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`API error ${response.status}: ${err}`)
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error('No response body')

  const decoder = new TextDecoder()
  let buffer = ''

  // Accumulate content blocks from the stream
  const blocks: Map<number, ContentBlock> = new Map()
  let textResult = ''
  let toolJsonBuffer = ''

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

        // --- content_block_start ---
        if (event.type === 'content_block_start') {
          const block = event.content_block
          if (block) {
            blocks.set(event.index, { ...block })
            if (block.type === 'tool_use') {
              toolJsonBuffer = ''
              callbacks.onToolCall()
            }
          }
        }

        // --- content_block_delta ---
        if (event.type === 'content_block_delta') {
          const delta = event.delta
          if (!delta) continue

          if (delta.type === 'thinking_delta' && delta.thinking) {
            callbacks.onThinking(delta.thinking)
          } else if (delta.type === 'text_delta' && delta.text) {
            textResult += delta.text
            callbacks.onTextDelta(delta.text)
            // Write the accumulated text back into the block
            const textBlock = blocks.get(event.index)
            if (textBlock && textBlock.type === 'text') {
              textBlock.text = (textBlock.text || '') + delta.text
            }
          } else if (delta.type === 'input_json_delta' && delta.partial_json) {
            toolJsonBuffer += delta.partial_json
          }
        }

        // --- content_block_stop ---
        if (event.type === 'content_block_stop') {
          const block = blocks.get(event.index)
          if (block?.type === 'tool_use' && toolJsonBuffer) {
            try {
              block.input = JSON.parse(toolJsonBuffer)
            } catch {
              // If JSON is incomplete, store what we have
              block.input = {}
            }
          }
        }

        // --- message_delta (stop_reason) ---
        // No action needed here — we consume the whole stream
      } catch {
        // Skip unparseable events
      }
    }
  }

  const contentBlocks: ContentBlock[] = Array.from(blocks.values())

  return { text: textResult.trim(), contentBlocks }
}

// ── Non-streaming API call (for correction retries) ────

async function callAi(userPrompt: string): Promise<string> {
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
      system: 'You are an expert music composer. Output ONLY the corrected ABC notation, no explanation.',
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

// ── Validation ──────────────────────────────────────────

function validateAbc(abc: string): string[] {
  const errors: string[] = []
  const stripped = stripMarkdownFences(abc)

  if (!/^X:\s*\d+/m.test(stripped)) errors.push('Missing X: (reference number) header')
  if (!/^K:\s*[A-Ga-g]/m.test(stripped)) errors.push('Missing K: (key signature) header')
  if (!/^M:\s*\d+\/\d+/m.test(stripped))
    errors.push('Missing M: (meter / time signature) header')

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
      .filter(
        (l) =>
          l.trim() &&
          !/[|:]/.test(l) &&
          !/[A-Ga-g][',]*/.test(l) &&
          !l.startsWith('w:') &&
          !l.startsWith('%%'),
      )
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

// ── Mock fallback ───────────────────────────────────────

async function mockGenerate(
  messages: Message[],
  callbacks: StreamCallbacks,
): Promise<GenerateResult> {
  const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user')
  const prompt =
    typeof lastUserMsg?.content === 'string' ? lastUserMsg.content : ''
  const lower = prompt.toLowerCase()

  const tunes: Record<string, string> = {
    waltz: `X:1\nT:Generated Waltz\nM:3/4\nL:1/4\nK:Em\n%%MIDI program 40\n%%MIDI chordprog 24\n%%MIDI gchord f8\n|:"Em" E2 G B | "Am" A2 c e | "D" d2 B A | "G" G2 F# E | "Em" E2 G B | "Am" A c e | "B7" ^D2 ^F A | "Em" E6 :|\n|:"C" E2 G c | "G" B2 G B | "Am" A2 c e | "Em" G2 E G | "C" E G c e | "G" B G B d | "B7" ^F A ^d f | "Em" E6 :|`,
    jig: `X:1\nT:Generated Jig\nM:6/8\nL:1/8\nK:D\n%%MIDI program 73\n%%MIDI chordprog 25\n%%MIDI gchord s8\n|:"D" A2 F D2 F | A2 d f2 d | "G" B2 G D2 G | B2 d g2 f | "D" a2 f d2 f | "A" e2 c A2 c | "D" d3 "A" e3 | "D" d6 :|\n|:"G" B2 G d2 B | g2 d B2 G | "D" A2 F d2 A | f2 d A2 F | "G" g2 f "D" f2 e | "A" e2 d c2 B |1 "D" A3 B3 | A6 :|2 "D" A2 B c2 e | d6 |`,
    blues: `X:1\nT:Generated Blues\nM:4/4\nL:1/8\nK:C\n%%MIDI program 56\n%%MIDI chordprog 0\n%%MIDI gchord\n|:"C7" C2 E G c2 e- | e2 d c2 _B G2 | "F7" F2 A c f2 a- | a2 g f2 A c2 | "C7" C2 E G c2 e- | e d c B G2 |\nw:Walk-in' down that lone-ly road\n|"G7" G,2 B, D G2 F | "F7" F A c f a2 g | "C7" C2 E G c2 B | "G7" G2 B d f2 d | "C7" c8 :|`,
    lullaby: `X:1\nT:Generated Lullaby\nM:3/4\nL:1/4\nK:F\n%%MIDI program 0\n%%MIDI chordprog 48\n%%MIDI gchord\n|:"F" c2 A | F2 G | A2 c | "Bb" d3 | "C7" B2 G | E2 F | G2 B | "F" c3 |\nw:Hush now, close your eyes\n|"Am" A2 F | "Dm" d2 c | "Gm" B2 G | "C7" G3 | "F" A2 G | "Bb" F2 E | "C7" G2 B | "F" F6 :|`,
  }

  const entry = Object.entries(tunes).find(([k]) => lower.includes(k))
  const abc = entry?.[1] ?? tunes.blues

  // Simulate chat + tool call
  const chatText = "Here's what I came up with — a piece based on your description."

  callbacks.onThinking('Analyzing the prompt for musical style, key, and structure…\n')
  await sleep(300)
  callbacks.onThinking('Drafting the ABC notation with appropriate voicing…\n')
  await sleep(200)

  // Stream the chat text
  for (const char of chatText) {
    callbacks.onTextDelta(char)
    await sleep(10)
  }

  callbacks.onToolCall()

  // Simulate the tool call (brief pause, then "execute")
  await sleep(300)

  const contentBlocks: ContentBlock[] = [
    { type: 'text', text: chatText },
    {
      type: 'tool_use',
      id: 'mock_tool_001',
      name: 'generate_music',
      input: { abc_notation: abc },
    },
    { type: 'tool_result', tool_use_id: 'mock_tool_001', content: 'Music generated successfully.' },
  ]

  return { text: chatText, contentBlocks, abcNotation: abc }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

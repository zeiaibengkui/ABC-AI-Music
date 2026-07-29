/**
 * Composable for generating ABC notation via LLM tool calls.
 *
 * The AI chats naturally with the user. When it wants to produce music,
 * it calls the `generate_music` tool. We execute the tool, render the
 * ABC notation, and return the result so the AI can comment on it.
 *
 * Uses an Anthropic-compatible Messages API endpoint with SSE streaming.
 */

const SYSTEM_PROMPT = `You are an expert music composer and arranger. Chat naturally with the user about music.
When the user asks you to compose a new piece, call generate_music directly.
When the user asks you to MODIFY existing music, you MUST call read_abc first to view the current notation, then call generate_music with your changes. The system enforces this — generate_music will be rejected if you haven't called read_abc since the last edit.

CRITICAL: Use ONLY the native function calling mechanism (tool_use blocks) to call tools. NEVER output XML tags like <invoke>, <parameter>, <｜｜DSML｜｜tool_calls>, or <｜｜DSML｜｜invoke> in your text — these are NOT valid and will be rejected. Just call the tools directly through the function calling API.

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
      'Read the current ABC notation that is already in the conversation. You MUST call this before calling generate_music when modifying existing music. Optionally filter by voice name or bar range.',
    input_schema: {
      type: 'object',
      properties: {
        voice: {
          type: 'string',
          description:
            'Optional. Voice/part name to read (e.g. "Violin", "Cello", "Piano"). If omitted, returns all voices.',
        },
        start_bar: {
          type: 'integer',
          description: 'Optional. Starting bar number (1-based). If omitted, starts from the beginning.',
        },
        end_bar: {
          type: 'integer',
          description: 'Optional. Ending bar number (1-based, inclusive). If omitted, reads to the end.',
        },
      },
      required: [],
    },
  },
  {
    name: 'generate_music',
    description:
      'Generate or update ABC music notation and render it for playback. IMPORTANT: when modifying existing music, you must call read_abc first. You can target a specific voice/part or bar range when editing.',
    input_schema: {
      type: 'object',
      properties: {
        abc_notation: {
          type: 'string',
          description:
            'Complete, valid ABC notation for the piece. Must include X:, T:, M:, L:, K: headers, chord symbols in double quotes, %%MIDI directives for sound, and at least 8 bars of music.',
        },
        voice: {
          type: 'string',
          description:
            'Optional. Voice/part name being edited (e.g. "Violin", "Cello"). If the voice does not exist in the current notation, a new voice will be created.',
        },
        start_bar: {
          type: 'integer',
          description:
            'Optional. Starting bar number (1-based) for the edited section. If omitted, the entire piece is considered.',
        },
        end_bar: {
          type: 'integer',
          description:
            'Optional. Ending bar number (1-based, inclusive) for the edited section.',
        },
        comment: {
          type: 'string',
          description:
            'Optional. Brief description of what was changed, for display to the user.',
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
  type: 'text' | 'tool_use' | 'tool_result' | 'thinking' | 'redacted_thinking'
  text?: string
  thinking?: string
  signature?: string
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
  /** Properly structured messages to append to conversation (assistant↔user pairs) */
  messages: Message[]
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
  /**
   * Execute tool calls from the AI and return tool_results.
   * Returns { toolResults, abcNotation, hasBlockedTool }.
   * `hasBlockedTool` is true if any generate_music was blocked (needs read_abc first).
   */
  async function executeTools(
    toolUses: ContentBlock[],
    allMessages: Message[],
  ): Promise<{
    toolResults: ContentBlock[]
    abcNotation?: string
    hasBlockedTool: boolean
  }> {
    const toolResults: ContentBlock[] = []
    let abcNotation: string | undefined
    let hasBlockedTool = false

    for (const toolUse of toolUses) {
      if (toolUse.name === 'read_abc') {
        const existingAbc = getExistingAbc(allMessages)
        const voice = toolUse.input?.voice ? String(toolUse.input.voice) : null
        const startBar = toolUse.input?.start_bar ? Number(toolUse.input.start_bar) : null
        const endBar = toolUse.input?.end_bar ? Number(toolUse.input.end_bar) : null

        readSinceLastWrite = true

        let result = existingAbc
          ? `Current ABC notation${voice ? ` (voice: ${voice})` : ''}${startBar ? ` [bars ${startBar}${endBar ? `-${endBar}` : '+'}]` : ''}:\n\`\`\`\n${existingAbc}\n\`\`\``
          : 'No existing music to read. Go ahead and compose a new piece.'

        if (voice && existingAbc) {
          const hasVoice = new RegExp(`V:\\s*${voice.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(existingAbc)
          if (!hasVoice)
            result += `\n\nNote: voice "${voice}" does not exist yet. It will be created when you call generate_music.`
        }

        toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: result })
      } else if (toolUse.name === 'generate_music') {
        if (!readSinceLastWrite && hasExistingMusic(allMessages)) {
          hasBlockedTool = true
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content:
              'BLOCKED: You must call read_abc to view the current notation before editing. Please call read_abc first, review the current ABC, then call generate_music with your changes.',
          })
          continue
        }

        const abc = String(toolUse.input?.abc_notation ?? '')
        const voice = toolUse.input?.voice ? String(toolUse.input.voice) : null
        const comment = toolUse.input?.comment ? String(toolUse.input.comment) : null

        // Validate and report errors — let the AI fix them step by step
        const errors = await validateAbc(abc)

        if (errors.length > 0) {
          // Don't accept the broken notation — report errors so the AI can fix them
          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content:
              `❌ Validation failed. Fix these issues and call generate_music again:\n` +
              errors.map((e) => `- ${e}`).join('\n') +
              `\n\nYour ABC that needs fixing:\n\`\`\`\n${abc}\n\`\`\``,
          })
          // Keep readSinceLastWrite unchanged — the AI hasn't successfully written yet
          continue
        }

        // ABC is valid — accept it
        readSinceLastWrite = false
        abcNotation = abc

        let resultContent = '✅ Music generated successfully.'
        if (voice) resultContent += ` Voice: ${voice}.`
        if (comment) resultContent += ` ${comment}`

        toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: resultContent })
      } else {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: `Unknown tool: "${toolUse.name}". Available tools: read_abc, generate_music.`,
        })
      }
    }

    return { toolResults, abcNotation, hasBlockedTool }
  }

  async function generateStream(
    messages: Message[],
    callbacks: StreamCallbacks,
  ): Promise<GenerateResult> {
    if (!apiKey) {
      console.warn('No API key set — using mock generation')
      return mockGenerate(messages, callbacks)
    }

    let allText = ''
    const allContentBlocks: ContentBlock[] = []
    let finalAbcNotation: string | undefined
    let currentMessages = messages

    // Multi-round tool loop: keep going while the AI calls tools
    const newMessages: Message[] = []

    for (let round = 0; round < 4; round++) {
      const isToolResult = round > 0
      const response = await streamApiCall(currentMessages, isToolResult, callbacks)

      allText += (allText ? ' ' : '') + response.text
      allContentBlocks.push(...response.contentBlocks)

      const toolUses = response.contentBlocks.filter((b) => b.type === 'tool_use')
      if (toolUses.length === 0) {
        // Final text response — store as assistant message
        if (response.contentBlocks.length > 0) {
          newMessages.push({ role: 'assistant' as const, content: response.contentBlocks })
        }
        break
      }

      const { toolResults, abcNotation, hasBlockedTool } = await executeTools(
        toolUses,
        messages,
      )

      if (abcNotation) finalAbcNotation = abcNotation
      allContentBlocks.push(...toolResults)

      // Store this round: assistant (text + tool_use) → user (tool_result)
      newMessages.push({ role: 'assistant' as const, content: response.contentBlocks })
      newMessages.push({ role: 'user' as const, content: toolResults })

      // Build next round messages
      currentMessages = [
        ...currentMessages,
        { role: 'assistant' as const, content: response.contentBlocks },
        { role: 'user' as const, content: toolResults },
      ]

      // If a tool was blocked or read-only, continue to next round
      if (!hasBlockedTool && !toolUses.some((tu) => tu.name === 'read_abc')) break
    }

    // Reorder for DeepSeek compatibility (flat view)
    const textBlocks = allContentBlocks.filter((b) => b.type === 'text')
    const toolBlocks = allContentBlocks.filter((b) => b.type === 'tool_use')
    const resultBlocks = allContentBlocks.filter((b) => b.type === 'tool_result')

    return {
      text: allText.trim(),
      contentBlocks: [...textBlocks, ...toolBlocks, ...resultBlocks],
      messages: newMessages,
      abcNotation: finalAbcNotation,
    }
  }

  function resetReadLock() {
    readSinceLastWrite = true
  }

  function requireRead() {
    readSinceLastWrite = false
  }

  return { generateStream, resetReadLock, requireRead }
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
      max_tokens: 16384,
      stream: true,
      system: isToolResult
        ? 'You are a music composition assistant. If the music was generated successfully, briefly acknowledge it. If a tool was BLOCKED, call read_abc to view the current notation. If read_abc returned the notation, call generate_music with your changes. Be conversational — you may call tools as needed.'
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

  // Filter out internal blocks (thinking, redacted_thinking) —
  // they are AI-internal reasoning, not part of the conversation.
  const contentBlocks: ContentBlock[] = Array.from(blocks.values()).filter(
    (b) => b.type !== 'thinking' && b.type !== 'redacted_thinking',
  )

  return { text: textResult.trim(), contentBlocks }
}

// ── Validation ──────────────────────────────────────────

async function validateAbc(abc: string): Promise<string[]> {
  const errors: string[] = []
  const stripped = stripMarkdownFences(abc)

  // Structural checks
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

  // Use abcjs parser for deeper validation
  try {
    const { default: abcjs } = await import('abcjs')
    abcjs.parseOnly(stripped)
  } catch (e) {
    // Dynamic import failed or parseOnly threw
    // Only report parse errors (not module load errors)
    const msg = e instanceof Error ? e.message : String(e)
    const isParseError =
      msg.includes('line') || msg.includes('column') ||
      msg.includes('expected') || msg.includes('unexpected') ||
      msg.includes('Unexpected')
    if (isParseError) {
      errors.push(`Parse error: ${msg}`)
    }
    // Module load failures are silently ignored — regex checks above are sufficient
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

  return {
    text: chatText,
    contentBlocks,
    messages: [
      { role: 'assistant' as const, content: [contentBlocks[0]!, contentBlocks[1]!] },
      { role: 'user' as const, content: [contentBlocks[2]!] },
    ],
    abcNotation: abc,
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

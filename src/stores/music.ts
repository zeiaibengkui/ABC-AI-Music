import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import {
  useAiGenerator,
  type Message,
  type ContentBlock,
} from '../composables/useAiGenerator'

export interface HistoryEntry {
  id: string
  prompt: string
  abcNotation: string
  timestamp: number
}

export const useMusicStore = defineStore(
  'music',
  () => {
    const prompt = ref('')
    const abcNotation = ref('')
    const isLoading = ref(false)
    const isPlaying = ref(false)
    const error = ref<string | null>(null)
    const history = ref<HistoryEntry[]>([])
    const thinking = ref('')
    const streamingText = ref('')
    const darkMode = ref(false)
    const conversation = ref<Message[]>([])
    const isCallingTool = ref(false)

    const { generateStream } = useAiGenerator()

    const hasNotation = computed(() => abcNotation.value.length > 0)

    function setPrompt(text: string) {
      prompt.value = text
    }

    function setAbcNotation(abc: string) {
      abcNotation.value = abc
    }

    function setPlaying(playing: boolean) {
      isPlaying.value = playing
    }

    function addToHistory(entry: HistoryEntry) {
      history.value.unshift(entry)
    }

    function selectFromHistory(entry: HistoryEntry) {
      prompt.value = entry.prompt
      abcNotation.value = entry.abcNotation
      conversation.value = [
        { role: 'user', content: entry.prompt },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Restored from history.' },
            {
              type: 'tool_use',
              id: crypto.randomUUID(),
              name: 'generate_music',
              input: { abc_notation: entry.abcNotation },
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: '',
              content: 'Music restored.',
            },
          ],
        },
      ]
    }

    function toggleDarkMode() {
      darkMode.value = !darkMode.value
    }

    function clearError() {
      error.value = null
    }

    function resetConversation() {
      conversation.value = []
      prompt.value = ''
    }

    async function generate() {
      if (!prompt.value.trim()) return

      isLoading.value = true
      isCallingTool.value = false
      error.value = null
      thinking.value = ''
      streamingText.value = ''

      try {
        const messages: Message[] = [
          ...conversation.value,
          { role: 'user' as const, content: prompt.value },
        ]

        const result = await generateStream(messages, {
          onThinking(text: string) {
            thinking.value += text
          },
          onTextDelta(text: string) {
            streamingText.value += text
          },
          onToolCall() {
            isCallingTool.value = true
          },
        })

        // Extract ABC notation from tool call
        if (result.abcNotation) {
          abcNotation.value = result.abcNotation
        }

        // Build the assistant message from content blocks
        const assistantContent: ContentBlock[] = result.contentBlocks.filter(
          (b) => b.type !== 'tool_result',
        )
        const userToolResult: ContentBlock[] = result.contentBlocks.filter(
          (b) => b.type === 'tool_result',
        )

        // Update conversation
        conversation.value = [
          ...messages,
          { role: 'assistant' as const, content: assistantContent },
        ]
        if (userToolResult.length > 0) {
          conversation.value.push({
            role: 'user' as const,
            content: userToolResult,
          })
        }

        if (result.abcNotation) {
          addToHistory({
            id: crypto.randomUUID(),
            prompt: prompt.value,
            abcNotation: result.abcNotation,
            timestamp: Date.now(),
          })
        }
      } catch (e) {
        error.value = e instanceof Error ? e.message : 'Generation failed'
      } finally {
        isLoading.value = false
        isCallingTool.value = false
      }
    }

    return {
      prompt,
      abcNotation,
      isLoading,
      isPlaying,
      error,
      history,
      thinking,
      streamingText,
      darkMode,
      hasNotation,
      conversation,
      isCallingTool,
      setPrompt,
      setAbcNotation,
      setPlaying,
      addToHistory,
      selectFromHistory,
      toggleDarkMode,
      clearError,
      resetConversation,
      generate,
    }
  },
  {
    persist: {
      pick: ['history', 'darkMode'],
    },
  },
)

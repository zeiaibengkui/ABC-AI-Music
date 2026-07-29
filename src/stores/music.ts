import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { useAiGenerator } from '../composables/useAiGenerator'

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
    }

    function toggleDarkMode() {
      darkMode.value = !darkMode.value
    }

    function clearError() {
      error.value = null
    }

    async function generate() {
      if (!prompt.value.trim()) return

      isLoading.value = true
      error.value = null
      thinking.value = ''
      streamingText.value = ''

      try {
        const generated = await generateStream(prompt.value, {
          onThinking(text: string) {
            thinking.value += text
          },
          onTextDelta(text: string) {
            streamingText.value += text
          },
        })

        abcNotation.value = generated

        addToHistory({
          id: crypto.randomUUID(),
          prompt: prompt.value,
          abcNotation: generated,
          timestamp: Date.now(),
        })
      } catch (e) {
        error.value = e instanceof Error ? e.message : 'Generation failed'
      } finally {
        isLoading.value = false
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
      setPrompt,
      setAbcNotation,
      setPlaying,
      addToHistory,
      selectFromHistory,
      toggleDarkMode,
      clearError,
      generate,
    }
  },
  {
    persist: {
      pick: ['history', 'darkMode'],
    },
  },
)

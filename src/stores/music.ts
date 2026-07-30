import { ref, computed } from 'vue';
import { defineStore } from 'pinia';
import { useAiGenerator, type Message } from '../composables/useAiGenerator';

export interface HistoryEntry {
  id: string;
  prompt: string;
  abcNotation: string;
  timestamp: number;
}

export const useMusicStore = defineStore(
  'music',
  () => {
    const prompt = ref('');
    const abcNotation = ref('');
    const isLoading = ref(false);
    const isPlaying = ref(false);
    const error = ref<string | null>(null);
    const history = ref<HistoryEntry[]>([]);
    const thinking = ref('');
    const streamingText = ref('');
    const darkMode = ref(false);
    const conversation = ref<Message[]>([]);
    const isCallingTool = ref(false);
    const renderError = ref<string | null>(null);

    const { generateStream, resetReadLock, requireRead } = useAiGenerator();

    const hasNotation = computed(() => abcNotation.value.length > 0);

    function setPrompt(text: string) {
      prompt.value = text;
    }

    function setAbcNotation(abc: string) {
      abcNotation.value = abc;
    }

    function setPlaying(playing: boolean) {
      isPlaying.value = playing;
    }

    function addToHistory(entry: HistoryEntry) {
      history.value.unshift(entry);
    }

    function selectFromHistory(entry: HistoryEntry) {
      prompt.value = entry.prompt;
      abcNotation.value = entry.abcNotation;
      // Music already exists — AI must read before modifying
      requireRead();
      const toolId = crypto.randomUUID();
      conversation.value = [
        { role: 'user', content: entry.prompt },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Restored from history.' },
            {
              type: 'tool_use',
              id: toolId,
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
              tool_use_id: toolId,
              content: 'Music restored.',
            },
          ],
        },
      ];
    }

    function toggleDarkMode() {
      darkMode.value = !darkMode.value;
    }

    function clearError() {
      error.value = null;
    }

    function resetConversation() {
      conversation.value = [];
      prompt.value = '';
      abcNotation.value = '';
      resetReadLock();
    }

    async function generate() {
      if (!prompt.value.trim()) return;

      isLoading.value = true;
      isCallingTool.value = false;
      error.value = null;
      thinking.value = '';
      streamingText.value = '';

      try {
        // Add user message to conversation immediately for snappy UX
        // Include render error from previous turn so AI can fix it
        let content = prompt.value;
        if (renderError.value) {
          content = `[System: The previous music caused a rendering error: "${renderError.value}"] ${content}`;
          renderError.value = null;
        }

        const messages: Message[] = [...conversation.value, { role: 'user' as const, content }];
        conversation.value = messages;

        const result = await generateStream(messages, {
          onThinking(text: string) {
            thinking.value += text;
          },
          onTextDelta(text: string) {
            streamingText.value += text;
          },
          onToolCall() {
            isCallingTool.value = true;
          },
        });

        // Extract ABC notation from tool call
        if (result.abcNotation) {
          abcNotation.value = result.abcNotation;
        }

        // Append AI response to conversation
        if (result.messages.length > 0) {
          conversation.value = [...conversation.value, ...result.messages];
        }

        if (result.abcNotation) {
          addToHistory({
            id: crypto.randomUUID(),
            prompt: prompt.value,
            abcNotation: result.abcNotation,
            timestamp: Date.now(),
          });
        }
      } catch (e) {
        error.value = e instanceof Error ? e.message : 'Generation failed';
      } finally {
        isLoading.value = false;
        isCallingTool.value = false;
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
      renderError,
      setPrompt,
      setAbcNotation,
      setPlaying,
      addToHistory,
      selectFromHistory,
      toggleDarkMode,
      clearError,
      resetConversation,
      generate,
    };
  },
  {
    persist: {
      pick: ['history', 'darkMode'],
    },
  },
);

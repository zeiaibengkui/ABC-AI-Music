<script setup lang="ts">
import type { Message } from '../composables/useAiGenerator';
defineProps<{
    store: import("pinia").Store<"music", Pick<{ prompt: import("vue").Ref<string, string>; abcNotation: import("vue").Ref<string, string>; isLoading: import("vue").Ref<boolean, boolean>; isPlaying: import("vue").Ref<boolean, boolean>; error: import("vue").Ref<string | null, string | null>; history: import("vue").Ref<{ id: string; prompt: string; abcNotation: string; timestamp: number; }[], import("../stores/music").HistoryEntry[] | { id: string; prompt: string; abcNotation: string; timestamp: number; }[]>; thinking: import("vue").Ref<string, string>; streamingText: import("vue").Ref<string, string>; darkMode: import("vue").Ref<boolean, boolean>; hasNotation: import("vue").ComputedRef<boolean>; conversation: import("vue").Ref<{ role: "user" | "assistant"; content: string | { type: "text" | "tool_use" | "tool_result" | "thinking" | "redacted_thinking"; text?: string | undefined; thinking?: string | undefined; signature?: string | undefined; id?: string | undefined; name?: string | undefined; input?: Record<string, unknown> | undefined; tool_use_id?: string | undefined; content?: string | undefined; }[]; }[], Message[] | { role: "user" | "assistant"; content: string | { type: "text" | "tool_use" | "tool_result" | "thinking" | "redacted_thinking"; text?: string | undefined; thinking?: string | undefined; signature?: string | undefined; id?: string | undefined; name?: string | undefined; input?: Record<string, unknown> | undefined; tool_use_id?: string | undefined; content?: string | undefined; }[]; }[]>; isCallingTool: import("vue").Ref<boolean, boolean>; renderError: import("vue").Ref<string | null, string | null>; isRenderingNotation: import("vue").Ref<boolean, boolean>; setPrompt: (text: string) => void; setAbcNotation: (abc: string) => void; setPlaying: (playing: boolean) => void; addToHistory: (entry: import("../stores/music").HistoryEntry) => void; selectFromHistory: (entry: import("../stores/music").HistoryEntry) => void; toggleDarkMode: () => void; clearError: () => void; resetConversation: () => void; generate: () => Promise<void>; }, "prompt" | "abcNotation" | "history" | "darkMode" | "isLoading" | "isPlaying" | "error" | "thinking" | "streamingText" | "conversation" | "isCallingTool" | "renderError" | "isRenderingNotation">, Pick<{ prompt: import("vue").Ref<string, string>; abcNotation: import("vue").Ref<string, string>; isLoading: import("vue").Ref<boolean, boolean>; isPlaying: import("vue").Ref<boolean, boolean>; error: import("vue").Ref<string | null, string | null>; history: import("vue").Ref<{ id: string; prompt: string; abcNotation: string; timestamp: number; }[], import("../stores/music").HistoryEntry[] | { id: string; prompt: string; abcNotation: string; timestamp: number; }[]>; thinking: import("vue").Ref<string, string>; streamingText: import("vue").Ref<string, string>; darkMode: import("vue").Ref<boolean, boolean>; hasNotation: import("vue").ComputedRef<boolean>; conversation: import("vue").Ref<{ role: "user" | "assistant"; content: string | { type: "text" | "tool_use" | "tool_result" | "thinking" | "redacted_thinking"; text?: string | undefined; thinking?: string | undefined; signature?: string | undefined; id?: string | undefined; name?: string | undefined; input?: Record<string, unknown> | undefined; tool_use_id?: string | undefined; content?: string | undefined; }[]; }[], Message[] | { role: "user" | "assistant"; content: string | { type: "text" | "tool_use" | "tool_result" | "thinking" | "redacted_thinking"; text?: string | undefined; thinking?: string | undefined; signature?: string | undefined; id?: string | undefined; name?: string | undefined; input?: Record<string, unknown> | undefined; tool_use_id?: string | undefined; content?: string | undefined; }[]; }[]>; isCallingTool: import("vue").Ref<boolean, boolean>; renderError: import("vue").Ref<string | null, string | null>; isRenderingNotation: import("vue").Ref<boolean, boolean>; setPrompt: (text: string) => void; setAbcNotation: (abc: string) => void; setPlaying: (playing: boolean) => void; addToHistory: (entry: import("../stores/music").HistoryEntry) => void; selectFromHistory: (entry: import("../stores/music").HistoryEntry) => void; toggleDarkMode: () => void; clearError: () => void; resetConversation: () => void; generate: () => Promise<void>; }, "hasNotation">, Pick<{ prompt: import("vue").Ref<string, string>; abcNotation: import("vue").Ref<string, string>; isLoading: import("vue").Ref<boolean, boolean>; isPlaying: import("vue").Ref<boolean, boolean>; error: import("vue").Ref<string | null, string | null>; history: import("vue").Ref<{ id: string; prompt: string; abcNotation: string; timestamp: number; }[], import("../stores/music").HistoryEntry[] | { id: string; prompt: string; abcNotation: string; timestamp: number; }[]>; thinking: import("vue").Ref<string, string>; streamingText: import("vue").Ref<string, string>; darkMode: import("vue").Ref<boolean, boolean>; hasNotation: import("vue").ComputedRef<boolean>; conversation: import("vue").Ref<{ role: "user" | "assistant"; content: string | { type: "text" | "tool_use" | "tool_result" | "thinking" | "redacted_thinking"; text?: string | undefined; thinking?: string | undefined; signature?: string | undefined; id?: string | undefined; name?: string | undefined; input?: Record<string, unknown> | undefined; tool_use_id?: string | undefined; content?: string | undefined; }[]; }[], Message[] | { role: "user" | "assistant"; content: string | { type: "text" | "tool_use" | "tool_result" | "thinking" | "redacted_thinking"; text?: string | undefined; thinking?: string | undefined; signature?: string | undefined; id?: string | undefined; name?: string | undefined; input?: Record<string, unknown> | undefined; tool_use_id?: string | undefined; content?: string | undefined; }[]; }[]>; isCallingTool: import("vue").Ref<boolean, boolean>; renderError: import("vue").Ref<string | null, string | null>; isRenderingNotation: import("vue").Ref<boolean, boolean>; setPrompt: (text: string) => void; setAbcNotation: (abc: string) => void; setPlaying: (playing: boolean) => void; addToHistory: (entry: import("../stores/music").HistoryEntry) => void; selectFromHistory: (entry: import("../stores/music").HistoryEntry) => void; toggleDarkMode: () => void; clearError: () => void; resetConversation: () => void; generate: () => Promise<void>; }, "setPrompt" | "setAbcNotation" | "setPlaying" | "addToHistory" | "selectFromHistory" | "toggleDarkMode" | "clearError" | "resetConversation" | "generate">>;
    isVisible: (msg: Message) => boolean;
    msgText: (msg: Message) => string;
    hasToolCall: (msg: Message) => boolean;
    toolHasError: (result: string) => boolean;
    getToolResult: (i: number) => string;
}>()
const showChat = defineModel<boolean>('showChat', { required: true })
const showThinking = defineModel<boolean>('showThinking', { required: true })
</script>

<template>
    <!-- Chat history + live streaming message -->
    <div v-if="store.conversation.length || store.isLoading" class="d-flex flex-column-reverse gap-2 overflow-auto"
        style="min-height: 0">
        <button class="chat-toggle" @click="showChat = !showChat">
            <span class="text-uppercase fw-semibold text-body-secondary"
                style="font-size: 0.6875rem; letter-spacing: 0.12em">
                {{ showChat ? '▾' : '▸' }} Chat
            </span>
            <span class="chat-badge">{{
                store.conversation.filter((m) => m.role === 'user').length
                }}</span>
        </button>
        <BCollapse :visible="showChat">
            <div ref="chatListRef" class="d-flex flex-column gap-2 chat-list overflow-y-auto" style="max-height: 360px">
                <template v-for="(msg, i) in store.conversation" :key="i">
                    <div v-if="isVisible(msg)" :class="msg.role === 'user' ? 'chat-user' : 'chat-assistant'">
                        <div class="chat-role">{{ msg.role === 'user' ? 'You' : 'AI' }}</div>
                        <div v-if="msgText(msg)" class="chat-content">{{ msgText(msg) }}</div>
                        <div v-if="hasToolCall(msg)" class="chat-toolcall"
                            :class="{ 'tool-error': toolHasError(getToolResult(i)) }">
                            {{ toolHasError(getToolResult(i)) ? '❌ Generation failed' : '🎵 Generated music' }}
                            <pre v-if="getToolResult(i)" class="tool-result-text">{{ getToolResult(i) }}</pre>
                        </div>
                    </div>
                </template>
                <!-- Live streaming message (appears as AI is responding) -->
                <div v-if="store.isLoading" class="chat-assistant">
                    <div class="chat-role">AI</div>
                    <div v-if="store.thinking" class="thinking-inline">
                        <button class="thinking-toggle-inline" @click="showThinking = !showThinking">
                            {{ showThinking ? '▾' : '▸' }} Thinking ({{ store.thinking.length }} chars)
                        </button>
                        <BCollapse :visible="showThinking">
                            <pre class="thinking-text-inline">{{ store.thinking }}</pre>
                        </BCollapse>
                    </div>
                    <div v-if="store.streamingText" class="chat-content">{{ store.streamingText }}</div>
                    <div v-if="store.isCallingTool" class="chat-toolcall">
                        <BSpinner small class="text-success me-1" />
                        Generating music…
                    </div>
                    <div v-if="!store.streamingText && !store.isCallingTool && !store.thinking"
                        class="chat-content text-body-secondary">
                        Thinking…
                    </div>
                </div>
            </div>
        </BCollapse>
    </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useMusicStore } from '../stores/music';
import type { ContentBlock, Message } from '../composables/useAiGenerator';
import chatMessage from './chatMessage.vue'
import ChatHistory from './ChatHistory.vue'
import ChatInput from './ChatInput.vue'

const store = useMusicStore();
const showThinking = ref(false);
const showChat = ref(false);
const showHistory = ref(false);
const chatListRef = ref<HTMLDivElement>();

// Auto-expand chat and thinking when generation starts
watch(
  () => store.isLoading,
  (val) => {
    if (val) {
      showChat.value = true;
      showThinking.value = true;
    }
  },
);

// Auto-expand and scroll chat when conversation changes (e.g. history selected)
watch(
  () => store.conversation.length,
  (len) => {
    if (len > 0) showChat.value = true;
    setTimeout(() => {
      chatListRef.value?.scrollTo({ top: chatListRef.value.scrollHeight, behavior: 'smooth' });
    }, 100);
  },
);

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    store.generate();
  }
}

/** Extract display text from a message (handles both string and ContentBlock[] formats). */
function msgText(msg: Message): string {
  if (typeof msg.content === 'string') return msg.content;
  return msg.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
}

/** Check if a message contains a tool_use block. */
function hasToolCall(msg: Message): boolean {
  if (typeof msg.content === 'string') return false;
  return msg.content.some((b) => b.type === 'tool_use');
}

/** Find the tool_result that follows a tool_use message, by looking at the next user message. */
function getToolResult(i: number): string {
  const next = store.conversation[i + 1];
  if (!next || next.role !== 'user' || typeof next.content === 'string') return '';
  return (next.content as ContentBlock[])
    .filter((b) => b.type === 'tool_result')
    .map((b) => b.content)
    .join('\n');
}

/** Whether tool result indicates an error. */
function toolHasError(result: string): boolean {
  return result.includes('❌') || result.includes('BLOCKED') || result.includes('⚠');
}

/** Whether to show this message in the chat (hide tool_result user messages). */
function isVisible(msg: Message): boolean {
  if (msg.role === 'user' && typeof msg.content !== 'string') {
    const all = msg.content as ContentBlock[];
    if (all.every((b) => b.type === 'tool_result')) return false;
  }
  return true;
}
</script>

<template>
  <aside class="d-flex flex-column gap-3 p-4 h-100 border-end overflow-y-auto">
    <chatMessage :store="store" :isVisible="isVisible" :msgText="msgText" :hasToolCall="hasToolCall"
      :toolHasError="toolHasError" :getToolResult="getToolResult" v-model:showChat="showChat"
      v-model:showThinking="showThinking" />

    <ChatHistory :store="store" v-model:showHistory="showHistory" />
    <!--Input-->
    <ChatInput :store="store" :handleKeydown="handleKeydown" />
  </aside>
</template>

<style>
.prompt-textarea {
  font-size: 0.9375rem;
  line-height: 1.6;
}

.chat-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0;
  background: none;
  border: none;
  cursor: pointer;
  color: inherit;
}

.chat-toggle:hover {
  opacity: 0.8;
}

.chat-badge {
  font-size: 0.625rem;
  font-weight: 600;
  color: var(--bs-body-color);
  background: var(--bs-tertiary-bg);
  border-radius: 999px;
  padding: 0 0.4rem;
  line-height: 1.4;
}

.chat-list {
  min-height: 0;
}

.chat-user,
.chat-assistant {
  border-radius: var(--bs-border-radius);
  padding: 0.5rem 0.625rem;
}

.chat-user {
  background: var(--bs-primary-bg-subtle);
  border: 1px solid var(--bs-primary-border-subtle);
}

.chat-assistant {
  background: var(--bs-body-bg);
  border: 1px solid var(--bs-border-color);
}

.chat-role {
  font-size: 0.625rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--bs-secondary-color);
  margin-bottom: 0.125rem;
}

.chat-content {
  font-size: 0.8125rem;
  line-height: 1.5;
  color: var(--bs-body-color);
  white-space: pre-wrap;
  word-break: break-word;
}

.chat-toolcall {
  font-size: 0.75rem;
  color: var(--bs-success-text-emphasis);
  margin-top: 0.25rem;
}

.chat-toolcall.tool-error {
  color: var(--bs-danger-text-emphasis);
}

.tool-result-text {
  margin: 0.25rem 0 0 0;
  padding: 0.375rem 0.5rem;
  font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
  font-size: 0.625rem;
  line-height: 1.4;
  color: var(--bs-secondary-color);
  white-space: pre-wrap;
  max-height: 120px;
  overflow-y: auto;
  background: var(--bs-light-bg-subtle);
  border-radius: var(--bs-border-radius-sm);
}

.history-item {
  cursor: pointer;
  transition: background-color 0.1s ease;
  border-radius: var(--bs-border-radius) !important;
}

.thinking-inline {
  margin-bottom: 0.375rem;
}

.thinking-toggle-inline {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0;
  font-size: 0.6875rem;
  color: var(--bs-secondary-color);
  background: none;
  border: none;
  cursor: pointer;
}

.thinking-toggle-inline:hover {
  color: var(--bs-body-color);
}

.thinking-text-inline {
  margin: 0.25rem 0 0 0;
  padding: 0.375rem 0.5rem;
  font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
  font-size: 0.625rem;
  line-height: 1.4;
  color: var(--bs-secondary-color);
  white-space: pre-wrap;
  max-height: 8em;
  overflow-y: auto;
  /* background: var(--bs-light-bg-subtle); */
  border-radius: var(--bs-border-radius-sm);
}
</style>

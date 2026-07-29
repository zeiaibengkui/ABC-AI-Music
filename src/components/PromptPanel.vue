<script setup lang="ts">
import { ref, watch } from 'vue'
import { BButton, BFormTextarea, BSpinner, BListGroup, BListGroupItem, BCollapse } from 'bootstrap-vue-next'
import { useMusicStore } from '../stores/music'
import type { ContentBlock, Message } from '../composables/useAiGenerator'

const store = useMusicStore()
const showThinking = ref(false)
const showChat = ref(false)
const showHistory = ref(false)

// Auto-open thinking panel when thinking starts streaming
watch(() => store.thinking, (val) => {
  if (val) showThinking.value = true
})

// Auto-expand chat when generation starts
watch(() => store.isLoading, (val) => {
  if (val) showChat.value = true
  if (!val) showThinking.value = false
})

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    store.generate()
  }
}

/** Extract display text from a message (handles both string and ContentBlock[] formats). */
function msgText(msg: Message): string {
  if (typeof msg.content === 'string') return msg.content
  return msg.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
}

/** Check if a message contains a tool_use block. */
function hasToolCall(msg: Message): boolean {
  if (typeof msg.content === 'string') return false
  return msg.content.some((b) => b.type === 'tool_use')
}

/** Whether to show this message in the chat (hide tool_result user messages). */
function isVisible(msg: Message): boolean {
  if (msg.role === 'user' && typeof msg.content !== 'string') {
    // Hide if all blocks are tool_result
    const all = msg.content as ContentBlock[]
    if (all.every((b) => b.type === 'tool_result')) return false
  }
  return true
}
</script>

<template>
  <aside class="d-flex flex-column gap-3 p-4 h-100 border-end  overflow-y-auto">



    <!-- Chat history + live streaming message -->
    <div v-if="store.conversation.length || store.isLoading" class="d-flex flex-column-reverse gap-2 overflow-scroll"
      style="min-height: 0;">
      <button class="chat-toggle" @click="showChat = !showChat">
        <span class="text-uppercase fw-semibold text-body-secondary"
          style="font-size: 0.6875rem; letter-spacing: 0.12em;">
          {{ showChat ? '▾' : '▸' }} Chat
        </span>
        <span class="chat-badge">{{store.conversation.filter(m => m.role === 'user').length}}</span>
      </button>
      <BCollapse :visible="showChat">
        <div class="d-flex flex-column gap-2 chat-list overflow-y-auto" style="max-height: 360px;">
          <template v-for="(msg, i) in store.conversation" :key="i">
            <div v-if="isVisible(msg)" :class="msg.role === 'user' ? 'chat-user' : 'chat-assistant'">
              <div class="chat-role">{{ msg.role === 'user' ? 'You' : 'AI' }}</div>
              <div v-if="msgText(msg)" class="chat-content">{{ msgText(msg) }}</div>
              <div v-if="hasToolCall(msg)" class="chat-toolcall">
                🎵 Generated music
              </div>
            </div>
          </template>
          <!-- Live streaming message (appears as AI is responding) -->
          <div v-if="store.isLoading" class="chat-assistant">
            <div class="chat-role">AI</div>
            <div v-if="store.streamingText" class="chat-content">{{ store.streamingText }}</div>
            <div v-if="store.isCallingTool" class="chat-toolcall">
              <BSpinner small class="text-success me-1" />
              Generating music…
            </div>
            <div v-if="!store.streamingText && !store.isCallingTool" class="chat-content text-body-secondary">
              Thinking…
            </div>
          </div>
        </div>
      </BCollapse>
    </div>

    <div v-if="store.history.length" class="d-flex flex-column gap-2 overflow-y-auto" style="min-height: 0;">
      <button class="chat-toggle" @click="showHistory = !showHistory">
        <span class="text-uppercase fw-semibold text-body-secondary"
          style="font-size: 0.6875rem; letter-spacing: 0.12em;">
          {{ showHistory ? '▾' : '▸' }} History
        </span>
        <span class="chat-badge">{{ store.history.length }}</span>
      </button>
      <BCollapse :visible="showHistory">
        <BListGroup flush class="" style="max-height: 240px;">
          <BListGroupItem v-for="entry in store.history" :key="entry.id" role="button"
            @click="store.selectFromHistory(entry)" class="history-item py-2 px-2">
            <div class="text-truncate" style="font-size: 0.875rem;">
              {{ entry.prompt }}
            </div>
            <small class="text-body-secondary">
              {{ new Date(entry.timestamp).toLocaleTimeString() }}
            </small>
          </BListGroupItem>
        </BListGroup>
      </BCollapse>
    </div>
    <div v-if="store.thinking" class="thinking-section" style="overflow-y: auto;">
      <button class="thinking-toggle" @click="showThinking = !showThinking">
        <span>{{ showThinking ? '▾' : '▸' }} AI thinking</span>
      </button>
      <BCollapse :visible="showThinking">
        <pre class="thinking-text">{{ store.thinking }}</pre>
      </BCollapse>
    </div>

    <!--Input-->
    <div class="d-flex flex-column gap-2">
      <BFormTextarea :model-value="store.prompt" @update:model-value="(v: unknown) => store.setPrompt(String(v ?? ''))"
        @keydown="handleKeydown" placeholder="Describe the music you want to hear…" rows="4" class="prompt-textarea" />
      <BButtonGroup>
        <BButton variant="primary" :disabled="!store.prompt.trim() || store.isLoading" @click="store.generate()"
          class="align-self-start">
          <BSpinner v-if="store.isLoading" small class="me-1" />
          <FontAwesomeIcon v-else icon="wand-magic-sparkles" class="me-1" />
          {{ store.isLoading ? 'Generating…' : 'Send' }}
        </BButton>
        <BButton v-if="store.conversation.length" variant="outline-secondary" @click="store.resetConversation()">
          New
        </BButton>
      </BButtonGroup>


      <p v-if="store.error" class="text-danger small mb-0">{{ store.error }}</p>
      <p class="text-body-secondary mb-0" style="font-size: 0.75rem;">
        <kbd>⌘</kbd>+<kbd>Enter</kbd> to generate
        <span v-if="store.conversation.length" class="ms-2">
          &middot; {{store.conversation.filter(m => m.role === 'user').length}} turn{{store.conversation.filter(m =>
            m.role === 'user').length > 1 ? 's' : ''}}
        </span>
      </p>
    </div>
  </aside>
</template>

<style scoped>
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

.history-item {
  cursor: pointer;
  transition: background-color 0.1s ease;
  border-radius: var(--bs-border-radius) !important;
}

.thinking-section {
  border: 1px solid var(--bs-border-color);
  border-radius: var(--bs-border-radius);
  overflow: hidden;
}

.thinking-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.375rem 0.75rem;
  font-family: var(--font-body);
  font-size: 0.75rem;
  color: var(--bs-body-color);
  background: var(--bs-body-bg);
  border: none;
  cursor: pointer;
  transition: background 0.1s ease;
}

.thinking-toggle:hover {
  background: var(--bs-tertiary-bg);
}

.thinking-text {
  margin: 0;
  padding: 0.5rem 0.75rem;
  font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
  font-size: 0.6875rem;
  white-space: pre-wrap;
  max-height: 8em;
  /* overflow-y: scroll; */
  border-top: 1px solid var(--bs-border-color);
  background: var(--bs-light-bg-subtle);
}
</style>

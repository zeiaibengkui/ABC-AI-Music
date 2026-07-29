<script setup lang="ts">
import { ref, watch } from 'vue'
import { BButton, BFormTextarea, BSpinner, BListGroup, BListGroupItem, BCollapse } from 'bootstrap-vue-next'
import { useMusicStore } from '../stores/music'

const store = useMusicStore()
const showThinking = ref(false)

// Auto-open thinking panel when thinking starts streaming
watch(() => store.thinking, (val) => {
  if (val) showThinking.value = true
})

// Auto-close when generation is done
watch(() => store.isLoading, (val) => {
  if (!val) showThinking.value = false
})

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    store.generate()
  }
}
</script>

<template>
  <aside class="d-flex flex-column gap-3 p-4 h-100 border-end bg-body-tertiary overflow-y-auto">
    <div class="d-flex align-items-center justify-content-between">
      <h2 class="text-uppercase fs-8 fw-semibold text-body-secondary mb-0" style="font-size: 0.6875rem; letter-spacing: 0.12em;">
        Prompt
      </h2>
    </div>

    <div class="d-flex flex-column gap-2">
      <BFormTextarea
        :model-value="store.prompt"
        @update:model-value="(v: unknown) => store.setPrompt(String(v ?? ''))"
        @keydown="handleKeydown"
        placeholder="Describe the music you want to hear…"
        rows="4"
        class="prompt-textarea"
      />

      <BButton
        variant="primary"
        :disabled="!store.prompt.trim() || store.isLoading"
        @click="store.generate()"
        class="align-self-start"
      >
        <BSpinner v-if="store.isLoading" small class="me-1" />
        <FontAwesomeIcon v-else icon="wand-magic-sparkles" class="me-1" />
        {{ store.isLoading ? 'Generating…' : 'Generate' }}
      </BButton>

      <p v-if="store.error" class="text-danger small mb-0">{{ store.error }}</p>
      <p class="text-body-secondary mb-0" style="font-size: 0.75rem;">
        <kbd>⌘</kbd>+<kbd>Enter</kbd> to generate
      </p>
    </div>

    <!-- Streaming preview (ABC text appearing in real time) -->
    <div v-if="store.isLoading && store.streamingText" class="streaming-preview">
      <div class="d-flex align-items-center gap-1 mb-1">
        <BSpinner small class="text-primary" />
        <span class="text-uppercase fw-semibold text-body-secondary" style="font-size: 0.625rem; letter-spacing: 0.1em;">
          Live preview
        </span>
      </div>
      <pre class="streaming-text">{{ store.streamingText }}</pre>
    </div>

    <!-- Thinking section -->
    <div v-if="store.thinking" class="thinking-section">
      <button
        class="thinking-toggle"
        @click="showThinking = !showThinking"
      >
        <span>{{ showThinking ? '▾' : '▸' }} AI thinking</span>
        <BSpinner small class="text-body-secondary ms-1" />
      </button>
      <BCollapse :visible="showThinking">
        <pre class="thinking-text">{{ store.thinking }}</pre>
      </BCollapse>
    </div>

    <div v-if="store.history.length" class="flex-fill overflow-y-auto d-flex flex-column gap-2">
      <h2 class="text-uppercase fs-8 fw-semibold text-body-secondary mb-0" style="font-size: 0.6875rem; letter-spacing: 0.12em;">
        History
      </h2>
      <BListGroup flush>
        <BListGroupItem
          v-for="entry in store.history"
          :key="entry.id"
          role="button"
          @click="store.selectFromHistory(entry)"
          class="history-item py-2 px-2"
        >
          <div class="text-truncate" style="font-size: 0.875rem;">
            {{ entry.prompt }}
          </div>
          <small class="text-body-secondary">
            {{ new Date(entry.timestamp).toLocaleTimeString() }}
          </small>
        </BListGroupItem>
      </BListGroup>
    </div>
  </aside>
</template>

<style scoped>
.prompt-textarea {
  font-size: 0.9375rem;
  line-height: 1.6;
}

.history-item {
  cursor: pointer;
  transition: background-color 0.1s ease;
  border-radius: var(--bs-border-radius) !important;
}

.streaming-preview {
  border: 1px solid var(--bs-border-color);
  border-radius: var(--bs-border-radius);
  background: #1e1e1e;
  overflow: hidden;
}

.streaming-text {
  margin: 0;
  padding: 0.5rem 0.75rem;
  font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
  font-size: 0.6875rem;
  line-height: 1.5;
  color: #d4d4d4;
  white-space: pre-wrap;
  max-height: 160px;
  overflow-y: auto;
}

.streaming-preview .d-flex {
  padding: 0.375rem 0.75rem;
  background: #2d2d2d;
  border-bottom: 1px solid #3d3d3d;
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
  line-height: 1.5;
  color: var(--bs-secondary-color);
  white-space: pre-wrap;
  max-height: 200px;
  overflow-y: auto;
  border-top: 1px solid var(--bs-border-color);
  background: var(--bs-light-bg-subtle);
}
</style>

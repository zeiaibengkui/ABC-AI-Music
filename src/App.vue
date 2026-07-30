<script setup lang="ts">
import { watch } from 'vue';
import { useMusicStore } from './stores/music';
import PromptPanel from './components/PromptPanel.vue';
import MusicPanel from './components/MusicPanel.vue';

const store = useMusicStore();

watch(
  () => store.darkMode,
  (val) => {
    document.documentElement.dataset.bsTheme = val ? 'dark' : 'light';
  },
  { immediate: true },
);
</script>

<template>
  <BApp>
    <div class="app-shell d-flex flex-column vh-100">
      <header class="app-header d-flex align-items-center gap-3 px-4 py-3 border-bottom k-0">
        <a target="_blank" href="https://github.com/zeiaibengkui/ABC-AI-Music">
          <h1 class="app-title mb-0 fs-5 fw-semibold">ABC-AI-Music</h1>
        </a>
        <span class="text-body-secondary fs-7 d-none d-sm-inline"
          >Generate music from text prompts</span
        >
        <BButton
          variant="outline-secondary"
          size="sm"
          class="ms-auto"
          @click="store.toggleDarkMode()"
        >
          <FontAwesomeIcon :icon="store.darkMode ? 'sun' : 'moon'" />
        </BButton>
      </header>

      <div
        class="app-body d-grid flex-fill min-h-0"
        style="grid-template-columns: 40fr 60fr; overflow: auto"
      >
        <PromptPanel />
        <MusicPanel />
      </div>

      <footer
        class="app-footer px-4 py-1 border-top text-center text-body-secondary small flex-shrink-0"
      >
        <template v-if="store.isRenderingNotation">Rendering sheet music…</template>
        <template v-else>Built with Vue 3 &middot; abcjs &middot; AI</template>
      </footer>
    </div>
  </BApp>
</template>

<style lang="scss">
.app-title {
  font-family: 'Newsreader', 'Georgia', 'Times New Roman', serif;
  letter-spacing: -0.01em;
  color: blue;
  text-shadow: black 2px 2px 0;
  animation: shadowing 1s linear infinite;
}

@keyframes shadowing {
  0% {
    text-shadow: red 2px 2px 0;
  }

  25% {
    text-shadow: green -2px 2px 0;
  }

  50% {
    text-shadow: blue -2px -2px 0;
  }

  75% {
    text-shadow: yellow 2px -2px 0;
  }
}

[data-bs-theme='dark'] {
  .app-title {
    color: cyan;
  }
}
</style>

<script setup lang="ts">
import { BApp } from 'bootstrap-vue-next'
import PromptPanel from './components/PromptPanel.vue'
import MusicPanel from './components/MusicPanel.vue'
</script>

<template>
  <BApp>
    <div class="app-shell d-flex flex-column vh-100 ">
      <header class="app-header d-flex align-items-baseline gap-3 px-4 py-3 border-bottom bg-body-secondary flex-shrink-0">
        <h1 class="app-title mb-0 fs-5 fw-semibold text-primary">
          ABC-AI-Music
        </h1>
        <span class="text-body-secondary fs-7">Generate music from text prompts</span>
      </header>

      <div class="app-body d-grid flex-fill min-h-0" style="grid-template-columns: 40fr 60fr">
        <PromptPanel />
        <MusicPanel />
      </div>

      <footer class="app-footer px-4 py-2 border-top bg-body-secondary text-center text-body-secondary small flex-shrink-0">
        Built with Vue 3 &middot; abcjs &middot; AI
      </footer>
    </div>
  </BApp>
</template>

<style>
.app-title {
  font-family: 'Newsreader', 'Georgia', 'Times New Roman', serif;
  letter-spacing: -0.01em;
}
</style>

<script setup lang="ts">
import { ref, watch, onMounted, nextTick, onUnmounted } from 'vue';
import abcjs from 'abcjs';
import 'abcjs/abcjs-audio.css';
import { BCollapse, BButton, BButtonGroup } from 'bootstrap-vue-next';
import { useMusicStore } from '../stores/music';

const store = useMusicStore();
const notationRef = ref<HTMLDivElement>();
const audioRef = ref<HTMLDivElement>();
const showNotation = ref(false);
const volume = ref(0.75);
const isUserEditing = ref(false);
const renderError = ref<string | null>(null);

function commitAbcEdit() {
  isUserEditing.value = false;
  renderSheet();
}

let synthControl: abcjs.SynthObjectController | null = null;
let masterGain: GainNode | null = null;
let audioCtx: AudioContext | null = null;
let origConnect: typeof AudioNode.prototype.connect | null = null;
let isRendering = false;

function setupAudioContext() {
  if (audioCtx) return; // already set up

  audioCtx = new AudioContext();
  masterGain = audioCtx.createGain();
  masterGain.gain.value = volume.value;
  masterGain.connect(audioCtx.destination);

  // Register with abcjs so it uses our context
  abcjs.synth.registerAudioContext(audioCtx);

  // Intercept connections to destination — route through master gain
  origConnect = AudioNode.prototype.connect;

  const connectProxy = function (this: AudioNode, ...args: unknown[]) {
    const [dest] = args;
    if (dest === audioCtx!.destination && this !== masterGain) {
      return origConnect!.apply(this, [masterGain, ...args.slice(1)] as unknown as Parameters<
        typeof AudioNode.prototype.connect
      >);
    }
    return origConnect!.apply(
      this,
      args as unknown as Parameters<typeof AudioNode.prototype.connect>,
    );
  };
  AudioNode.prototype.connect = connectProxy as typeof AudioNode.prototype.connect;
}

function teardownAudioContext() {
  if (origConnect) {
    AudioNode.prototype.connect = origConnect;
    origConnect = null;
  }
  synthControl = null;
  masterGain = null;
  audioCtx = null;
}

function setVolume(value: number) {
  volume.value = value;
  if (masterGain) {
    masterGain.gain.value = value;
  }
}

async function renderSheet() {
  if (!notationRef.value || !audioRef.value || !store.abcNotation) return;
  if (isRendering) return;
  isRendering = true;

  notationRef.value.innerHTML = '';
  audioRef.value.innerHTML = '';

  try {
    const visualObj = abcjs.renderAbc(notationRef.value, store.abcNotation, {
      responsive: 'resize',
      add_classes: true,
      staffwidth: 720,
    });

    if (abcjs.synth && abcjs.synth.supportsAudio()) {
      const { synth } = abcjs;

      synthControl = null;

      // Ensure audio context is set up before synth init
      setupAudioContext();

      synthControl = new synth.SynthController();
      synthControl.load(audioRef.value, null, {
        displayLoop: true,
        displayRestart: true,
        displayPlay: true,
        displayProgress: true,
      });

      // Warm up the soundfont cache with our custom audio context.
      // MIDI directives (%%MIDI chordprog, %%MIDI gchord, etc.) in the
      // ABC notation are parsed automatically by abcjs — no manual options needed.
      const audioSynth = new synth.CreateSynth();
      await audioSynth.init({
        visualObj: visualObj[0],
        audioContext: audioCtx!,
      });
      await synthControl.setTune(visualObj[0], false);

      // Restore volume after re-render (gain node persists across setTune calls)
      if (masterGain) {
        masterGain.gain.value = volume.value;
      }
      renderError.value = null;
      store.renderError = null;
    }
    isRendering = false;
  } catch (e) {
    isRendering = false;
    const msg = e instanceof Error ? e.message : String(e);
    renderError.value = msg;
    store.renderError = msg;
    console.error('abcjs render error:', e);
  }
}

watch(
  () => store.abcNotation,
  async (val) => {
    if (isUserEditing.value) return;
    if (!val) {
      // Notation cleared — reset the display
      if (notationRef.value) notationRef.value.innerHTML = '';
      if (audioRef.value) audioRef.value.innerHTML = '';
      renderError.value = null;
      store.renderError = null;
      return;
    }
    await nextTick();
    renderSheet();
  },
);

onMounted(() => {
  if (store.abcNotation) {
    renderSheet();
  }
});

onUnmounted(() => {
  teardownAudioContext();
});

async function copyAbc() {
  await navigator.clipboard.writeText(store.abcNotation);
}

function downloadMidi() {
  const result = abcjs.synth.getMidiFile(store.abcNotation, {
    midiOutputType: 'binary',
  });
  const bytes = Array.isArray(result) ? result[0] : result;
  const blob = new Blob([bytes as BlobPart], { type: 'audio/midi' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'abc-ai-music.mid';
  a.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <main class="d-flex flex-column gap-3 p-4 h-100 overflow-y-auto bg-body">
    <template v-if="store.hasNotation">
      <div class="flex-fill d-flex flex-column align-items-center p-3 sheet-area overflow-auto">
        <div ref="notationRef" class="w-100" style="max-width: 760px"></div>

        <!-- Volume control -->
        <div class="volume-row w-100 mt-3 d-flex align-items-center gap-2" style="max-width: 760px">
          <FontAwesomeIcon
            :icon="volume === 0 ? 'volume-mute' : 'volume-up'"
            class="text-body-secondary flex-shrink-0"
            size="sm"
          />
          <input
            type="range"
            class="form-range flex-fill"
            min="0"
            max="1"
            step="0.01"
            :value="volume"
            @input="setVolume(($event.target as HTMLInputElement).valueAsNumber)"
          />
          <span
            class="text-body-secondary small flex-shrink-0"
            style="min-width: 2.5rem; text-align: right"
          >
            {{ Math.round(volume * 100) }}%
          </span>
        </div>

        <div ref="audioRef" class="audio-controls w-100 mt-2" style="max-width: 760px"></div>

        <!-- Render error display -->
        <div v-if="renderError" class="render-error w-100 mt-2" style="max-width: 760px">
          ⚠️ Render error &mdash; edit the ABC below to fix:
          <pre class="render-error-text">{{ renderError }}</pre>
        </div>
      </div>

      <div class="d-flex gap-2 align-items-start flex-wrap">
        <BButtonGroup size="sm">
          <BButton
            variant="outline-secondary"
            :pressed="showNotation"
            @click="showNotation = !showNotation"
          >
            <FontAwesomeIcon icon="code" class="me-1" />
            {{ showNotation ? 'Hide Notation' : 'Show Notation' }}
          </BButton>
          <BButton variant="outline-secondary" @click="copyAbc">
            <FontAwesomeIcon icon="copy" class="me-1" />
            Copy
          </BButton>
        </BButtonGroup>

        <BButtonGroup size="sm">
          <BButton variant="outline-secondary" @click="downloadMidi"> MIDI </BButton>
          <BButton variant="outline-secondary" disabled> MP3 </BButton>
          <BButton variant="outline-secondary" disabled> MusicXML </BButton>
        </BButtonGroup>
      </div>

      <BCollapse :visible="showNotation">
        <textarea
          v-model="store.abcNotation"
          class="notation-text w-100 p-3 mb-0 border rounded"
          rows="16"
          @input="isUserEditing = true"
          @blur="commitAbcEdit"
        ></textarea>
      </BCollapse>
    </template>

    <template v-else>
      <div
        class="flex-fill d-flex flex-column align-items-center justify-content-center gap-2 text-center text-body-secondary"
      >
        <FontAwesomeIcon icon="music" size="3x" class="mb-2 text-body-secondary" />
        <p class="h6 mb-0 text-body">No music yet</p>
        <p class="small mb-0" style="max-width: 280px">
          Write a prompt and hit <strong class="text-primary">Generate</strong> to create your first
          piece.
        </p>
      </div>
    </template>
  </main>
</template>

<style scoped>
.sheet-area {
  background: var(--bs-body-bg);
  border-radius: var(--bs-border-radius-lg);
}

.volume-row {
  padding: 0 0.25rem;
}

.render-error {
  padding: 0.625rem 0.75rem;
  border: 1px solid var(--bs-danger-border-subtle, #f5b7b5);
  border-radius: var(--bs-border-radius);
  background: var(--bs-danger-bg-subtle, #fce8e7);
  color: var(--bs-danger-text-emphasis, #8a1e1c);
  font-size: 0.8125rem;
}

.render-error-text {
  margin: 0.375rem 0 0 0;
  padding: 0.375rem 0.5rem;
  font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
  font-size: 0.6875rem;
  line-height: 1.4;
  white-space: pre-wrap;
  max-height: 100px;
  overflow-y: auto;
  background: rgba(0, 0, 0, 0.05);
  border-radius: var(--bs-border-radius-sm);
  color: inherit;
}

.notation-text {
  font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
  font-size: 0.8125rem;
  line-height: 1.6;
  white-space: pre-wrap;
}

.audio-controls {
  min-height: 48px;
}
</style>

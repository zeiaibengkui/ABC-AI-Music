import { createApp } from 'vue';
import { createPinia } from 'pinia';
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate';
import { createBootstrap } from 'bootstrap-vue-next';
import { library } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome';
import {
  faVolumeUp,
  faVolumeMute,
  faMusic,
  faCopy,
  faCode,
  faPlay,
  faPause,
  faRotateLeft,
  faRepeat,
  faWandMagicSparkles,
  faSun,
  faMoon,
} from '@fortawesome/free-solid-svg-icons';
import App from './App.vue';

import 'bootstrap/dist/css/bootstrap.css';
import 'bootstrap-vue-next/dist/bootstrap-vue-next.css';
import '@/solarized.scss';

library.add(
  faVolumeUp,
  faVolumeMute,
  faMusic,
  faCopy,
  faCode,
  faPlay,
  faPause,
  faRotateLeft,
  faRepeat,
  faWandMagicSparkles,
  faSun,
  faMoon,
);

const app = createApp(App);

const pinia = createPinia();
pinia.use(piniaPluginPersistedstate);
app.use(pinia);
app.use(createBootstrap());
app.component('FontAwesomeIcon', FontAwesomeIcon);

app.mount('#app');

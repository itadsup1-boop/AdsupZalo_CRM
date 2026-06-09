import { createApp } from 'vue';
import App from './App.vue';
import { pinia } from './plugins/pinia';
import { router } from './router/index';
import { vuetify } from './plugins/vuetify';
import './assets/main.css';

const app = createApp(App);
app.use(pinia);
app.use(router);
app.use(vuetify);
app.mount('#app');

// TODO: Re-enable PWA when vite-plugin-pwa supports vite 8
// if ('serviceWorker' in navigator) {
//   import('virtual:pwa-register').then(({ registerSW }) => {
//     registerSW({ immediate: true });
//   });
// }

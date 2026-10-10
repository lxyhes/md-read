import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { startupStylesReady } from './startup'

createApp(App).use(createPinia()).mount('#app')
void startupStylesReady

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { startupStylesReady } from './startup'

void startupStylesReady
void import('./App.vue').then(({ default: App }) => {
  createApp(App).use(createPinia()).mount('#app')
}).catch((error: unknown) => {
  console.error('墨阅主界面加载失败', error)
  const status = document.querySelector<HTMLElement>('#startup-splash small')
  if (status) status.textContent = error instanceof Error ? `阅读空间加载失败：${error.message}` : '阅读空间加载失败，请重启应用'
})

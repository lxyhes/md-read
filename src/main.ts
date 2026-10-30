import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { startupStylesReady } from './startup'

try {
  document.documentElement.dataset.moyueTheme = localStorage.getItem('moyue:theme') === 'quiet-moss' ? 'quiet-moss' : 'paper-white'
} catch {
  document.documentElement.dataset.moyueTheme = 'paper-white'
}

void Promise.all([startupStylesReady, import('./App.vue')]).then(([, { default: App }]) => {
  createApp(App).use(createPinia()).mount('#app')
}).catch((error: unknown) => {
  console.error('墨阅主界面加载失败', error)
  const status = document.querySelector<HTMLElement>('#startup-splash small')
  if (status) status.textContent = error instanceof Error ? `阅读空间加载失败：${error.message}` : '阅读空间加载失败，请重启应用'
})

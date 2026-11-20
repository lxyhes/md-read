import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    headers: { 'Cache-Control': 'no-store' },
    watch: { ignored: ['**/src-tauri/**', '**/.cargo-task/**', '**/.rustup-task/**'] },
    warmup: { clientFiles: ['./src/main.ts', './src/App.vue', './src/styles.css'] }
  },
  test: {
    // Ant Design X imports Ant Design Vue's ESM files, which Vite must resolve for Node.
    server: { deps: { inline: ['ant-design-x-vue', 'ant-design-vue'] } }
  },
  optimizeDeps: { entries: ['./index.html'] },
  envPrefix: ['VITE_', 'TAURI_']
})

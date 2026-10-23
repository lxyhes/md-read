import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**', '**/.cargo-task/**', '**/.rustup-task/**'] },
    warmup: { clientFiles: ['./src/main.ts', './src/App.vue', './src/styles.css'] }
  },
  optimizeDeps: { entries: ['./index.html'] },
  envPrefix: ['VITE_', 'TAURI_']
})

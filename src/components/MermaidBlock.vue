<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useReaderStore } from '../stores/reader'
import AppIcon from './AppIcon.vue'

const props = defineProps<{ code: string; large?: boolean; themeKey?: string }>()
const emit = defineEmits<{ click: [] }>()
const store = useReaderStore()
const svg = ref('')
const error = ref('')
let shellObserver: MutationObserver | null = null

async function render() {
  error.value = ''
  try {
    const mermaid = (await import('mermaid')).default
    const shell = document.querySelector<HTMLElement>('.app-shell')
    const styles = shell ? getComputedStyle(shell) : getComputedStyle(document.documentElement)
    const token = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback
    const colors = store.activeTheme.tokens.color
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'base', themeVariables: { primaryColor: token('--surface-raised', colors.surfaceRaised), primaryTextColor: token('--ink', colors.text), lineColor: token('--accent', colors.accent), secondaryColor: token('--surface', colors.surface), tertiaryColor: token('--app-bg', colors.appBackground), primaryBorderColor: token('--accent', colors.accent), fontFamily: 'Iowan Old Style, Georgia, serif' } })
    const result = await mermaid.render(`moyue-${Math.random().toString(36).slice(2)}`, props.code)
    svg.value = result.svg
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '图表渲染失败'
  }
  await nextTick()
}

onMounted(() => {
  void render()
  const shell = document.querySelector('.app-shell')
  if (shell) {
    shellObserver = new MutationObserver(() => { void render() })
    shellObserver.observe(shell, { attributes: true, attributeFilter: ['class'] })
  }
})
onUnmounted(() => shellObserver?.disconnect())
watch(() => [props.code, store.activeThemeId, store.mode, props.themeKey], render)
</script>

<template>
  <button class="mermaid-block" :class="{ large }" type="button" @click="emit('click')">
    <div v-if="svg" class="mermaid-svg" v-html="svg" />
    <pre v-else-if="error"><code>{{ error }}\n\n{{ code }}</code></pre>
    <div v-else class="mermaid-loading"><span class="pulse-dot" /> 正在绘制图表</div>
    <span class="diagram-action">独立查看 <AppIcon name="external" :size="12" /></span>
  </button>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { ReaderRegion, ThemeManifest } from '../types'
import AppIcon from './AppIcon.vue'

const props = defineProps<{ region: ReaderRegion; themeMode?: ThemeManifest['mode'] }>()
const emit = defineEmits<{ copied: [] }>()

const highlighted = ref(props.region.html)
const copied = ref(false)
let copyTimer: number | null = null

const language = computed(() => String(props.region.metadata?.language ?? 'text'))
const lineCount = computed(() => Math.max(1, props.region.textContent.split(/\r?\n/).length))

async function updateCode() {
  const { highlightCode } = await import('../highlight')
  highlighted.value = await highlightCode(props.region.textContent, language.value, props.themeMode)
}

onMounted(updateCode)
watch(() => [props.region, props.themeMode], updateCode)
onUnmounted(() => {
  if (copyTimer !== null) window.clearTimeout(copyTimer)
})

async function copyCode() {
  try {
    await navigator.clipboard.writeText(props.region.textContent)
    copied.value = true
    emit('copied')
    if (copyTimer !== null) window.clearTimeout(copyTimer)
    copyTimer = window.setTimeout(() => { copied.value = false }, 1400)
  } catch {
    copied.value = false
  }
}
</script>

<template>
  <div class="code-viewer">
    <div class="code-viewer-toolbar">
      <span>
        <AppIcon name="code" :size="13" />
        <b>{{ language }}</b>
        <small>{{ lineCount }} 行</small>
      </span>
      <button type="button" @click="copyCode">
        <AppIcon :name="copied ? 'check' : 'copy'" :size="13" />
        {{ copied ? '已复制' : '复制代码' }}
      </button>
    </div>
    <div class="code-viewer-content" v-html="highlighted" />
  </div>
</template>

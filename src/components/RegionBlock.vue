<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { ReaderRegion, ThemeManifest } from '../types'
import MermaidBlock from './MermaidBlock.vue'
import AppIcon from './AppIcon.vue'
import IconButton from './IconButton.vue'

const props = defineProps<{ region: ReaderRegion; focused: boolean; active: boolean; focusDistance?: number; themeMode?: ThemeManifest['mode']; themeKey?: string }>()
const emit = defineEmits<{ focus: []; openViewer: []; 'code-copied': [] }>()
const highlighted = ref(props.region.html)
const copied = ref(false)
let copyTimer: number | null = null
const codeLanguage = computed(() => String(props.region.metadata?.language ?? 'text'))
const isDiagramLike = computed(() => props.region.type === 'code' && /[┌┐└┘│─━→←↑↓]/.test(props.region.textContent))
const codeLineCount = computed(() => Math.max(1, props.region.textContent.split(/\r?\n/).length))
const focusDistanceClass = computed(() => `focus-distance-${Math.min(3, Math.max(0, props.focusDistance ?? 0))}`)

async function updateCode() {
  if (props.region.type !== 'code') {
    highlighted.value = props.region.html
    return
  }
  const { highlightCode } = await import('../highlight')
  highlighted.value = await highlightCode(props.region.textContent, String(props.region.metadata?.language ?? 'text'), props.themeMode)
}
onMounted(updateCode)
watch(() => [props.region, props.themeMode], updateCode)
onUnmounted(() => {
  if (copyTimer) window.clearTimeout(copyTimer)
})

async function copyCode() {
  try {
    await navigator.clipboard.writeText(props.region.textContent)
    copied.value = true
    emit('code-copied')
    if (copyTimer) window.clearTimeout(copyTimer)
    copyTimer = window.setTimeout(() => { copied.value = false }, 1400)
  } catch {
    copied.value = false
  }
}
</script>

<template>
  <article :data-region-id="region.id" class="region-block" :class="[`region-${region.type}`, focusDistanceClass, { focused, active }]" tabindex="0" @click="emit('focus')" @keydown.enter.prevent="emit('focus')" @keydown.space.prevent="emit('focus')">
    <div v-if="region.type === 'mermaid'" class="region-content" @click.stop="emit('openViewer')">
      <MermaidBlock :code="String(region.metadata?.code ?? region.textContent)" :theme-key="themeKey" />
    </div>
    <div v-else-if="region.type === 'image'" class="region-content image-region" @click.stop="emit('openViewer')">
      <div v-html="highlighted" />
      <button class="inline-view-action" type="button" @click.stop="emit('openViewer')">查看原图 <AppIcon name="external" :size="12" /></button>
    </div>
    <div v-else class="region-content">
      <div v-if="region.type === 'code'" class="code-frame" :class="{ 'is-diagram': isDiagramLike }" :data-language="isDiagramLike ? 'diagram' : codeLanguage">
        <div class="code-toolbar" @click.stop>
          <span class="code-language"><AppIcon name="code" :size="13" /><b>{{ codeLanguage }}</b><small>{{ codeLineCount }} 行</small></span>
          <span class="code-toolbar-actions">
            <button class="code-view" type="button" @click.stop="emit('openViewer')"><AppIcon name="external" :size="12" />独立查看</button>
            <button class="code-copy" type="button" @click="copyCode"><AppIcon :name="copied ? 'check' : 'copy'" :size="13" />{{ copied ? '已复制' : '复制代码' }}</button>
          </span>
        </div>
        <div class="code-body" v-html="highlighted" />
      </div>
      <div v-else-if="region.type === 'table'" class="table-region">
        <div class="table-region-toolbar">
          <span><AppIcon name="table" :size="13" /> 数据表</span>
          <button class="inline-view-action" type="button" @click.stop="emit('openViewer')">独立查看 <AppIcon name="table" :size="12" /></button>
        </div>
        <div v-html="highlighted" />
      </div>
      <div v-else v-html="highlighted" />
    </div>
    <IconButton class="region-more" icon="more" size="sm" label="聚焦此区域" @click.stop="emit('focus')" />
  </article>
</template>

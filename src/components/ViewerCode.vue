<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { ReaderRegion, ThemeManifest } from '../types'
import AppIcon from './AppIcon.vue'

const props = defineProps<{ region: ReaderRegion; themeMode?: ThemeManifest['mode'] }>()
const emit = defineEmits<{ copied: [] }>()
const language = computed(() => String(props.region.metadata?.language ?? 'text'))
const proseCodeLanguage = computed(() => /^(?:text|plaintext|markdown|md)$/i.test(language.value))

const highlighted = ref(props.region.html)
const copied = ref(false)
const wrapped = ref(proseCodeLanguage.value)
const selectedCodeText = ref('')
const activeCodeLine = ref('')
let copyTimer: number | null = null

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
function selectCodeLine(event: MouseEvent) {
  const line = (event.target as HTMLElement).closest('.line')
  if (line) activeCodeLine.value = line.textContent?.trimEnd() ?? ''
}
function captureCodeSelection(event: MouseEvent) {
  const body = event.currentTarget as HTMLElement
  const selection = window.getSelection()
  const range = selection?.rangeCount ? selection.getRangeAt(0) : null
  selectedCodeText.value = selection && range && body.contains(range.commonAncestorContainer) ? selection.toString().trim() : ''
}
async function copyText(text: string) {
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
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
  <div class="code-viewer code-frame standalone-code-frame" :data-language="language">
    <div class="code-viewer-toolbar code-toolbar" @click.stop>
      <span class="code-language">
        <AppIcon name="code" :size="13" />
        <b>{{ language }}</b>
        <small>{{ lineCount }} 行</small>
      </span>
      <span class="code-toolbar-actions">
        <button class="code-copy" type="button" @click="copyCode"><AppIcon :name="copied ? 'check' : 'copy'" :size="13" />{{ copied ? '已复制' : '复制全部' }}</button>
        <button class="code-copy" type="button" :disabled="!activeCodeLine" @click="copyText(activeCodeLine)">复制当前行</button>
        <button class="code-copy" type="button" :disabled="!selectedCodeText" @click="copyText(selectedCodeText)">复制选中</button>
        <button class="code-copy code-wrap-toggle" type="button" :class="{ active: wrapped }" @click="wrapped = !wrapped">{{ wrapped ? '横向滚动' : '软换行' }}</button>
      </span>
    </div>
    <div class="code-viewer-content code-body" :class="{ 'is-wrapped': wrapped }" @click.stop="selectCodeLine" @mouseup.stop="captureCodeSelection" v-html="highlighted" />
  </div>
</template>

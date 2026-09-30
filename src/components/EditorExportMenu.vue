<script setup lang="ts">
import { ref } from 'vue'
import type { PandocExportFormat } from '../fileService'
defineProps<{ disabled?: boolean }>()
const emit = defineEmits<{ export: [format: 'markdown' | 'html' | 'html-clean' | 'image' | PandocExportFormat]; pdf: [] }>()
const menu = ref<HTMLDetailsElement | null>(null)
function choose(format: 'markdown' | 'html' | 'html-clean' | 'image' | PandocExportFormat) {
  if (menu.value) menu.value.open = false
  emit('export', format)
}
</script>

<template>
  <details ref="menu" class="editor-export-menu" @keydown.esc.stop="menu && (menu.open = false)">
    <summary aria-label="导出当前草稿" :aria-disabled="disabled" @click="disabled && $event.preventDefault()">{{ disabled ? '导出中…' : '导出' }}</summary>
    <div role="menu" aria-label="草稿导出格式">
      <button type="button" role="menuitem" @click="choose('markdown')">Markdown</button>
      <button type="button" role="menuitem" @click="choose('html')">HTML · 当前主题</button>
      <button type="button" role="menuitem" @click="choose('docx')">DOCX · Word</button>
      <button type="button" role="menuitem" @click="choose('epub')">EPUB · 电子书</button>
      <button type="button" role="menuitem" @click="choose('latex')">LaTeX</button>
      <button type="button" role="menuitem" @click="choose('image')">PNG · 长图</button>
      <button type="button" role="menuitem" @click="menu && (menu.open = false); emit('pdf')">PDF</button>
    </div>
  </details>
</template>

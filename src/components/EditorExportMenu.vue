<script setup lang="ts">
import Dropdown, { Doption } from '@arco-design/web-vue/es/dropdown'
import Button from '@arco-design/web-vue/es/button'
import '@arco-design/web-vue/es/dropdown/style/css.js'
import '@arco-design/web-vue/es/button/style/css.js'
import type { PandocExportFormat } from '../fileService'
defineProps<{ disabled?: boolean }>()
const emit = defineEmits<{ export: [format: 'markdown' | 'html' | 'html-clean' | 'image' | PandocExportFormat]; pdf: [] }>()
function choose(format: string | number | Record<string, any> | undefined) {
  if (format === 'pdf') emit('pdf')
  else emit('export', format as 'markdown' | 'html' | 'html-clean' | 'image' | PandocExportFormat)
}
</script>

<template>
  <Dropdown trigger="click" position="br" :disabled="disabled" @select="choose">
    <Button type="secondary" :disabled="disabled" :loading="disabled" aria-label="导出当前草稿">导出</Button>
    <template #content>
      <Doption value="markdown">Markdown</Doption>
      <Doption value="html">HTML · 当前主题</Doption>
      <Doption value="docx">DOCX · Word</Doption>
      <Doption value="epub">EPUB · 电子书</Doption>
      <Doption value="latex">LaTeX</Doption>
      <Doption value="image">PNG · 长图</Doption>
      <Doption value="pdf">PDF</Doption>
    </template>
  </Dropdown>
</template>

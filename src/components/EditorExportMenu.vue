<script setup lang="ts">
import { Dropdown, Menu, MenuItem } from 'ant-design-vue'
import Button from './AppButton.vue'
import type { PandocExportFormat } from '../fileService'
defineProps<{ disabled?: boolean }>()
const emit = defineEmits<{ export: [format: 'markdown' | 'html' | 'html-clean' | 'image' | PandocExportFormat]; pdf: [] }>()
function choose(format: string | number) {
  if (format === 'pdf') emit('pdf')
  else emit('export', format as 'markdown' | 'html' | 'html-clean' | 'image' | PandocExportFormat)
}
</script>

<template>
  <Dropdown :trigger="['click']" placement="bottomRight" :disabled="disabled">
    <Button type="secondary" :disabled="disabled" :loading="disabled" aria-label="导出当前草稿">导出</Button>
    <template #overlay>
      <Menu @click="({ key }) => choose(key)">
        <MenuItem key="markdown">Markdown</MenuItem>
        <MenuItem key="html">HTML · 当前主题</MenuItem>
        <MenuItem key="docx">DOCX · Word</MenuItem>
        <MenuItem key="epub">EPUB · 电子书</MenuItem>
        <MenuItem key="latex">LaTeX</MenuItem>
        <MenuItem key="image">PNG · 长图</MenuItem>
        <MenuItem key="pdf">PDF</MenuItem>
      </Menu>
    </template>
  </Dropdown>
</template>

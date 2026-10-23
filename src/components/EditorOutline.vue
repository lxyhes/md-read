<script setup lang="ts">
import { computed } from 'vue'
import type { ReaderDocument } from '../types'
import AppIcon from './AppIcon.vue'

const props = defineProps<{ document: ReaderDocument | null; cursor: number }>()
const emit = defineEmits<{ jump: [index: number] }>()
const headings = computed(() => props.document?.headings ?? [])
const minDepth = computed(() => Math.min(6, ...headings.value.map(heading => heading.depth)))
const activeId = computed(() => {
  const positions = new Map(props.document?.regions.map(region => [region.id, region.sourceStart]))
  let active = headings.value[0]?.id
  for (const heading of headings.value) {
    const position = positions.get(heading.regionId)
    if (position !== undefined && position <= props.cursor) active = heading.id
  }
  return active
})
</script>

<template>
  <details class="editor-draft-outline" open>
    <summary><AppIcon name="reader" :size="14" /><span>大纲</span><small>{{ headings.length }} 个章节 · 当前草稿</small><AppIcon name="chevron-down" :size="13" /></summary>
    <nav v-if="headings.length" aria-label="编辑中的文档大纲">
      <button v-for="(heading, index) in headings" :key="heading.id" type="button" :style="{ paddingInlineStart: `${12 + (heading.depth - minDepth) * 12}px` }" :aria-current="activeId === heading.id ? 'location' : undefined" @click="emit('jump', index)">{{ heading.text }}</button>
    </nav>
    <p v-else>添加 Markdown 标题后，章节会显示在这里。</p>
  </details>
</template>

<style scoped>
.editor-draft-outline { min-width: 0; height: 100%; min-height: 0; overflow: hidden; border-right: 1px solid var(--border); padding-right: 10px; }
summary { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; min-height: 56px; padding: 6px 0; color: var(--ink); font: 12px/1.5 var(--ui-font); cursor: pointer; list-style: none; }
summary::-webkit-details-marker { display: none; }
summary small { order: 1; flex-basis: 100%; color: var(--muted); font-size: 11px; }
summary > .app-icon:last-child { margin-left: auto; transform: rotate(-90deg); }
[open] summary > .app-icon:last-child { transform: none; }
nav { display: flex; flex-direction: column; height: calc(100% - 56px); overflow: auto; padding-bottom: 6px; scrollbar-width: thin; }
.editor-draft-outline:not([open]) { padding: 0; }
.editor-draft-outline:not([open]) summary { flex-direction: column; padding: 8px 0; }
.editor-draft-outline:not([open]) summary small { display: none; }
button { flex: 0 0 auto; padding: 6px 12px; border-radius: 4px; background: transparent; color: var(--muted); font: 12px/1.5 var(--ui-font); text-align: left; overflow-wrap: anywhere; }
button:hover, button[aria-current="location"] { color: var(--accent); background: color-mix(in srgb, var(--accent) 9%, transparent); }
:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
p { margin: 0; padding: 0 0 10px; color: var(--muted); font: 12px/1.5 var(--ui-font); }
</style>

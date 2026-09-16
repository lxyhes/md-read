<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import type { ReaderRegion, ThemeManifest } from '../types'
import { highlightCode } from '../highlight'
import MermaidBlock from './MermaidBlock.vue'

const props = defineProps<{ region: ReaderRegion; focused: boolean; active: boolean; themeMode?: ThemeManifest['mode']; themeKey?: string }>()
const emit = defineEmits<{ focus: []; openViewer: [] }>()
const highlighted = ref(props.region.html)

async function updateCode() {
  if (props.region.type === 'code') highlighted.value = await highlightCode(props.region.textContent, String(props.region.metadata?.language ?? 'text'), props.themeMode)
  else highlighted.value = props.region.html
}
onMounted(updateCode)
watch(() => [props.region, props.themeMode], updateCode)
</script>

<template>
  <article :data-region-id="region.id" class="region-block" :class="[`region-${region.type}`, { focused, active }]" tabindex="0" @click="emit('focus')">
    <div v-if="region.type === 'mermaid'" class="region-content" @click.stop="emit('openViewer')">
      <MermaidBlock :code="String(region.metadata?.code ?? region.textContent)" :theme-key="themeKey" />
    </div>
    <div v-else-if="region.type === 'image'" class="region-content image-region" @click.stop="emit('openViewer')">
      <div v-html="highlighted" />
      <button class="inline-view-action" type="button" @click.stop="emit('openViewer')">查看原图 ↗</button>
    </div>
    <div v-else class="region-content">
      <button v-if="['code', 'table'].includes(region.type)" class="inline-view-action" type="button" @click.stop="emit('openViewer')">独立查看 ↗</button>
      <div v-if="region.type === 'code'" class="code-frame" :data-language="String(region.metadata?.language ?? 'text')" v-html="highlighted" />
      <div v-else v-html="highlighted" />
    </div>
    <button class="region-more" type="button" aria-label="聚焦此区域" @click.stop="emit('focus')">· · ·</button>
  </article>
</template>

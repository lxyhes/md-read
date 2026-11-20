<script setup lang="ts">
import { computed } from 'vue'
import { renderMarkdownFragment } from '../markdown/fragment'
import type { MarkdownUrlResolver } from '../markdown/shared'

const props = defineProps<{ html?: string; source?: string; resolveUrl?: MarkdownUrlResolver }>()
const content = computed(() => props.source === undefined
  ? props.html ?? ''
  : renderMarkdownFragment(props.source, props.resolveUrl))
</script>

<template>
  <div v-html="content" />
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { renderMarkdownFragment } from '../markdown/fragment'
import type { MarkdownUrlResolver } from '../markdown/shared'
import type { ReaderRegion, ThemeManifest } from '../types'

const props = defineProps<{ html?: string; source?: string; resolveUrl?: MarkdownUrlResolver; previewImages?: boolean; codeRegion?: ReaderRegion; themeMode?: ThemeManifest['mode'] }>()
const emit = defineEmits<{ 'open-image': [image: HTMLImageElement] }>()
const root = ref<HTMLElement | null>(null)
const highlighted = ref<string>()
const content = computed(() => props.source === undefined
  ? highlighted.value ?? props.html ?? ''
  : renderMarkdownFragment(props.source, props.resolveUrl))

watch(() => [props.codeRegion, props.themeMode] as const, async ([region, mode], _, onCleanup) => {
  highlighted.value = undefined
  if (!region) return
  let current = true
  onCleanup(() => { current = false })
  const { highlightCode } = await import('../highlight')
  const html = await highlightCode(region.textContent, String(region.metadata?.language ?? 'text'), mode)
  if (current) highlighted.value = html
}, { immediate: true })

watch([root, content], ([element]) => {
  if (!props.previewImages || !element) return
  for (const image of element.querySelectorAll<HTMLImageElement>('img[src]:not([src=""])')) {
    if (image.closest('a, button')) continue
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'markdown-image-preview'
    button.setAttribute('aria-label', image.alt ? `放大查看 ${image.alt}` : '放大查看图片')
    button.title = '点击放大图片'
    image.replaceWith(button)
    button.append(image)
  }
}, { flush: 'post' })

function openImage(event: MouseEvent) {
  if (!props.previewImages || !(event.target instanceof Element)) return
  const image = event.target instanceof HTMLImageElement
    ? event.target
    : event.target.closest('.markdown-image-preview')?.querySelector('img')
  if (!image?.getAttribute('src')?.trim()) return
  event.preventDefault()
  event.stopPropagation()
  emit('open-image', image)
}
</script>

<template>
  <div ref="root" v-html="content" @click="openImage" />
</template>

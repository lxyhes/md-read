<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

defineProps<{ columns?: 1 | 2 }>()
const emit = defineEmits<{ 'resize-content': [width: number] }>()
const panel = ref<HTMLElement | null>(null)
const grid = ref<HTMLElement | null>(null)
let gridObserver: ResizeObserver | undefined
const widthKey = 'moyue:web-preview-width-percent'
const defaultWidth = 46
const minWidth = 30
const maxWidth = 75
const clampWidth = (width: number) => Math.min(maxWidth, Math.max(minWidth, width))
const savedWidth = Number(localStorage.getItem(widthKey) ?? defaultWidth)
const width = ref(Number.isFinite(savedWidth) ? clampWidth(savedWidth) : defaultWidth)
const drag = ref<{ pointerId: number; x: number; width: number; totalWidth: number } | null>(null)

function saveWidth() {
  localStorage.setItem(widthKey, String(width.value))
}
function startResize(event: PointerEvent) {
  const totalWidth = panel.value?.parentElement?.clientWidth
  if (event.button !== 0 || !event.isPrimary || drag.value || !totalWidth) return
  const handle = event.currentTarget as HTMLElement
  handle.focus()
  handle.setPointerCapture(event.pointerId)
  drag.value = { pointerId: event.pointerId, x: event.clientX, width: width.value, totalWidth }
}
function resize(event: PointerEvent) {
  const start = drag.value
  if (start?.pointerId !== event.pointerId) return
  width.value = clampWidth(start.width + (start.x - event.clientX) * 100 / start.totalWidth)
}
function stopResize(event: PointerEvent) {
  if (drag.value?.pointerId !== event.pointerId) return
  drag.value = null
  saveWidth()
}
function resetWidth() {
  width.value = defaultWidth
  saveWidth()
}
function resizeWithKeyboard(event: KeyboardEvent) {
  switch (event.key) {
    case 'ArrowLeft': width.value = clampWidth(width.value + 2); break
    case 'ArrowRight': width.value = clampWidth(width.value - 2); break
    case 'Home': width.value = minWidth; break
    case 'End': width.value = maxWidth; break
    default: return
  }
  event.preventDefault()
  saveWidth()
}

onMounted(() => {
  gridObserver = new ResizeObserver(([entry]) => emit('resize-content', entry.contentRect.width))
  if (grid.value) gridObserver.observe(grid.value)
})

onUnmounted(() => {
  gridObserver?.disconnect()
  if (drag.value) saveWidth()
})
</script>

<template>
  <aside ref="panel" class="web-preview-dock" :style="{ flexBasis: `${width}%` }" aria-label="网页预览区">
    <div
      class="web-preview-divider"
      :class="{ 'is-dragging': drag }"
      role="separator"
      tabindex="0"
      aria-orientation="vertical"
      aria-label="调整网页预览宽度"
      :aria-valuemin="minWidth"
      :aria-valuemax="maxWidth"
      :aria-valuenow="Math.round(width)"
      :aria-valuetext="`${Math.round(width)}%`"
      title="左右拖动调整宽度，双击恢复默认"
      @pointerdown="startResize"
      @pointermove="resize"
      @pointerup="stopResize"
      @pointercancel="stopResize"
      @lostpointercapture="stopResize"
      @dblclick="resetWidth"
      @keydown="resizeWithKeyboard"
    />
    <slot name="toolbar" />
    <div ref="grid" class="web-preview-grid" :class="{ 'is-split': columns === 2 }"><slot /></div>
  </aside>
</template>

<style scoped>
.web-preview-dock { position: relative; display: flex; flex-direction: column; flex: 0 0 46%; box-sizing: border-box; min-width: 0; height: 100%; padding-left: 8px; }
.web-preview-grid { display: grid; flex: 1; min-height: 0; grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); gap: 1px; background: var(--border); }
.web-preview-grid.is-split { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.web-preview-divider { position: absolute; inset: 0 auto 0 0; width: 8px; cursor: col-resize; touch-action: none; user-select: none; }
.web-preview-divider::after { content: ''; position: absolute; inset: 0 auto 0 0; width: 1px; background: var(--border); }
.web-preview-divider:is(:hover, :focus-visible, .is-dragging)::after { width: 3px; background: var(--accent); }
</style>

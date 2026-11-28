<script setup lang="ts">
import { ref, watch } from 'vue'

const root = ref<HTMLElement | null>(null)
const boxes = ref<DOMRect[]>([])

watch(root, (element, _, onCleanup) => {
  if (!element) return
  const surface = element
  const fragment = document.createRange()
  let selectionFrame = 0
  function drawSelection() {
    selectionFrame = 0
    const selection = window.getSelection()
    const range = selection?.rangeCount && !selection.isCollapsed ? selection.getRangeAt(0) : null
    if (!surface.isConnected || !range?.intersectsNode(surface) || typeof fragment.getClientRects !== 'function') {
      boxes.value = []
      return
    }

    const origin = surface.getBoundingClientRect()
    const ancestor = range.commonAncestorContainer
    const walker = document.createTreeWalker(surface.contains(ancestor) ? ancestor : surface,
      NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, node => {
        if (!range.intersectsNode(node)) return NodeFilter.FILTER_REJECT
        return node.nodeType === Node.TEXT_NODE ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP
      })
    const highlights: DOMRect[] = []
    // Measuring text runs avoids WebKit's selection fill between wrapped lines.
    for (let node = walker.currentNode.nodeType === Node.TEXT_NODE ? walker.currentNode : walker.nextNode();
      node; node = walker.nextNode()) {
      const start = node === range.startContainer ? range.startOffset : 0
      const end = node === range.endContainer ? range.endOffset : node.textContent!.length
      if (start === end) continue
      fragment.setStart(node, start)
      fragment.setEnd(node, end)
      const parent = node.parentElement!
      const style = getComputedStyle(parent)
      if (style.userSelect === 'none' || style.visibility !== 'visible') continue
      const fontSize = parseFloat(style.fontSize)
      const clip = parent.closest('.code-body, .table-scroll')?.getBoundingClientRect()
        ?? parent.closest('pre')?.getBoundingClientRect()
      for (const rect of fragment.getClientRects()) {
        const height = Math.min(rect.height, fontSize * 1.15)
        const top = rect.top + (rect.height - height) / 2
        const x = Math.max(rect.left, clip?.left ?? rect.left)
        const y = Math.max(top, clip?.top ?? top)
        const width = Math.min(rect.right, clip?.right ?? rect.right) - x
        const visibleHeight = Math.min(top + height, clip?.bottom ?? top + height) - y
        if (width > 0 && visibleHeight > 0) {
          highlights.push(new DOMRect(x - origin.left + surface.scrollLeft, y - origin.top + surface.scrollTop, width, visibleHeight))
        }
      }
    }
    boxes.value = highlights
  }
  function scheduleSelection() {
    const selection = window.getSelection()
    if (!selectionFrame && surface.isConnected && (boxes.value.length || (selection && !selection.isCollapsed))) {
      selectionFrame = requestAnimationFrame(drawSelection)
    }
  }
  const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(scheduleSelection)
  observer?.observe(surface)
  document.addEventListener('selectionchange', scheduleSelection)
  window.addEventListener('scroll', scheduleSelection, true)
  onCleanup(() => {
    observer?.disconnect()
    cancelAnimationFrame(selectionFrame)
    document.removeEventListener('selectionchange', scheduleSelection)
    window.removeEventListener('scroll', scheduleSelection, true)
  })
}, { flush: 'post' })
</script>

<template>
  <div ref="root" class="text-selection-surface" :class="{ 'has-selection-boxes': boxes.length }">
    <svg v-if="boxes.length" class="text-selection-overlay" aria-hidden="true">
      <rect v-for="(box, index) in boxes" :key="index" :x="box.x" :y="box.y" :width="box.width" :height="box.height" />
    </svg>
    <slot />
  </div>
</template>

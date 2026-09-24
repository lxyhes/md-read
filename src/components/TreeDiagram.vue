<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import type { AsciiTreeNode } from '../asciiDiagram'

const props = defineProps<{ node: AsciiTreeNode; root?: boolean; depth?: number }>()
const expanded = ref(true)
const summaryOpen = ref(false)
const summaryHover = ref(false)
const summaryTarget = ref<HTMLElement | null>(null)
const summaryPopoverStyle = ref<Record<string, string>>({})
const summaryHtml = ref('')
let summarySource = ''
let hideTimer: number | undefined
const branchDepth = props.depth ?? 0
const isSummaryLeaf = (label: string) => label.startsWith('内容：') || label.startsWith('导读：')
const summaryKind = (label: string) => label.startsWith('导读：') ? '导读' : '摘要'
const summaryText = (label: string) => label.replace(/^(?:内容|导读)：/, '')
const summaryVisible = computed(() => summaryOpen.value || summaryHover.value)
const loadSummaryHtml = async () => {
  const source = props.node.detail || summaryText(props.node.label)
  if (summarySource === source && summaryHtml.value) return
  summarySource = source
  const { renderMarkdownFragment } = await import('../markdown/fragment')
  if (summarySource === source) summaryHtml.value = renderMarkdownFragment(source)
}
const toggleSummary = () => {
  if (isSummaryLeaf(props.node.label)) summaryOpen.value = !summaryOpen.value
}
const positionSummary = () => {
  const target = summaryTarget.value
  if (!target) return

  const targetRect = target.getBoundingClientRect()
  const gap = 10
  const viewportPadding = 16
  const width = Math.min(520, window.innerWidth - viewportPadding * 2)
  const preferredHeight = Math.min(300, window.innerHeight * 0.42)
  const topSpace = targetRect.top - gap - viewportPadding
  const bottomSpace = window.innerHeight - targetRect.bottom - gap - viewportPadding
  const showBelow = bottomSpace >= preferredHeight || bottomSpace >= topSpace
  const availableHeight = Math.max(120, Math.min(300, showBelow ? bottomSpace : topSpace))
  const left = Math.min(
    Math.max(viewportPadding, targetRect.left + 8),
    window.innerWidth - width - viewportPadding,
  )
  const top = showBelow
    ? targetRect.bottom + gap
    : Math.max(viewportPadding, targetRect.top - gap - availableHeight)

  summaryPopoverStyle.value = {
    left: `${left}px`,
    top: `${top}px`,
    width: `${width}px`,
    maxHeight: `${availableHeight}px`,
  }
}
const showSummary = (event: MouseEvent | FocusEvent) => {
  const target = event.currentTarget
  if (!(target instanceof HTMLElement) || !isSummaryLeaf(props.node.label)) return

  window.clearTimeout(hideTimer)
  summaryTarget.value = target
  summaryHover.value = true
  positionSummary()
  void loadSummaryHtml()
  window.addEventListener('resize', positionSummary)
  window.addEventListener('scroll', positionSummary, true)
}
const cancelHideSummary = () => {
  window.clearTimeout(hideTimer)
}
const hideSummary = () => {
  summaryHover.value = false
  if (!summaryOpen.value) {
    summaryTarget.value = null
    window.removeEventListener('resize', positionSummary)
    window.removeEventListener('scroll', positionSummary, true)
  }
}
const scheduleHideSummary = () => {
  window.clearTimeout(hideTimer)
  hideTimer = window.setTimeout(hideSummary, 120)
}
onBeforeUnmount(() => {
  window.clearTimeout(hideTimer)
  window.removeEventListener('resize', positionSummary)
  window.removeEventListener('scroll', positionSummary, true)
})
</script>

<template>
  <div v-if="root" class="tree-diagram" role="tree">
    <button class="tree-root" :class="{ collapsed: !expanded }" type="button" :aria-expanded="expanded" @click="expanded = !expanded">{{ node.label }}</button>
    <ul v-if="expanded && node.children.length" class="tree-children tree-root-children">
      <TreeDiagram v-for="(child, index) in node.children" :key="`${child.label}-${index}`" :node="child" :depth="branchDepth + 1" />
    </ul>
  </div>
  <li v-else class="tree-item" role="treeitem">
    <details v-if="node.children.length" :open="branchDepth <= 1">
      <summary>{{ node.label }}</summary>
      <ul class="tree-children">
        <TreeDiagram v-for="(child, index) in node.children" :key="`${child.label}-${index}`" :node="child" :depth="branchDepth + 1" />
      </ul>
    </details>
      <span v-else class="tree-leaf" :class="{ 'tree-summary-leaf': isSummaryLeaf(node.label), 'is-summary-open': summaryOpen }" :title="isSummaryLeaf(node.label) ? '悬浮查看完整内容，点击固定' : node.label" :tabindex="isSummaryLeaf(node.label) ? 0 : undefined" :role="isSummaryLeaf(node.label) ? 'button' : undefined" :aria-expanded="isSummaryLeaf(node.label) ? summaryVisible : undefined" @mouseenter="showSummary" @mouseleave="scheduleHideSummary" @focus="showSummary" @blur="scheduleHideSummary" @click="toggleSummary" @keydown.enter.prevent="toggleSummary" @keydown.space.prevent="toggleSummary" @keydown.esc="summaryOpen = false; hideSummary()">
      <template v-if="isSummaryLeaf(node.label)">
        <span class="tree-leaf-kicker">{{ summaryKind(node.label) }}</span>
        <span class="tree-leaf-text">{{ summaryText(node.label) }}</span>
      </template>
      <template v-else>{{ node.label }}</template>
    </span>
    <Teleport to="body">
      <div v-if="isSummaryLeaf(node.label) && summaryVisible" class="tree-summary-popover" role="tooltip" :style="summaryPopoverStyle" @mouseenter="cancelHideSummary" @mouseleave="scheduleHideSummary">
        <div class="tree-summary-popover-heading">完整内容</div>
        <div v-if="summaryHtml" class="tree-summary-markdown" v-html="summaryHtml" />
        <div v-else class="tree-summary-markdown tree-summary-loading">正在整理格式…</div>
      </div>
    </Teleport>
  </li>
</template>

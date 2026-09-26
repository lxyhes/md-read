<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { AsciiTreeNode } from '../asciiDiagram'

const props = defineProps<{ node: AsciiTreeNode; root?: boolean; depth?: number; compact?: boolean }>()
const emit = defineEmits<{ 'open-link': [url: string] }>()
const expanded = ref(true)
const summaryOpen = ref(false)
const summaryHover = ref(false)
const summaryTarget = ref<HTMLElement | null>(null)
const summaryPopover = ref<HTMLElement | null>(null)
const summaryPopoverStyle = ref<Record<string, string>>({})
const summaryHtml = ref('')
let summarySource = ''
let hideTimer: number | undefined
const branchDepth = props.depth ?? 0
const isSummaryLeaf = (label: string) => label.startsWith('内容：') || label.startsWith('导读：')
const summaryKind = (label: string) => label.startsWith('导读：') ? '导读' : '摘要'
const summaryText = (label: string) => label.replace(/^(?:内容|导读)：/, '')
const summaryVisible = computed(() => summaryOpen.value || summaryHover.value)
const nodeLinkLabel = (label: string) => `打开章节链接：${label}`
const linkText = computed(() => props.node.href ? props.node.linkText || '↗' : '')
const linkStart = computed(() => linkText.value && linkText.value !== '↗' ? props.node.label.indexOf(linkText.value) : -1)
const nodeLabel = computed(() => linkStart.value >= 0
  ? `${props.node.label.slice(0, linkStart.value)}${props.node.label.slice(linkStart.value + linkText.value.length)}`.trim()
  : props.node.label)
const rootLabel = computed(() => {
  const name = props.node.label.replace(/\.(?:md|markdown)$/i, '').trim()
  return Array.from(name).length > 28 ? `${Array.from(name).slice(0, 28).join('')}…` : name
})
const openNodeLink = (event: MouseEvent) => {
  event.preventDefault()
  event.stopPropagation()
  if (props.node.href) emit('open-link', props.node.href)
}
const loadSummaryHtml = async () => {
  const source = props.node.detail || summaryText(props.node.label)
  if (summarySource === source && summaryHtml.value) return
  summarySource = source
  const { renderMarkdownFragment } = await import('../markdown/fragment')
  if (summarySource === source) summaryHtml.value = renderMarkdownFragment(source)
}
const toggleSummary = () => {
  if (!isSummaryLeaf(props.node.label)) return
  summaryOpen.value = !summaryOpen.value
  if (summaryOpen.value) positionSummary()
  else if (!summaryHover.value) hideSummary()
}
const positionSummary = () => {
  const target = summaryTarget.value
  if (!target) return

  const targetRect = target.getBoundingClientRect()
  const gap = 10
  const viewportPadding = 16
  const width = Math.min(460, window.innerWidth - viewportPadding * 2)
  const preferredHeight = Math.min(360, window.innerHeight * 0.56)
  const topSpace = targetRect.top - gap - viewportPadding
  const bottomSpace = window.innerHeight - targetRect.bottom - gap - viewportPadding
  const rightSpace = window.innerWidth - targetRect.right - gap - viewportPadding
  const leftSpace = targetRect.left - gap - viewportPadding
  const showOnSide = Math.max(leftSpace, rightSpace) >= width
  const showBelow = bottomSpace >= topSpace
  const availableHeight = showOnSide
    ? Math.min(preferredHeight, window.innerHeight - viewportPadding * 2)
    : Math.max(120, Math.min(preferredHeight, showBelow ? bottomSpace : topSpace))
  const popoverHeight = Math.min(availableHeight, summaryPopover.value?.offsetHeight ?? availableHeight)
  const left = showOnSide
    ? rightSpace >= width ? targetRect.right + gap : targetRect.left - width - gap
    : Math.min(Math.max(viewportPadding, targetRect.left), window.innerWidth - width - viewportPadding)
  const top = showOnSide
    ? Math.min(Math.max(viewportPadding, targetRect.top), window.innerHeight - popoverHeight - viewportPadding)
    : showBelow ? targetRect.bottom + gap : Math.max(viewportPadding, targetRect.top - gap - popoverHeight)

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
const closeSummary = () => {
  summaryOpen.value = false
  summaryHover.value = false
  hideSummary()
}
const onOutsidePointerDown = (event: PointerEvent) => {
  const target = event.target
  if (!(target instanceof Node) || summaryTarget.value?.contains(target) || summaryPopover.value?.contains(target)) return
  closeSummary()
}
const onSummaryKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') closeSummary()
}
watch(summaryOpen, (open) => {
  if (open) {
    document.addEventListener('pointerdown', onOutsidePointerDown)
    document.addEventListener('keydown', onSummaryKeydown)
  } else {
    document.removeEventListener('pointerdown', onOutsidePointerDown)
    document.removeEventListener('keydown', onSummaryKeydown)
  }
})
watch([summaryVisible, summaryHtml], ([visible]) => {
  if (visible) positionSummary()
}, { flush: 'post' })
onBeforeUnmount(() => {
  window.clearTimeout(hideTimer)
  window.removeEventListener('resize', positionSummary)
  window.removeEventListener('scroll', positionSummary, true)
  document.removeEventListener('pointerdown', onOutsidePointerDown)
  document.removeEventListener('keydown', onSummaryKeydown)
})
</script>

<template>
  <div v-if="root" class="tree-diagram" :class="{ 'is-compact': compact }" role="tree">
    <button class="tree-root" :class="{ collapsed: !expanded }" type="button" :title="node.label" :aria-label="node.label" :aria-expanded="expanded" @click="expanded = !expanded"><span class="tree-node-label">{{ rootLabel }}</span></button>
    <ul v-if="expanded && node.children.length" class="tree-children tree-root-children">
      <TreeDiagram v-for="(child, index) in node.children" :key="`${child.label}-${index}`" :node="child" :depth="branchDepth + 1" :compact="compact" @open-link="emit('open-link', $event)" />
    </ul>
  </div>
  <li v-else class="tree-item" role="treeitem">
    <div v-if="node.children.length" class="tree-node-row">
      <details :open="!compact && branchDepth <= 1">
        <summary><span class="tree-node-label">{{ nodeLabel }}</span></summary>
        <ul class="tree-children">
          <TreeDiagram v-for="(child, index) in node.children" :key="`${child.label}-${index}`" :node="child" :depth="branchDepth + 1" :compact="compact" @open-link="emit('open-link', $event)" />
        </ul>
      </details>
      <a v-if="node.href" class="tree-timestamp-link" :href="node.href" target="_blank" rel="noreferrer" :aria-label="nodeLinkLabel(node.label)" :title="node.href" @click="openNodeLink">{{ linkText }}</a>
    </div>
    <div v-else class="tree-leaf-row">
      <span class="tree-leaf" :class="{ 'tree-summary-leaf': isSummaryLeaf(node.label), 'is-summary-open': summaryOpen }" :title="isSummaryLeaf(node.label) ? '悬浮查看完整内容，点击固定' : node.label" :tabindex="isSummaryLeaf(node.label) ? 0 : undefined" :role="isSummaryLeaf(node.label) ? 'button' : undefined" :aria-expanded="isSummaryLeaf(node.label) ? summaryVisible : undefined" @mouseenter="showSummary" @mouseleave="scheduleHideSummary" @focus="showSummary" @blur="scheduleHideSummary" @click="toggleSummary" @keydown.enter.prevent="toggleSummary" @keydown.space.prevent="toggleSummary" @keydown.esc="summaryOpen = false; hideSummary()">
        <template v-if="isSummaryLeaf(node.label)">
          <span class="tree-leaf-kicker">{{ summaryKind(node.label) }}</span>
          <span class="tree-leaf-text">{{ summaryText(nodeLabel) }}</span>
        </template>
        <template v-else>{{ nodeLabel }}</template>
      </span>
      <a v-if="node.href" class="tree-timestamp-link" :href="node.href" target="_blank" rel="noreferrer" :aria-label="nodeLinkLabel(node.label)" :title="node.href" @click="openNodeLink">{{ linkText }}</a>
    </div>
    <Teleport to="body">
      <div v-if="isSummaryLeaf(node.label) && summaryVisible" ref="summaryPopover" class="tree-summary-popover" role="tooltip" :style="summaryPopoverStyle" @mouseenter="cancelHideSummary" @mouseleave="scheduleHideSummary">
        <div class="tree-summary-popover-heading">完整内容</div>
        <div v-if="summaryHtml" class="tree-summary-markdown" v-html="summaryHtml" />
        <div v-else class="tree-summary-markdown tree-summary-loading">正在整理格式…</div>
      </div>
    </Teleport>
  </li>
</template>

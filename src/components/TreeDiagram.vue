<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { AsciiTreeNode } from '../asciiDiagram'
import type { MarkdownUrlResolver } from '../markdown/shared'
import AppIcon from './AppIcon.vue'
import MarkdownContent from './MarkdownContent.vue'

type BranchExpansion = { open: boolean }
const props = defineProps<{ node: AsciiTreeNode; root?: boolean; depth?: number; compact?: boolean; directory?: boolean; horizontal?: boolean; resolveUrl?: MarkdownUrlResolver; expandRequest?: BranchExpansion }>()
const emit = defineEmits<{ 'open-link': [url: string]; 'open-image': [image: HTMLImageElement] }>()
const branchDepth = props.depth ?? 0
const expanded = ref(props.expandRequest?.open ?? Boolean(props.root || (!props.horizontal && !props.compact && branchDepth <= 1)))
const expandRequest = ref(props.expandRequest)
const branchDetails = ref<HTMLDetailsElement | null>(null)
const canExpandAll = computed(() => !props.directory && (props.horizontal || props.compact)
  && props.node.children.some(child => child.children.length > 0))
const bulkOpen = computed(() => expandRequest.value?.open === true)
const bulkAction = computed(() => bulkOpen.value ? '收起全部子节点' : '展开全部子节点')
function applyExpandRequest(request: BranchExpansion) {
  expanded.value = request.open
  expandRequest.value = request
  if (branchDetails.value) branchDetails.value.open = request.open
}
watch(() => props.expandRequest, request => {
  if (request) applyExpandRequest(request)
})
const horizontalChildren = ref<HTMLElement | null>(null)
const summaryOpen = ref(false)
const summaryHover = ref(false)
const summaryTarget = ref<HTMLElement | null>(null)
const summaryPopover = ref<HTMLElement | null>(null)
const summaryPopoverStyle = ref<Record<string, string>>({})
let hideTimer: number | undefined
const isSummaryLeaf = (label: string) => !props.directory && (label.startsWith('内容：') || label.startsWith('导读：'))
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
  if (props.directory) return props.node.label
  const name = props.node.label.replace(/\.(?:md|markdown)$/i, '').trim()
  return name || props.node.label
})
const toggleBranch = () => {
  expanded.value = !expanded.value
  if (!expanded.value) expandRequest.value = undefined
  else if (props.horizontal && !props.root) void revealHorizontalChildren()
}
const toggleAll = () => {
  const open = !bulkOpen.value
  applyExpandRequest({ open })
  if (open && props.horizontal && !props.root) void revealHorizontalChildren()
}
const resetBulkOnNativeClose = () => {
  if (branchDetails.value && !branchDetails.value.open && bulkOpen.value) expandRequest.value = undefined
}
const revealHorizontalChildren = async () => {
  await nextTick()
  const children = horizontalChildren.value
  const canvas = children?.closest<HTMLElement>('.reader-mindmap-scroll')
  const firstNode = children?.querySelector(':scope > li > :is(.tree-node-row, .tree-leaf-row)')
  if (!canvas || !firstNode) return

  const bounds = canvas.getBoundingClientRect()
  const nodeBounds = firstNode.getBoundingClientRect()
  const offset = Math.min(nodeBounds.left - bounds.left, nodeBounds.right - bounds.right + 8)
  if (offset > 8) canvas.scrollLeft += offset
}
const openNodeLink = (event: MouseEvent) => {
  event.preventDefault()
  event.stopPropagation()
  if (props.node.href) emit('open-link', props.node.href)
}
const toggleSummary = (event: MouseEvent | KeyboardEvent) => {
  if (!isSummaryLeaf(props.node.label)) return
  if (summaryOpen.value) {
    closeSummary()
    return
  }
  showSummary(event)
  summaryOpen.value = true
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
const showSummary = (event: Event) => {
  const target = event.currentTarget
  if (!(target instanceof HTMLElement) || !isSummaryLeaf(props.node.label)) return

  window.clearTimeout(hideTimer)
  summaryTarget.value = target
  summaryHover.value = true
  positionSummary()
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
const openSummaryImage = (image: HTMLImageElement) => {
  closeSummary()
  emit('open-image', image)
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
watch(summaryVisible, (visible) => {
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
  <div v-if="root" class="tree-diagram" :class="{ 'is-compact': compact, 'is-directory': directory, 'is-horizontal': horizontal }">
    <div class="tree-root-row" :class="{ 'has-expand-all': canExpandAll }">
      <button class="tree-root" :class="{ collapsed: !expanded }" type="button" :title="node.label" :aria-label="node.label" :aria-expanded="expanded" @click="toggleBranch">
        <AppIcon v-if="directory" name="chevron-right" :size="14" />
        <AppIcon v-if="directory" name="folder" :size="16" />
        <span class="tree-node-label">{{ rootLabel }}</span>
      </button>
      <button v-if="canExpandAll" class="tree-expand-all" :class="{ 'is-expanded': bulkOpen }" type="button" :title="bulkAction" :aria-label="`${bulkAction}：${rootLabel}`" @click="toggleAll"><AppIcon name="chevrons-right" :size="16" /></button>
    </div>
    <ul v-if="node.children.length && (directory || expanded)" v-show="expanded" class="tree-children tree-root-children" role="list">
      <TreeDiagram v-for="(child, index) in node.children" :key="`${child.label}-${index}`" :node="child" :depth="branchDepth + 1" :compact="compact" :directory="directory" :horizontal="horizontal" :resolve-url="resolveUrl" :expand-request="expandRequest" @open-link="emit('open-link', $event)" @open-image="emit('open-image', $event)" />
    </ul>
  </div>
  <li v-else class="tree-item">
    <div v-if="node.children.length" class="tree-node-row">
      <button v-if="horizontal" class="tree-branch-toggle" type="button" :aria-expanded="expanded" @click="toggleBranch">
        <span class="tree-node-label">{{ nodeLabel }}</span>
        <span class="tree-branch-indicator" aria-hidden="true">{{ expanded ? '−' : '+' }}</span>
      </button>
      <details v-else ref="branchDetails" :open="expanded" @toggle="resetBulkOnNativeClose">
        <summary>
          <AppIcon v-if="directory" name="chevron-right" :size="14" />
          <AppIcon v-if="directory" name="folder" :size="16" />
          <span class="tree-node-label">{{ nodeLabel }}</span>
        </summary>
        <ul class="tree-children" role="list">
          <TreeDiagram v-for="(child, index) in node.children" :key="`${child.label}-${index}`" :node="child" :depth="branchDepth + 1" :compact="compact" :directory="directory" :resolve-url="resolveUrl" :expand-request="expandRequest" @open-link="emit('open-link', $event)" @open-image="emit('open-image', $event)" />
        </ul>
      </details>
      <button v-if="canExpandAll" class="tree-expand-all" :class="{ 'is-expanded': bulkOpen }" type="button" :title="bulkAction" :aria-label="`${bulkAction}：${nodeLabel}`" @click="toggleAll"><AppIcon name="chevrons-right" :size="16" /></button>
      <a v-if="node.href" class="tree-timestamp-link" :href="node.href" target="_blank" rel="noreferrer" :aria-label="nodeLinkLabel(node.label)" :title="node.href" @click="openNodeLink">{{ linkText }}</a>
    </div>
    <div v-else class="tree-leaf-row">
      <span class="tree-leaf" :class="{ 'tree-summary-leaf': isSummaryLeaf(node.label), 'is-summary-open': summaryOpen }" :title="isSummaryLeaf(node.label) ? '悬浮查看完整内容，点击固定' : node.label" :tabindex="isSummaryLeaf(node.label) ? 0 : undefined" :role="isSummaryLeaf(node.label) ? 'button' : undefined" :aria-expanded="isSummaryLeaf(node.label) ? summaryVisible : undefined" @mouseenter="showSummary" @mouseleave="scheduleHideSummary" @focus="showSummary" @blur="scheduleHideSummary" @click="toggleSummary" @keydown.enter.prevent="toggleSummary" @keydown.space.prevent="toggleSummary" @keydown.esc="summaryOpen = false; hideSummary()">
        <template v-if="isSummaryLeaf(node.label)">
          <span class="tree-leaf-kicker">{{ summaryKind(node.label) }}</span>
          <span class="tree-leaf-text">{{ summaryText(nodeLabel) }}</span>
        </template>
        <template v-else-if="directory">
          <AppIcon name="file" :size="16" />
          <span class="tree-node-label">{{ nodeLabel }}</span>
        </template>
        <template v-else>{{ nodeLabel }}</template>
      </span>
      <a v-if="node.href" class="tree-timestamp-link" :href="node.href" target="_blank" rel="noreferrer" :aria-label="nodeLinkLabel(node.label)" :title="node.href" @click="openNodeLink">{{ linkText }}</a>
    </div>
    <ul v-if="horizontal && expanded && node.children.length" ref="horizontalChildren" class="tree-children tree-horizontal-children" role="list">
      <TreeDiagram v-for="(child, index) in node.children" :key="`${child.label}-${index}`" :node="child" horizontal :resolve-url="resolveUrl" :expand-request="expandRequest" @open-link="emit('open-link', $event)" @open-image="emit('open-image', $event)" />
    </ul>
    <Teleport to="body">
      <div v-if="isSummaryLeaf(node.label) && summaryVisible" ref="summaryPopover" class="tree-summary-popover" role="group" aria-label="完整内容" :style="summaryPopoverStyle" @mouseenter="cancelHideSummary" @mouseleave="scheduleHideSummary" @focusin="cancelHideSummary">
        <div class="tree-summary-popover-heading">完整内容</div>
        <MarkdownContent class="tree-summary-markdown" :source="node.detail || summaryText(node.label)" :resolve-url="resolveUrl" preview-images @open-image="openSummaryImage" @load.capture="positionSummary" />
      </div>
    </Teleport>
  </li>
</template>

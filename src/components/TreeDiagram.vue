<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from 'vue'
import type { AsciiTreeNode } from '../asciiDiagram'
import type { MarkdownUrlResolver } from '../markdown/shared'
import { writeTextToClipboard } from '../nativeClipboard'
import AppIcon from './AppIcon.vue'
import MarkdownContent from './MarkdownContent.vue'

type BranchExpansion = { open: boolean }
type MindmapNavigation = { selected: string; focused: string; reveal?: { path: string; openTarget?: boolean } }
const props = defineProps<{ node: AsciiTreeNode; root?: boolean; depth?: number; compact?: boolean; directory?: boolean; horizontal?: boolean; resolveUrl?: MarkdownUrlResolver; expandRequest?: BranchExpansion; nodePath?: string; navigation?: MindmapNavigation; copyText?: string }>()
const emit = defineEmits<{ 'open-link': [url: string]; 'open-image': [image: HTMLImageElement]; 'select-node': [path: string] }>()
const branchDepth = props.depth ?? 0
const expanded = ref(props.expandRequest?.open ?? Boolean(props.root || (!props.horizontal && !props.compact && branchDepth <= 1)))
const expandRequest = ref(props.expandRequest)
const branchDetails = ref<HTMLDetailsElement | null>(null)
const selected = computed(() => Boolean(props.nodePath && props.navigation?.selected === props.nodePath))
const outsideFocus = computed(() => {
  const path = props.nodePath
  const focused = props.navigation?.focused
  if (!path || !focused || path === focused || focused.startsWith(path + '.') || path.startsWith(focused + '.')) return false
  const parentPath = path.slice(0, path.lastIndexOf('.'))
  return focused.startsWith(parentPath + '.')
})
const childPath = (index: number) => props.nodePath ? `${props.nodePath}.${index}` : undefined
const selectNode = () => { if (props.nodePath) emit('select-node', props.nodePath) }
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
watch(() => props.navigation?.reveal, request => {
  if (!props.nodePath || !request) return
  if (!request.path.startsWith(props.nodePath + '.') && !(request.openTarget && request.path === props.nodePath)) return
  expanded.value = true
  if (branchDetails.value) branchDetails.value.open = true
}, { immediate: true })
const horizontalChildren = ref<HTMLElement | null>(null)
const summaryOpen = ref(false)
const summaryId = useId()
const summaryTarget = ref<HTMLButtonElement | null>(null)
const summaryPopover = ref<HTMLElement | null>(null)
const summaryPopoverStyle = ref<Record<string, string>>({})
const isSummaryLeaf = computed(() => !props.directory && /^(?:内容|导读)：/.test(props.node.label))
const summaryText = (label: string) => label.replace(/^(?:内容|导读)：/, '')
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
const copyStatus = ref('')
watch(() => props.copyText, () => { copyStatus.value = '' })
async function copyDirectoryTree() {
  const text = props.copyText
  if (!text) return
  copyStatus.value = ''
  try {
    await writeTextToClipboard(text)
    if (text === props.copyText) copyStatus.value = '已复制'
  } catch {
    if (text === props.copyText) copyStatus.value = '复制失败'
  }
}
const toggleBranch = (event: MouseEvent) => {
  selectNode()
  const restorePosition = captureNodePosition(event)
  expanded.value = !expanded.value
  if (!expanded.value) expandRequest.value = undefined
  restorePosition?.()
}
const toggleAll = (event: MouseEvent) => {
  const restorePosition = captureNodePosition(event)
  const open = !bulkOpen.value
  applyExpandRequest({ open })
  restorePosition?.()
}
const resetBulkOnNativeClose = () => {
  if (branchDetails.value && !branchDetails.value.open && bulkOpen.value) expandRequest.value = undefined
}
const captureNodePosition = (event: MouseEvent) => {
  const button = event.currentTarget
  if (!props.horizontal || !(button instanceof HTMLElement)) return
  const canvas = button.closest<HTMLElement>('.reader-mindmap-scroll')
  if (!canvas) return
  const viewport = canvas.closest<HTMLElement>('.reader-viewport')
  const top = button.getBoundingClientRect().top
  return () => nextTick(() => {
    const shift = button.getBoundingClientRect().top - top
    if (viewport && Math.abs(shift) >= 1) viewport.scrollBy({ top: shift, behavior: 'instant' })

    const firstNode = horizontalChildren.value?.querySelector(':scope > li > :is(.tree-node-row, .tree-leaf-row)')
    if (!firstNode) return
    const bounds = canvas.getBoundingClientRect()
    const nodeBounds = firstNode.getBoundingClientRect()
    const offset = Math.min(nodeBounds.left - bounds.left, nodeBounds.right - bounds.right + 8)
    if (offset > 8) canvas.scrollLeft += offset
  })
}
const openNodeLink = (event: MouseEvent) => {
  event.preventDefault()
  event.stopPropagation()
  if (props.node.href) emit('open-link', props.node.href)
}
const toggleSummary = () => {
  selectNode()
  summaryOpen.value = !summaryOpen.value
}
const positionSummary = (event?: Event) => {
  const target = summaryTarget.value
  const panel = summaryPopover.value
  if (!target || !panel || (event?.type === 'scroll' && event.target instanceof Node && panel.contains(event.target))) return

  const targetRect = target.getBoundingClientRect()
  const gap = 10
  const viewportPadding = 16
  const preferredHeight = Math.max(0, Math.min(640, window.innerHeight * 0.72, window.innerHeight - viewportPadding * 2))
  const topSpace = targetRect.top - gap - viewportPadding
  const bottomSpace = window.innerHeight - targetRect.bottom - gap - viewportPadding
  const rightSpace = window.innerWidth - targetRect.right - gap - viewportPadding
  const leftSpace = targetRect.left - gap - viewportPadding
  const sideSpace = Math.max(leftSpace, rightSpace)
  const showOnSide = sideSpace >= 400
  const width = Math.min(560, showOnSide ? sideSpace : window.innerWidth - viewportPadding * 2)
  const showBelow = bottomSpace >= topSpace
  const verticalSpace = Math.max(topSpace, bottomSpace)
  const availableHeight = showOnSide || verticalSpace < 180 ? preferredHeight : Math.min(preferredHeight, verticalSpace)
  const popoverHeight = Math.min(availableHeight, panel.offsetHeight)
  const left = showOnSide
    ? rightSpace >= width ? targetRect.right + gap : targetRect.left - width - gap
    : Math.min(Math.max(viewportPadding, targetRect.left), window.innerWidth - width - viewportPadding)
  const top = showOnSide ? targetRect.top : showBelow ? targetRect.bottom + gap : targetRect.top - gap - popoverHeight

  summaryPopoverStyle.value = {
    '--summary-left': `${left}px`,
    '--summary-top': `${Math.max(viewportPadding, Math.min(top, window.innerHeight - popoverHeight - viewportPadding))}px`,
    '--summary-width': `${width}px`,
    '--summary-max-height': `${availableHeight}px`,
  }
}
const closeSummary = () => {
  summaryOpen.value = false
  summaryTarget.value?.focus({ preventScroll: true })
}
const openSummaryImage = (image: HTMLImageElement) => {
  closeSummary()
  emit('open-image', image)
}
const dismissSummaryFromOutside = (target: EventTarget | null) => {
  if (!(target instanceof Node) || summaryTarget.value?.contains(target) || summaryPopover.value?.contains(target)) return
  summaryOpen.value = false
}
const onOutsidePointerDown = (event: PointerEvent) => dismissSummaryFromOutside(event.target)
const onSummaryFocusout = (event: FocusEvent) => dismissSummaryFromOutside(event.relatedTarget)
const onSummaryKeydown = (event: KeyboardEvent) => {
  if (!summaryOpen.value) return
  event.preventDefault()
  event.stopPropagation()
  closeSummary()
}
watch(summaryOpen, (open, _, onCleanup) => {
  const panel = summaryPopover.value
  if (!open || !panel) return
  positionSummary()
  panel.focus({ preventScroll: true })
  const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(() => positionSummary())
  observer?.observe(panel)
  document.addEventListener('pointerdown', onOutsidePointerDown, true)
  window.addEventListener('resize', positionSummary)
  window.addEventListener('scroll', positionSummary, true)
  onCleanup(() => {
    observer?.disconnect()
    document.removeEventListener('pointerdown', onOutsidePointerDown, true)
    window.removeEventListener('resize', positionSummary)
    window.removeEventListener('scroll', positionSummary, true)
  })
}, { flush: 'post' })
</script>

<template>
  <div v-if="root" class="tree-diagram" :class="{ 'is-compact': compact, 'is-directory': directory, 'is-horizontal': horizontal }">
    <div class="tree-root-row" :class="{ 'has-expand-all': canExpandAll, 'has-copy': copyText }">
      <button class="tree-root" :class="{ collapsed: !expanded, 'is-mindmap-selected': selected }" type="button" :data-mindmap-node="nodePath" :title="node.label" :aria-label="node.label" :aria-expanded="expanded" @click="toggleBranch">
        <AppIcon v-if="directory" name="chevron-right" :size="14" />
        <AppIcon v-if="directory" name="folder" :size="16" />
        <span class="tree-node-label">{{ rootLabel }}</span>
      </button>
      <button v-if="canExpandAll" class="tree-expand-all" :class="{ 'is-expanded': bulkOpen }" type="button" :title="bulkAction" :aria-label="`${bulkAction}：${rootLabel}`" @click="toggleAll"><AppIcon name="chevrons-right" :size="16" /></button>
      <button v-if="copyText" class="code-copy tree-copy" type="button" :title="`复制目录树：${rootLabel}`" @click.stop="copyDirectoryTree">
        <AppIcon :name="copyStatus === '已复制' ? 'check' : 'copy'" :size="14" />
        <span aria-live="polite">{{ copyStatus || '复制目录树' }}</span>
      </button>
    </div>
    <ul v-if="node.children.length && (directory || expanded)" v-show="expanded" class="tree-children tree-root-children" role="list">
      <TreeDiagram v-for="(child, index) in node.children" :key="`${child.label}-${index}`" :node="child" :depth="branchDepth + 1" :compact="compact" :directory="directory" :horizontal="horizontal" :resolve-url="resolveUrl" :expand-request="expandRequest" :node-path="childPath(index)" :navigation="navigation" @select-node="emit('select-node', $event)" @open-link="emit('open-link', $event)" @open-image="emit('open-image', $event)" />
    </ul>
  </div>
  <li v-else class="tree-item" :class="{ 'is-mindmap-dimmed': outsideFocus }">
    <div v-if="node.children.length" class="tree-node-row">
      <button v-if="horizontal" class="tree-branch-toggle" :class="{ 'is-mindmap-selected': selected }" type="button" :data-mindmap-node="nodePath" :title="expanded ? '收起当前层' : '展开一层'" :aria-expanded="expanded" @click="toggleBranch">
        <span class="tree-node-label">{{ nodeLabel }}</span>
        <span class="tree-branch-indicator" aria-hidden="true">{{ expanded ? '−' : '+' }}</span>
      </button>
      <details v-else ref="branchDetails" :open="expanded" @toggle="resetBulkOnNativeClose">
        <summary :class="{ 'is-mindmap-selected': selected }" :data-mindmap-node="nodePath" @click="selectNode">
          <AppIcon v-if="directory" name="chevron-right" :size="14" />
          <AppIcon v-if="directory" name="folder" :size="16" />
          <span class="tree-node-label">{{ nodeLabel }}</span>
        </summary>
        <ul class="tree-children" role="list">
          <TreeDiagram v-for="(child, index) in node.children" :key="`${child.label}-${index}`" :node="child" :depth="branchDepth + 1" :compact="compact" :directory="directory" :resolve-url="resolveUrl" :expand-request="expandRequest" :node-path="childPath(index)" :navigation="navigation" @select-node="emit('select-node', $event)" @open-link="emit('open-link', $event)" @open-image="emit('open-image', $event)" />
        </ul>
      </details>
      <button v-if="canExpandAll" class="tree-expand-all" :class="{ 'is-expanded': bulkOpen }" type="button" :title="bulkAction" :aria-label="`${bulkAction}：${nodeLabel}`" @click="toggleAll"><AppIcon name="chevrons-right" :size="16" /></button>
      <a v-if="node.href" class="tree-timestamp-link" :href="node.href" target="_blank" rel="noreferrer" :aria-label="nodeLinkLabel(node.label)" :title="node.href" @click="openNodeLink">{{ linkText }}</a>
    </div>
    <div v-else class="tree-leaf-row">
      <button v-if="isSummaryLeaf" ref="summaryTarget" type="button" class="tree-leaf tree-summary-leaf" :class="{ 'is-summary-open': summaryOpen, 'is-mindmap-selected': selected }" :data-mindmap-node="nodePath" :aria-expanded="summaryOpen" :aria-controls="summaryOpen ? summaryId : undefined" @click="toggleSummary" @keydown.esc="onSummaryKeydown">
        <span class="tree-leaf-text">{{ summaryText(nodeLabel) }}</span>
        <span class="tree-leaf-more">{{ summaryOpen ? '收起全文' : '查看全文' }}<AppIcon name="chevron-right" :size="11" /></span>
      </button>
      <span v-else class="tree-leaf" :class="{ 'is-mindmap-selected': selected }" :data-mindmap-node="nodePath" :title="node.label" :tabindex="nodePath ? 0 : undefined" :role="nodePath ? 'button' : undefined" @click="selectNode" @keydown.enter.prevent="selectNode" @keydown.space.prevent="selectNode">
        <template v-if="directory">
          <AppIcon name="file" :size="16" />
          <span class="tree-node-label">{{ nodeLabel }}</span>
        </template>
        <template v-else>{{ nodeLabel }}</template>
      </span>
      <a v-if="node.href" class="tree-timestamp-link" :href="node.href" target="_blank" rel="noreferrer" :aria-label="nodeLinkLabel(node.label)" :title="node.href" @click="openNodeLink">{{ linkText }}</a>
    </div>
    <ul v-if="horizontal && expanded && node.children.length" ref="horizontalChildren" class="tree-children tree-horizontal-children" role="list">
      <TreeDiagram v-for="(child, index) in node.children" :key="`${child.label}-${index}`" :node="child" horizontal :resolve-url="resolveUrl" :expand-request="expandRequest" :node-path="childPath(index)" :navigation="navigation" @select-node="emit('select-node', $event)" @open-link="emit('open-link', $event)" @open-image="emit('open-image', $event)" />
    </ul>
    <Teleport to="body">
      <div v-if="isSummaryLeaf && summaryOpen" :id="summaryId" ref="summaryPopover" class="tree-summary-popover" role="dialog" aria-label="完整内容" tabindex="-1" :style="summaryPopoverStyle" @keydown.esc="onSummaryKeydown" @focusout="onSummaryFocusout">
        <header class="tree-summary-popover-heading">
          <span>完整内容</span>
          <button type="button" class="tree-summary-close" aria-label="关闭全文" @click="closeSummary"><AppIcon name="close" :size="15" /></button>
        </header>
        <div class="tree-summary-scroll" tabindex="0" role="region" aria-label="正文">
          <MarkdownContent class="tree-summary-markdown" :source="node.detail || summaryText(node.label)" :resolve-url="resolveUrl" preview-images @open-image="openSummaryImage" />
        </div>
      </div>
    </Teleport>
  </li>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'

export interface FileSystemTreeNode {
  path: string
  name: string
  isDirectory: boolean
  documentId?: string
  expanded: boolean
  loading: boolean
  children: FileSystemTreeNode[] | null
  error?: string
}

const props = withDefaults(defineProps<{
  node: FileSystemTreeNode
  depth?: number
  selectedPath?: string
}>(), {
  depth: 0,
  selectedPath: '',
})
const emit = defineEmits<{
  toggle: [node: FileSystemTreeNode]
  open: [node: FileSystemTreeNode]
}>()
const selectedRow = ref<HTMLButtonElement | null>(null)

function pathKey(path: string) {
  return path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

function selectNode() {
  if (props.node.isDirectory) emit('toggle', props.node)
  else emit('open', props.node)
}

function onKeydown(event: KeyboardEvent) {
  const rows = [...document.querySelectorAll<HTMLButtonElement>('.filesystem-tree-row')]
  const current = event.currentTarget as HTMLButtonElement
  const index = rows.indexOf(current)
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    rows[index + (event.key === 'ArrowDown' ? 1 : -1)]?.focus()
    return
  }
  if (event.key === 'ArrowRight' && props.node.isDirectory && !props.node.expanded) {
    event.preventDefault()
    emit('toggle', props.node)
    return
  }
  if (event.key === 'ArrowLeft' && props.node.isDirectory && props.node.expanded) {
    event.preventDefault()
    emit('toggle', props.node)
  }
}

function revealSelectedRow() {
  if (pathKey(props.node.path) !== pathKey(props.selectedPath)) return
  void nextTick(() => selectedRow.value?.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'nearest' }))
}

onMounted(revealSelectedRow)
watch(() => props.selectedPath, revealSelectedRow)
watch(() => props.node.expanded, revealSelectedRow)
</script>

<template>
  <div class="filesystem-tree-node">
    <button
      type="button"
      class="filesystem-tree-row"
      ref="selectedRow"
      :class="{ directory: node.isDirectory, expanded: node.expanded, selected: pathKey(node.path) === pathKey(selectedPath) }"
      :style="{ paddingLeft: `${8 + depth * 15}px` }"
      :aria-expanded="node.isDirectory ? node.expanded : undefined"
      :aria-label="node.isDirectory ? `${node.expanded ? '收起' : '展开'} ${node.name}` : `打开 ${node.name}`"
      @click="selectNode"
      @keydown="onKeydown"
    >
      <span class="filesystem-tree-chevron"><AppIcon v-if="node.isDirectory" :name="node.expanded ? 'chevron-down' : 'chevron-right'" :size="11" /><i v-else /></span>
      <AppIcon :name="node.isDirectory ? 'library' : 'file'" :size="13" />
      <span class="filesystem-tree-name">{{ node.name }}</span>
      <span v-if="node.loading" class="filesystem-tree-loading">读取中</span>
    </button>
    <div v-if="node.expanded && node.error" class="filesystem-tree-error" :style="{ paddingLeft: `${38 + depth * 15}px` }">{{ node.error }}</div>
    <div v-if="node.expanded && node.children?.length" class="filesystem-tree-children">
      <FileSystemTree v-for="child in node.children" :key="child.path" :node="child" :depth="depth + 1" :selected-path="selectedPath" @toggle="emit('toggle', $event)" @open="emit('open', $event)" />
    </div>
    <div v-else-if="node.expanded && !node.loading && !node.error" class="filesystem-tree-empty" :style="{ paddingLeft: `${38 + depth * 15}px` }">空目录</div>
  </div>
</template>

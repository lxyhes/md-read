<script setup lang="ts">
import { computed, ref } from 'vue'
import type { AsciiTreeNode } from '../asciiDiagram'
import type { DirectoryTreeLocation } from '../parser'
import AppDropdown from './AppDropdown.vue'
import AppIcon from './AppIcon.vue'

const props = defineProps<{ tree: DirectoryTreeLocation; line: number }>()
const emit = defineEmits<{ jump: [line: number]; open: [] }>()
const dropdown = ref<InstanceType<typeof AppDropdown> | null>(null)
const query = ref('')
const collapsed = ref(new Set<number>())
const needle = computed(() => query.value.trim().toLowerCase().replace(/\s*\/\s*/g, '/'))

const rows = computed(() => {
  const { root, bodyLine, sourceLines } = props.tree
  const result: { line: number; label: string; depth: number; path: string; branch: boolean }[] = []
  function visit(node: AsciiTreeNode, depth: number, parent: string) {
    const index = sourceLines.get(node)
    const line = index === undefined ? undefined : bodyLine + index
    const path = line === undefined ? parent : parent ? `${parent}/${node.label}` : node.label
    if (line !== undefined && (!needle.value || path.toLowerCase().includes(needle.value))) {
      result.push({ line, label: node.label, depth, path, branch: node.children.length > 0 })
    }
    if (needle.value || line === undefined || !collapsed.value.has(line)) {
      for (const child of node.children) visit(child, depth + Number(line !== undefined), path)
    }
  }
  visit(root, 0, '')
  return result
})

function onVisibility(open: boolean) {
  if (open) emit('open')
  else query.value = ''
}

function toggle(line: number) {
  if (collapsed.value.has(line)) collapsed.value.delete(line)
  else collapsed.value.add(line)
}

function jump(line: number | undefined) {
  if (line === undefined) return
  dropdown.value?.close()
  emit('jump', line)
}
</script>

<template>
  <div>
    <AppDropdown ref="dropdown" position="br" panel-class="editor-directory-popover" focus-on-open initial-focus="input" @visible-change="onVisibility">
      <template #default="{ open }">
        <button class="directory-trigger" type="button" :aria-expanded="open" :title="`定位节点：${tree.root.label}`">
          <AppIcon name="folder" :size="14" />定位节点
        </button>
      </template>
      <template #menu>
        <form class="directory-panel" role="search" aria-label="当前目录树" @submit.prevent="jump(rows[0]?.line)">
          <input v-model="query" aria-label="搜索当前目录树" placeholder="搜索节点或路径…" />
          <div class="directory-results" role="group" aria-label="目录节点">
            <div v-for="row in rows" :key="row.line" class="directory-row" :style="{ paddingInlineStart: `${needle ? 0 : Math.min(row.depth, 12) * 10}px` }">
              <button v-if="!needle && row.branch" class="directory-toggle" type="button" data-submenu-trigger="true"
                :aria-expanded="!collapsed.has(row.line)" :aria-label="`${collapsed.has(row.line) ? '展开' : '折叠'} ${row.label}`" @click="toggle(row.line)">
                <AppIcon :name="collapsed.has(row.line) ? 'chevron-right' : 'chevron-down'" :size="13" />
              </button>
              <span v-else-if="!needle" class="directory-toggle-spacer" aria-hidden="true" />
              <button class="directory-result" type="button" :aria-current="line === row.line ? 'location' : undefined"
                :title="`${row.path} · 第 ${row.line} 行`" @click="jump(row.line)">
                <span>{{ needle ? row.path : row.label }}</span><small>{{ row.line }}</small>
              </button>
            </div>
            <p v-if="!rows.length" role="status">没有匹配的节点</p>
          </div>
        </form>
      </template>
    </AppDropdown>
  </div>
</template>

<style scoped>
.directory-trigger { display: flex; align-items: center; gap: 5px; padding: 4px 8px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface-raised); color: var(--ink); font: 12px/1.5 var(--ui-font); }
.directory-panel { box-sizing: border-box; width: min(300px, calc(100vw - 24px)); padding: 8px; border: 1px solid var(--border); border-radius: 9px; background: var(--surface-raised); color: var(--ink); box-shadow: 0 8px 24px rgb(0 0 0 / .14); font: 13px/1.5 var(--ui-font); }
.directory-panel input { box-sizing: border-box; width: 100%; padding: 6px 8px; border: 1px solid var(--border); border-radius: 5px; background: var(--surface); color: var(--ink); font: inherit; }
.directory-results { max-height: min(280px, 45vh); margin-top: 6px; overflow-y: auto; }
.directory-results p { margin: 6px 4px; color: var(--muted); }
.directory-row { display: flex; align-items: stretch; }
.directory-toggle, .directory-toggle-spacer { flex: 0 0 22px; }
.directory-toggle, .directory-result { color: inherit; background: transparent; border: 0; border-radius: 4px; }
.directory-toggle { display: grid; place-items: center; padding: 0; }
.directory-result { display: flex; flex: 1; align-items: baseline; justify-content: space-between; gap: 8px; min-width: 0; padding: 4px 6px; text-align: left; font: inherit; }
.directory-result span { overflow-wrap: anywhere; }
.directory-result small { color: var(--muted); }
.directory-trigger:hover, .directory-toggle:hover, .directory-result:hover, .directory-result[aria-current='location'] { background: var(--accent-soft); }
.directory-panel :focus-visible, .directory-trigger:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
</style>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

type Item = { label: string; action: () => void; shortcut?: string; disabled?: boolean }
defineProps<{ groups: { label: string; items: Item[] }[] }>()
const root = ref<HTMLElement | null>(null)
const open = ref<string | null>(null)
function outside(event: PointerEvent) { if (!root.value?.contains(event.target as Node)) open.value = null }
function navigate(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); open.value = null; (event.currentTarget as HTMLElement).querySelector<HTMLButtonElement>('.editor-menu-trigger')?.focus(); return }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
  const buttons = [...(event.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')]
  if (!buttons.length) return
  event.preventDefault()
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : event.key === 'ArrowDown' ? (index + 1) % buttons.length : (index <= 0 ? buttons.length - 1 : index - 1)
  buttons[next].focus()
}
function select(item: Item) { open.value = null; item.action() }
onMounted(() => document.addEventListener('pointerdown', outside))
onBeforeUnmount(() => document.removeEventListener('pointerdown', outside))
</script>

<template>
  <nav ref="root" class="editor-menu-bar" aria-label="编辑菜单">
    <div v-for="group in groups" :key="group.label" class="editor-menu-group" @keydown="navigate">
      <button class="editor-menu-trigger" type="button" :aria-expanded="open === group.label" aria-haspopup="menu" @click="open = open === group.label ? null : group.label">{{ group.label }}</button>
      <div v-if="open === group.label" class="editor-menu-popover" role="menu" :aria-label="group.label">
        <button v-for="item in group.items" :key="item.label" role="menuitem" type="button" :disabled="item.disabled" @click="select(item)"><span>{{ item.label }}</span><kbd v-if="item.shortcut">{{ item.shortcut }}</kbd></button>
      </div>
    </div>
    <div class="editor-menu-actions"><slot /></div>
  </nav>
</template>

<style scoped>
.editor-menu-bar { position: relative; z-index: 50; display: flex; flex: none; flex-wrap: wrap; gap: 2px; padding-inline: 12px; border-bottom: 1px solid var(--border); background: var(--surface); }
.editor-menu-group { position: relative; }
.editor-menu-actions { display: flex; align-items: center; gap: 10px; margin-left: auto; padding-inline: 8px; color: var(--muted); font: 12px var(--ui-font); }
.editor-menu-trigger { padding: 7px 12px; border-radius: 5px; background: transparent; color: var(--ink); font: 13px var(--ui-font); }
.editor-menu-trigger:hover, .editor-menu-trigger[aria-expanded='true'] { background: var(--accent-soft); }
.editor-menu-popover { position: absolute; z-index: 30; top: 100%; left: 0; min-width: 200px; max-height: min(65vh, 540px); overflow-y: auto; padding: 5px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface-raised); box-shadow: 0 10px 28px #0003; }
.editor-menu-popover button { display: flex; align-items: center; justify-content: space-between; gap: 24px; width: 100%; padding: 8px 10px; border-radius: 4px; background: transparent; color: var(--ink); font: 13px var(--ui-font); text-align: left; white-space: nowrap; }
.editor-menu-popover button:hover, .editor-menu-popover button:focus-visible { background: var(--accent-soft); }
.editor-menu-popover button:disabled { opacity: .4; }
.editor-menu-popover kbd { color: var(--muted); font: 11px var(--ui-font); }
</style>

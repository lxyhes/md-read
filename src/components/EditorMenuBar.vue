<script setup lang="ts">
import { nextTick, ref } from 'vue'
import ArcoDropdown from './ArcoDropdown.vue'

type Item = { label?: string; action?: () => void; shortcut?: string; disabled?: boolean; separator?: boolean; checkable?: boolean; checked?: boolean; children?: Item[] }
type Group = { label: string; items: Item[] }
const props = defineProps<{ groups: Group[] }>()
const root = ref<HTMLElement | null>(null)
const open = ref<string | null>(null)
const submenu = ref<{ key: string; group: string; label: string; items: Item[]; left: number; top: number; width: number; parent: HTMLButtonElement } | null>(null)
const dropdownRefs = ref<Record<string, { close: () => void }>>({})

function setDropdownRef(label: string, instance: unknown) {
  if (instance && typeof instance === 'object' && 'close' in instance) dropdownRefs.value[label] = instance as { close: () => void }
  else delete dropdownRefs.value[label]
}

function showSubmenu(group: string, item: Item, index: number, parent: HTMLButtonElement) {
  if (!item.children) { submenu.value = null; return }
  const rect = parent.getBoundingClientRect()
  const maxHeight = Math.min(window.innerHeight * .65, 540)
  const height = Math.min(maxHeight, item.children.length * 38 + 14)
  const width = Math.min(236, window.innerWidth - 16)
  const right = rect.right + 4
  const left = right + width <= window.innerWidth - 8 ? right : Math.max(8, window.innerWidth - width - 8)
  const top = Math.max(8, Math.min(rect.top - 5, window.innerHeight - height - 8))
  submenu.value = { key: `${group}:${index}`, group, label: item.label ?? group, items: item.children, left, top, width, parent }
}

function closeSubmenu() {
  const parent = submenu.value?.parent
  submenu.value = null
  parent?.focus()
}

function navigate(event: KeyboardEvent, group: string, nested = false) {
  const menu = event.currentTarget as HTMLElement
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    if (submenu.value?.group === group) {
      closeSubmenu()
      return
    }
    open.value = null
    menuTrigger(group)?.focus()
    return
  }
  if (event.key === 'ArrowRight' && !nested) {
    const parent = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-submenu-key]')
    const key = parent?.dataset.submenuKey
    if (key && parent) {
      if (submenu.value?.key !== key) {
        const index = Number(key.slice(key.lastIndexOf(':') + 1))
        const item = props.groups.find(candidate => candidate.label === group)?.items[index]
        if (item) showSubmenu(group, item, index, parent)
      }
      event.preventDefault()
      void nextTick(() => document.querySelector<HTMLElement>('.editor-menu-subpopover [role^="menuitem"]:not(:disabled)')?.focus())
      return
    }
  }
  if (event.key === 'ArrowLeft' && nested && submenu.value?.group === group) {
    event.preventDefault()
    closeSubmenu()
    return
  }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
  const buttons = [...menu.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)')]
  if (!buttons.length) return
  event.preventDefault()
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : event.key === 'ArrowDown' ? (index + 1) % buttons.length : (index <= 0 ? buttons.length - 1 : index - 1)
  buttons[next].focus()
}

function menuTrigger(group: string) {
  return [...(root.value?.querySelectorAll<HTMLButtonElement>('.editor-menu-trigger') ?? [])].find(button => button.dataset.menuTrigger === group)
}

function select(item: Item, group: string, nested = false) {
  item.action?.()
  if (nested) {
    submenu.value = null
    dropdownRefs.value[group]?.close()
  }
}
</script>

<template>
  <nav ref="root" class="editor-menu-bar" aria-label="编辑菜单">
    <div v-for="group in groups" :key="group.label" class="editor-menu-group">
      <ArcoDropdown :ref="instance => setDropdownRef(group.label, instance)" panel-class="editor-menu-popover" :popup-container="root || undefined" @visible-change="(next) => { open = next ? group.label : (open === group.label ? null : open); if (!next) submenu = null }">
        <button class="editor-menu-trigger" :data-menu-trigger="group.label" type="button" :aria-expanded="open === group.label" aria-haspopup="menu">{{ group.label }}</button>
        <template #menu>
          <div role="menu" :aria-label="group.label" @keydown="navigate($event, group.label)">
            <template v-for="(item, index) in group.items" :key="item.label ?? `separator-${index}`">
              <div v-if="item.separator" class="editor-menu-separator" role="separator" />
              <button v-else :data-submenu-key="item.children ? `${group.label}:${index}` : undefined" :data-submenu-trigger="item.children ? 'true' : undefined" :role="item.checkable ? 'menuitemcheckbox' : 'menuitem'" :aria-haspopup="item.children ? 'menu' : undefined" :aria-expanded="item.children ? submenu?.key === `${group.label}:${index}` : undefined" type="button" :aria-checked="item.checkable ? item.checked : undefined" :disabled="item.disabled" @mouseenter="item.children ? showSubmenu(group.label, item, index, $event.currentTarget as HTMLButtonElement) : (submenu = null)" @click="item.children ? showSubmenu(group.label, item, index, $event.currentTarget as HTMLButtonElement) : select(item, group.label)"><span class="editor-menu-label"><i v-if="item.checkable" aria-hidden="true">{{ item.checked ? '✓' : '' }}</i>{{ item.label }}</span><kbd v-if="item.shortcut">{{ item.shortcut }}</kbd><span v-if="item.children" class="editor-menu-chevron" aria-hidden="true">›</span></button>
            </template>
          </div>
        </template>
      </ArcoDropdown>
    </div>
    <Teleport to="body">
      <div v-if="submenu" class="editor-menu-subpopover" role="menu" :aria-label="submenu.label" :style="{ left: `${submenu.left}px`, top: `${submenu.top}px`, width: `${submenu.width}px` }" @mousedown.stop @pointerdown.stop @click.stop @keydown="navigate($event, submenu.group, true)">
        <button class="editor-menu-submenu-back" type="button" role="menuitem" @click="closeSubmenu"><span aria-hidden="true">‹</span>{{ submenu.label }}<small>返回</small></button>
        <div class="editor-menu-separator" role="separator" />
        <template v-for="(item, index) in submenu.items" :key="item.label ?? `separator-${index}`">
          <div v-if="item.separator" class="editor-menu-separator" role="separator" />
          <button v-else :role="item.checkable ? 'menuitemcheckbox' : 'menuitem'" type="button" :aria-checked="item.checkable ? item.checked : undefined" :disabled="item.disabled" @click="select(item, submenu.group, true)"><span class="editor-menu-label"><i v-if="item.checkable" aria-hidden="true">{{ item.checked ? '✓' : '' }}</i>{{ item.label }}</span><kbd v-if="item.shortcut">{{ item.shortcut }}</kbd></button>
        </template>
      </div>
    </Teleport>
  </nav>
</template>

<style scoped>
.editor-menu-bar { position: relative; z-index: 50; display: flex; flex: none; flex-wrap: wrap; gap: 2px; padding-inline: 12px; border-bottom: 1px solid var(--border); background: var(--surface); }
.editor-menu-group { position: relative; }
.editor-menu-trigger { padding: 7px 12px; border-radius: 5px; background: transparent; color: var(--ink); font: 13px var(--ui-font); }
.editor-menu-trigger:hover, .editor-menu-trigger[aria-expanded='true'] { background: var(--accent-soft); }
.editor-menu-popover { position: absolute; z-index: 30; top: 100%; left: 0; min-width: 200px; max-height: min(65vh, 540px); overflow-y: auto; padding: 5px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface-raised); box-shadow: 0 10px 28px #0003; }
.editor-menu-subpopover { position: fixed; z-index: 1000; min-width: min(220px, calc(100vw - 16px)); max-width: calc(100vw - 16px); max-height: min(65vh, 540px); overflow: auto; padding: 5px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface-raised); box-shadow: 0 10px 28px #0003; }
.editor-menu-popover button { display: flex; align-items: center; justify-content: space-between; gap: 24px; width: 100%; padding: 8px 10px; border-radius: 4px; background: transparent; color: var(--ink); font: 13px var(--ui-font); text-align: left; white-space: nowrap; }
.editor-menu-subpopover button { display: flex; align-items: center; justify-content: space-between; gap: 24px; width: 100%; padding: 8px 10px; border-radius: 4px; background: transparent; color: var(--ink); font: 13px var(--ui-font); text-align: left; white-space: nowrap; }
.editor-menu-popover button:hover, .editor-menu-popover button:focus-visible { background: var(--accent-soft); }
.editor-menu-subpopover button:hover, .editor-menu-subpopover button:focus-visible { background: var(--accent-soft); }
.editor-menu-popover button:disabled { opacity: .4; }
.editor-menu-subpopover button:disabled { opacity: .4; }
.editor-menu-subpopover .editor-menu-submenu-back { justify-content: flex-start; gap: 8px; font-weight: 600; }
.editor-menu-submenu-back > span { color: var(--accent); font-size: 18px; }
.editor-menu-submenu-back small { margin-left: auto; color: var(--muted); font: 11px var(--ui-font); }
.editor-menu-popover kbd { color: var(--muted); font: 11px var(--ui-font); }
.editor-menu-subpopover kbd { color: var(--muted); font: 11px var(--ui-font); }
.editor-menu-label { display: inline-flex; align-items: center; gap: 7px; }
.editor-menu-label i { display: inline-grid; width: 12px; place-items: center; color: var(--accent); font: 700 12px var(--ui-font); font-style: normal; }
.editor-menu-chevron { margin-left: auto; color: var(--muted); font: 18px/1 var(--ui-font); }
.editor-menu-separator { height: 1px; margin: 5px 6px; background: var(--border); }
</style>

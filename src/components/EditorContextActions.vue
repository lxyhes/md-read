<script setup lang="ts">
import { computed, nextTick, ref, type Component } from 'vue'
import { computePosition, flip, shift } from '@floating-ui/dom'
import AppIcon from './AppIcon.vue'

export type ContextAction = { label: string; action: () => unknown; icon?: Component; shortcut?: string; disabled?: boolean }
type ActionGroup = { label: string; items: ContextAction[] }

const props = defineProps<{ clipboard: ContextAction[]; format: ContextAction[]; groups: ActionGroup[] }>()
const emit = defineEmits<{ close: [] }>()
const openGroup = ref('')
const activeGroup = computed(() => props.groups.find(group => group.label === openGroup.value))
const submenu = ref<HTMLElement | null>(null)
let trigger: HTMLElement | null = null

function run(item: ContextAction) {
  emit('close')
  item.action()
}

async function open(label: string, button: HTMLElement, focus = false) {
  openGroup.value = label
  trigger = button
  await nextTick()
  const panel = submenu.value
  if (!panel || openGroup.value !== label) return
  const menu = button.closest('.editor-context-menu') ?? button
  const anchor = {
    contextElement: button,
    getBoundingClientRect() {
      const { left, width } = menu.getBoundingClientRect()
      const { top, height } = button.getBoundingClientRect()
      return new DOMRect(left, top, width, height)
    },
  }
  const { x, y } = await computePosition(anchor, panel, { strategy: 'fixed', placement: 'right-start', middleware: [flip({ padding: 8 }), shift({ padding: 8 })] })
  if (submenu.value !== panel || openGroup.value !== label) return
  Object.assign(panel.style, { left: `${x}px`, top: `${y}px`, visibility: 'visible' })
  if (focus) panel.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true })
}

function navigate(event: KeyboardEvent) {
  const target = event.target as HTMLElement
  const inSubmenu = submenu.value?.contains(target)
  if (inSubmenu && ['ArrowLeft', 'Escape'].includes(event.key)) {
    event.preventDefault()
    event.stopPropagation()
    openGroup.value = ''
    trigger?.focus({ preventScroll: true })
    return
  }
  if (event.key === 'ArrowRight' && target.dataset.group) {
    event.preventDefault()
    void open(target.dataset.group, target, true)
    return
  }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
  const menu = target.closest('[role="menu"]')
  const buttons = Array.from(menu?.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]:not(:disabled)') ?? [])
    .filter(button => button.closest('[role="menu"]') === menu)
  if (!buttons.length) return
  event.preventDefault()
  const index = buttons.indexOf(target as HTMLButtonElement)
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
  buttons[next].focus({ preventScroll: true })
}
</script>

<template>
  <div class="editor-context-actions" @keydown="navigate" @pointerdown.prevent>
    <div class="context-grid context-section" role="group" aria-label="剪贴板和删除" @pointerenter="openGroup = ''">
      <button v-for="item in clipboard" :key="item.label" type="button" role="menuitem" :aria-label="item.label" :title="item.label" :disabled="item.disabled" @click="run(item)"><component :is="item.icon" aria-hidden="true" /></button>
    </div>
    <div class="context-grid context-section" role="group" aria-label="常用格式" @pointerenter="openGroup = ''">
      <button v-for="item in format" :key="item.label" type="button" role="menuitem" :aria-label="item.label" :title="item.shortcut ? `${item.label} (${item.shortcut})` : item.label" @click="run(item)"><component :is="item.icon" aria-hidden="true" /></button>
    </div>
    <div class="context-section">
      <div v-for="group in groups" :key="group.label">
        <button class="context-group" type="button" role="menuitem" :data-group="group.label" aria-haspopup="menu" :aria-expanded="openGroup === group.label" @pointerenter="open(group.label, $event.currentTarget as HTMLElement)" @click="open(group.label, $event.currentTarget as HTMLElement, true)">
          {{ group.label }} <AppIcon name="chevron-right" :size="13" />
        </button>
      </div>
      <div v-if="activeGroup" :key="activeGroup.label" ref="submenu" class="context-flyout" role="menu" :aria-label="activeGroup.label">
        <button v-for="item in activeGroup.items" :key="item.label" class="context-group" type="button" role="menuitem" :disabled="item.disabled" @click="run(item)"><span>{{ item.label }}</span><kbd v-if="item.shortcut">{{ item.shortcut }}</kbd></button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.editor-context-actions { width: min(218px, calc(100vw - 28px)); }
.context-section { padding: 6px 10px; }
.context-section + .context-section { border-top: 1px solid var(--border); }
.context-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px; }
.editor-context-actions button { box-sizing: border-box; min-width: 0; min-height: 26px; color: var(--ink); font: 12px var(--ui-font); }
.context-grid button { display: grid; place-items: center; padding: 2px; border: 1px solid color-mix(in srgb, var(--border) 75%, transparent); border-radius: 4px; background: color-mix(in srgb, var(--surface) 62%, var(--surface-raised)); font-size: 15px; }
.context-group { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; padding: 5px 9px; white-space: nowrap; }
.editor-context-actions button:not(:disabled):is(:hover, :focus-visible, [aria-expanded='true']) { background: var(--accent-soft); color: var(--ink); }
.editor-context-actions button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.editor-context-actions button:disabled { opacity: .38; cursor: default; }
.context-flyout { position: fixed; z-index: 1; visibility: hidden; min-width: 156px; max-width: calc(100vw - 16px); max-height: calc(100vh - 16px); overflow: auto; padding: 4px; border: 1px solid var(--border); border-radius: 7px; background: var(--surface-raised); box-shadow: 0 6px 20px #0002; }
.context-flyout kbd { color: var(--muted); font: 11px var(--ui-font); }
</style>

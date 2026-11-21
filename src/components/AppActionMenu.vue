<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { Menu, MenuItem } from 'ant-design-vue'
import AppIcon, { type AppIconName } from './AppIcon.vue'

defineProps<{
  label: string
  active?: string
  actions: readonly { key: string; label: string; icon?: AppIconName; disabled?: boolean }[]
}>()
const emit = defineEmits<{ choose: [key: string]; dismiss: [] }>()
const root = ref<HTMLElement>()

function enabledItems() {
  return [...(root.value?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? [])]
}

let visibilityObserver: ResizeObserver | undefined

function focusFirstItem() {
  const first = enabledItems()[0]
  if (!first?.getClientRects().length) return false
  first.focus()
  return true
}

onMounted(() => {
  if (focusFirstItem() || !root.value) return
  // The dropdown portal can mount while its popup is still hidden.
  visibilityObserver = new ResizeObserver(() => {
    if (focusFirstItem()) visibilityObserver?.disconnect()
  })
  visibilityObserver.observe(root.value)
})
onBeforeUnmount(() => visibilityObserver?.disconnect())

function navigate(event: KeyboardEvent) {
  if (event.key === 'Tab') {
    emit('dismiss')
    return
  }
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    emit('dismiss')
    return
  }
  if (event.key === ' ') {
    event.preventDefault()
    ;(event.target as HTMLElement).click()
    return
  }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
  const items = enabledItems()
  if (!items.length) return
  event.preventDefault()
  const current = items.indexOf(document.activeElement as HTMLElement)
  const index = event.key === 'Home' ? 0
    : event.key === 'End' ? items.length - 1
    : event.key === 'ArrowDown' ? (current + 1) % items.length
    : current <= 0 ? items.length - 1 : current - 1
  items[index]?.focus()
}
</script>

<template>
  <div ref="root" @keydown="navigate">
    <Menu class="app-action-menu" :aria-label="label" :selectable="false" :selected-keys="active ? [active] : []" @click="emit('choose', String($event.key))">
      <MenuItem v-for="action in actions" :key="action.key" :disabled="action.disabled" :aria-current="active === action.key ? 'page' : undefined">
        <template v-if="action.icon" #icon><AppIcon :name="action.icon" :size="15" /></template>
        {{ action.label }}
      </MenuItem>
    </Menu>
  </div>
</template>

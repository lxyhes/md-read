<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { Dropdown } from 'ant-design-vue'

const props = withDefaults(defineProps<{ panelClass?: string; popupContainer?: string | HTMLElement; position?: 'bl' | 'br' | 'tl' | 'tr'; focusOnOpen?: boolean }>(), {
  panelClass: 'reader-more-popover',
  position: 'bl',
})
const emit = defineEmits<{ 'visible-change': [visible: boolean] }>()
const visible = ref(false)
let opener: HTMLElement | null = null
const panel = ref<HTMLElement | null>(null)
const placements = { bl: 'bottomLeft', br: 'bottomRight', tl: 'topLeft', tr: 'topRight' } as const
watch(panel, (element, _, onCleanup) => {
  if (!props.focusOnOpen || !element) return
  // The portal mounts before the dropdown finishes its first layout.
  const observer = new ResizeObserver(([entry]) => {
    if (!entry.contentRect.width) return
    observer.disconnect()
    if (visible.value && element.isConnected) element.focus({ preventScroll: true })
  })
  observer.observe(element)
  onCleanup(() => observer.disconnect())
}, { flush: 'post' })

function closeOnEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape' || event.defaultPrevented) return
  event.preventDefault()
  event.stopPropagation()
  const focusWasInPanel = panel.value?.contains(document.activeElement)
  setVisible(false)
  if (focusWasInPanel) opener?.focus()
}

function setVisible(next: boolean) {
  if (visible.value === next) return
  visible.value = next
  if (next) document.addEventListener('keydown', closeOnEscape)
  else document.removeEventListener('keydown', closeOnEscape)
  emit('visible-change', next)
}

function closeAfterAction(event: MouseEvent) {
  const button = (event.target as HTMLElement).closest('button')
  if (button && button.dataset.submenuTrigger !== 'true') setVisible(false)
}

function popupContainer(trigger: HTMLElement) {
  opener = trigger
  if (typeof props.popupContainer === 'string') return document.querySelector<HTMLElement>(props.popupContainer) ?? document.body
  return props.popupContainer ?? trigger.closest<HTMLElement>('dialog[open]') ?? document.body
}

onBeforeUnmount(() => document.removeEventListener('keydown', closeOnEscape))
defineExpose({ close: () => setVisible(false) })
</script>

<template>
  <Dropdown
    :trigger="['click']"
    :placement="placements[props.position]"
    :get-popup-container="popupContainer"
    :open="visible"
    @open-change="setVisible"
  >
    <slot :open="visible" />
    <template #overlay>
      <div v-if="visible" ref="panel" :class="props.panelClass" :tabindex="props.focusOnOpen ? -1 : undefined" @click.stop="closeAfterAction">
        <slot name="menu" />
      </div>
    </template>
  </Dropdown>
</template>

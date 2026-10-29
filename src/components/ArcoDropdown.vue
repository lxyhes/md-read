<script setup lang="ts">
import { ref } from 'vue'
import Dropdown from '@arco-design/web-vue/es/dropdown'
import '@arco-design/web-vue/es/dropdown/style/css.js'

const props = withDefaults(defineProps<{ panelClass?: string; popupContainer?: string | HTMLElement }>(), {
  panelClass: 'reader-more-popover',
})
const emit = defineEmits<{ 'visible-change': [visible: boolean] }>()
const visible = ref(false)

function setVisible(next: boolean) {
  visible.value = next
  emit('visible-change', next)
}

function closeAfterAction(event: MouseEvent) {
  if ((event.target as HTMLElement).closest('button')) setVisible(false)
}
</script>

<template>
  <Dropdown
    trigger="click"
    position="bl"
    :popup-container="props.popupContainer"
    :popup-visible="visible"
    :popup-max-height="false"
    :hide-on-select="false"
    @popup-visible-change="setVisible"
  >
    <slot />
    <template #content>
      <div v-if="visible" :class="props.panelClass" @click="closeAfterAction">
        <slot name="menu" />
      </div>
    </template>
  </Dropdown>
</template>

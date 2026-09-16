<script setup lang="ts">
import AppIcon, { type AppIconName } from './AppIcon.vue'

withDefaults(defineProps<{
  icon: AppIconName
  label: string
  size?: 'sm' | 'md'
  variant?: 'ghost' | 'surface'
  active?: boolean
  disabled?: boolean
}>(), {
  size: 'md',
  variant: 'ghost',
  active: false,
  disabled: false,
})
</script>

<template>
  <button
    class="icon-button"
    :class="[`icon-button-${size}`, `icon-button-${variant}`, { active }]"
    type="button"
    :title="label"
    :aria-label="label"
    :disabled="disabled"
  >
    <AppIcon :name="icon" :size="size === 'sm' ? 14 : 16" />
  </button>
</template>

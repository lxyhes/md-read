<script setup lang="ts">
import Button from '@arco-design/web-vue/es/button'
import '@arco-design/web-vue/es/button/style/css.js'
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
  <Button
    class="icon-button"
    :class="[`icon-button-${size}`, `icon-button-${variant}`, { active }]"
    :type="variant === 'surface' ? 'secondary' : 'text'"
    shape="square"
    html-type="button"
    :size="size === 'sm' ? 'small' : 'medium'"
    :title="label"
    :aria-label="label"
    :aria-pressed="active ? true : undefined"
    :disabled="disabled"
  >
    <AppIcon :name="icon" :size="size === 'sm' ? 14 : 16" />
  </Button>
</template>

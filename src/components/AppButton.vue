<script setup lang="ts">
import { Button } from 'ant-design-vue'

defineProps<{
  type?: 'primary' | 'secondary' | 'text' | 'outline' | 'dashed'
  status?: 'danger' | 'success' | 'warning' | 'normal'
  size?: 'mini' | 'small' | 'medium' | 'large'
  shape?: 'square' | 'round' | 'circle'
  long?: boolean
}>()
</script>

<template>
  <Button
    :type="type === 'primary' || type === 'text' || type === 'dashed' ? type : 'default'"
    :class="[type && `moyue-btn-${type}`, status && `moyue-btn-status-${status}`, { 'moyue-btn-with-icon': $slots.icon }]"
    :danger="status === 'danger'"
    :size="size === 'large' ? 'large' : size === 'small' || size === 'mini' ? 'small' : 'middle'"
    :shape="shape === 'round' || shape === 'circle' ? shape : undefined"
    :block="long"
    :auto-insert-space="false"
  >
    <template v-if="$slots.icon" #icon><span class="moyue-btn-icon"><slot name="icon" /></span></template>
    <span class="moyue-btn-content"><slot /></span>
  </Button>
</template>

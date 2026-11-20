<script setup lang="ts">
import { useId } from 'vue'
import { Select } from 'ant-design-vue'

defineOptions({ inheritAttrs: false })
defineProps<{ label: string }>()
const id = useId()
</script>

<template>
  <label class="control-label" :for="id">{{ label }}</label>
  <Select v-bind="$attrs" :id="id"><slot /></Select>
</template>

<style scoped>
.control-label {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>

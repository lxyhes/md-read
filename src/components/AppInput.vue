<script setup lang="ts">
import { ref } from 'vue'
import { Input } from 'ant-design-vue'

defineOptions({ inheritAttrs: false })
const model = defineModel<string>()
defineProps<{ inputAttrs?: Record<string, unknown> }>()
const field = ref<HTMLElement>()
defineExpose({
  focus: () => field.value?.querySelector('input')?.focus(),
  select: () => field.value?.querySelector('input')?.select(),
  setSelectionRange: (start: number, end: number) => field.value?.querySelector('input')?.setSelectionRange(start, end),
})
</script>

<template>
  <span ref="field" class="moyue-input-field" :class="$attrs.class" :style="$attrs.style">
    <Input v-bind="{ ...$attrs, class: undefined, style: undefined, ...inputAttrs }" v-model:value="model">
      <template v-if="$slots.prefix" #prefix><slot name="prefix" /></template>
    </Input>
  </span>
</template>

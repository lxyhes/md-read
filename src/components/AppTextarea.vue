<script setup lang="ts">
import { Textarea } from 'ant-design-vue'

defineOptions({ inheritAttrs: false })
defineProps<{ modelValue?: string; textareaAttrs?: Record<string, unknown> }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <div class="moyue-textarea-field" :class="$attrs.class" :style="$attrs.style">
    <Textarea class="moyue-textarea" v-bind="{ ...$attrs, class: 'moyue-textarea', style: undefined, ...textareaAttrs }" :value="modelValue" @update:value="emit('update:modelValue', $event)" />
  </div>
</template>

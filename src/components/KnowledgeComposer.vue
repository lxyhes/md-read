<script setup lang="ts">
import Button from '@arco-design/web-vue/es/button'
import Textarea from '@arco-design/web-vue/es/textarea'
import '@arco-design/web-vue/es/button/style/css.js'
import '@arco-design/web-vue/es/textarea/style/css.js'

defineProps<{ modelValue: string; disabled: boolean; busy: boolean; hasSources: boolean }>()
const emit = defineEmits<{ 'update:modelValue': [value: string]; submit: [] }>()
function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing || event.keyCode === 229) return
  event.preventDefault()
  const form = (event.target as HTMLTextAreaElement).form
  form?.requestSubmit()
}
</script>

<template>
  <form class="knowledge-ask-form" @submit.prevent="!disabled && !busy && hasSources && modelValue.trim() && emit('submit')">
    <Textarea
      :model-value="modelValue"
      :textarea-attrs="{ rows: 3, 'aria-label': '询问知识库' }"
      :placeholder="hasSources ? '输入问题，Enter 发送，Shift + Enter 换行…' : '先在「本次资料」中选择文档…'"
      :disabled="disabled || busy"
      @update:model-value="emit('update:modelValue', $event)"
      @keydown="onKeydown"
    />
    <Button class="primary-button" html-type="submit" :loading="busy" :disabled="disabled || busy || !hasSources || !modelValue.trim()">{{ busy ? '整理中…' : '发送问题' }}</Button>
  </form>
</template>

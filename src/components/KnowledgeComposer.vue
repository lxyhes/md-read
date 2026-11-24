<script setup lang="ts">
import Button from './AppButton.vue'
import Textarea from './AppTextarea.vue'
import AppIcon from './AppIcon.vue'

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
    <slot name="tools" />
    <Textarea
      :model-value="modelValue"
      :textarea-attrs="{ autoSize: { minRows: 2, maxRows: 6 }, 'aria-label': '询问知识库', 'aria-keyshortcuts': 'Enter Shift+Enter' }"
      :placeholder="hasSources ? '询问本次资料…' : '先选择本次资料…'"
      :disabled="disabled || busy"
      @update:model-value="emit('update:modelValue', $event)"
      @keydown="onKeydown"
    />
    <div class="knowledge-composer-footer">
      <slot name="sources" />
      <div class="knowledge-composer-controls">
        <slot name="mode" />
        <slot name="voice" />
        <Button class="knowledge-send" shape="circle" html-type="submit" :aria-label="busy ? '整理中' : '发送问题'" :title="busy ? '整理中' : '发送问题'" :loading="busy" :disabled="disabled || busy || !hasSources || !modelValue.trim()">
          <template v-if="!busy" #icon><AppIcon name="arrow-up" :size="17" /></template>
        </Button>
      </div>
    </div>
  </form>
</template>

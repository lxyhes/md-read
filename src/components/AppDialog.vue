<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { activeAppDialog, resolveAppDialog } from '../appDialog'

const promptValue = ref('')
const promptInput = ref<HTMLInputElement | null>(null)
const cancelButton = ref<HTMLButtonElement | null>(null)

watch(activeAppDialog, async (dialog) => {
  promptValue.value = dialog?.kind === 'prompt' ? dialog.defaultValue : ''
  await nextTick()
  if (activeAppDialog.value !== dialog) return
  if (dialog?.kind === 'prompt') {
    promptInput.value?.focus()
    promptInput.value?.select()
  } else cancelButton.value?.focus()
}, { flush: 'post' })

function cancelDialog() {
  resolveAppDialog(activeAppDialog.value?.kind === 'prompt' ? null : false)
}

function submitDialog() {
  resolveAppDialog(activeAppDialog.value?.kind === 'prompt' ? promptValue.value : true)
}
</script>

<template>
  <div v-if="activeAppDialog" class="overlay editor-dialog-overlay app-dialog-overlay" @click.self="cancelDialog" @keydown.esc.prevent.stop="cancelDialog">
    <form class="editor-dialog app-dialog" role="dialog" aria-modal="true" aria-labelledby="app-dialog-title" @submit.prevent="submitDialog">
      <span class="section-kicker">{{ activeAppDialog.kind === 'prompt' ? '输入内容' : '确认操作' }}</span>
      <h2 id="app-dialog-title">{{ activeAppDialog.title }}</h2>
      <p v-if="activeAppDialog.description" class="app-dialog-description">{{ activeAppDialog.description }}</p>
      <label v-if="activeAppDialog.kind === 'prompt'" class="setting-input">
        {{ activeAppDialog.inputLabel || '内容' }}
        <input ref="promptInput" v-model="promptValue" type="text" autocomplete="off" />
      </label>
      <div class="note-actions">
        <button ref="cancelButton" class="ghost-button" type="button" @click="cancelDialog">取消</button>
        <button class="primary-button" :class="{ 'app-dialog-danger': activeAppDialog.kind === 'confirm' && activeAppDialog.destructive }" type="submit">{{ activeAppDialog.confirmLabel || '确定' }}</button>
      </div>
    </form>
  </div>
</template>

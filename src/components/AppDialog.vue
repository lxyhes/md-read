<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { Modal } from 'ant-design-vue'
import Input from './AppInput.vue'
import { activeAppDialog, resolveAppDialog } from '../appDialog'

const promptValue = ref('')
const promptInput = ref<InstanceType<typeof Input> | null>(null)

watch(activeAppDialog, async (dialog) => {
  promptValue.value = dialog?.kind === 'prompt' ? dialog.defaultValue : ''
  await nextTick()
  if (activeAppDialog.value !== dialog) return
  if (dialog?.kind === 'prompt') {
    promptInput.value?.focus()
  }
}, { flush: 'post' })

function cancelDialog() {
  resolveAppDialog(activeAppDialog.value?.kind === 'prompt' ? null : false)
}

function submitDialog() {
  resolveAppDialog(activeAppDialog.value?.kind === 'prompt' ? promptValue.value : true)
}
</script>

<template>
  <Modal
    :open="Boolean(activeAppDialog)"
    :title="activeAppDialog?.title"
    :ok-text="activeAppDialog?.confirmLabel || '确定'"
    :mask-closable="true"
    :keyboard="true"
    :closable="true"
    @cancel="cancelDialog"
    @ok="submitDialog"
  >
    <span class="section-kicker">{{ activeAppDialog?.kind === 'prompt' ? '输入内容' : '确认操作' }}</span>
    <p v-if="activeAppDialog?.description" class="app-dialog-description">{{ activeAppDialog.description }}</p>
    <label v-if="activeAppDialog?.kind === 'prompt'" class="setting-input app-dialog-input">
      {{ activeAppDialog.inputLabel || '内容' }}
      <Input ref="promptInput" v-model="promptValue" allow-clear />
    </label>
  </Modal>
</template>

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
    if (dialog.selectionEnd !== undefined) promptInput.value?.setSelectionRange(0, dialog.selectionEnd)
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
    :ok-button-props="{ danger: activeAppDialog?.kind === 'confirm' && activeAppDialog.destructive }"
    wrap-class-name="app-dialog-wrap"
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

<style>
/* Keep confirmation dialogs visible when the desktop WebView drops Ant's runtime styles. */
.ant-modal-root:has(> .app-dialog-wrap) > .ant-modal-mask,
.app-dialog-wrap {
  position: fixed;
  inset: 0;
  z-index: 1000;
}
.ant-modal-root:has(> .app-dialog-wrap) > .ant-modal-mask {
  background: rgb(0 0 0 / 45%);
}
.app-dialog-wrap {
  display: flex;
  overflow: auto;
  padding: 16px;
}
.app-dialog-wrap .ant-modal {
  position: relative;
  top: auto;
  max-width: 100%;
  margin: auto;
  padding: 0;
}
.app-dialog-wrap .ant-modal-content {
  position: relative;
  padding: 20px 24px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface-raised);
  color: var(--ink);
  box-shadow: 0 24px 64px rgb(0 0 0 / 24%);
  font: 14px/1.5 var(--ui-font);
}
.app-dialog-wrap .ant-modal-close {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  background: transparent;
  color: var(--muted);
}
.app-dialog-wrap .ant-modal-title {
  margin-bottom: 12px;
  padding-inline-end: 30px;
  color: var(--ink);
  font: 600 16px/1.5 var(--ui-font);
}
.app-dialog-wrap .ant-modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
.app-dialog-wrap .ant-modal-footer .ant-btn {
  margin: 0;
  padding-inline: 14px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--ink);
}
.app-dialog-wrap .ant-modal-footer .ant-btn-primary {
  border-color: transparent;
  background: var(--accent);
  color: var(--app-bg);
}
.app-dialog-wrap .ant-modal-footer .ant-btn-dangerous {
  background: #a63d3d;
  color: #fff;
}
.app-dialog-wrap .ant-btn:focus-visible,
.app-dialog-wrap .ant-modal-close:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
</style>

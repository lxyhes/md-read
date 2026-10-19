import { shallowRef } from 'vue'

type PromptDialog = {
  kind: 'prompt'
  title: string
  description?: string
  inputLabel?: string
  defaultValue: string
  confirmLabel?: string
  resolve: (value: string | null) => void
}

type ConfirmDialog = {
  kind: 'confirm'
  title: string
  description?: string
  confirmLabel?: string
  destructive?: boolean
  resolve: (value: boolean) => void
}

export type AppDialogRequest = PromptDialog | ConfirmDialog

export const activeAppDialog = shallowRef<AppDialogRequest | null>(null)
const queuedDialogs: AppDialogRequest[] = []

function enqueueDialog(dialog: AppDialogRequest) {
  if (activeAppDialog.value) queuedDialogs.push(dialog)
  else activeAppDialog.value = dialog
}

export function promptAppText(options: Omit<PromptDialog, 'kind' | 'resolve'>) {
  return new Promise<string | null>((resolve) => enqueueDialog({ ...options, kind: 'prompt', resolve }))
}

export function confirmAppAction(options: Omit<ConfirmDialog, 'kind' | 'resolve'>) {
  return new Promise<boolean>((resolve) => enqueueDialog({ ...options, kind: 'confirm', resolve }))
}

export function resolveAppDialog(result: string | null | boolean) {
  const dialog = activeAppDialog.value
  if (!dialog) return
  activeAppDialog.value = queuedDialogs.shift() ?? null
  if (dialog.kind === 'prompt') dialog.resolve(typeof result === 'string' ? result : null)
  else dialog.resolve(result === true)
}

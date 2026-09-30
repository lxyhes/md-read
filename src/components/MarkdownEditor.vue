<script setup lang="ts">
import { getCurrentInstance, h, render, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView, keymap, drawSelection, dropCursor, lineNumbers, highlightActiveLine } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, undo, redo, undoDepth, redoDepth } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { Subscript, Superscript } from '@lezer/markdown'
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
import { liveMarkdown } from '../liveMarkdown'
import MermaidBlock from './MermaidBlock.vue'

const props = defineProps<{ modelValue: string; live: boolean; spellcheck: boolean; typewriter: boolean; focusMode: boolean; resolveUrl: (url: string) => string }>()
const emit = defineEmits<{
  'update:modelValue': [value: string]
  caret: []
  keydown: [event: KeyboardEvent]
  paste: [event: ClipboardEvent]
  copy: [event: ClipboardEvent]
  cut: [event: ClipboardEvent]
  history: [state: { undo: boolean; redo: boolean }]
  message: [text: string]
  link: [url: string]
}>()
const host = ref<HTMLElement | null>(null)
const appearance = new Compartment()
let view: EditorView | null = null
let publishing = false
let lastCell: HTMLTextAreaElement | null = null
function onFocus(event: FocusEvent) {
  lastCell = event.target instanceof HTMLTextAreaElement && event.target.closest('.live-table-widget') ? event.target : null
}
function wrapInlineCell(before: string, after: string, placeholder: string) {
  const input = lastCell
  if (!input?.isConnected || !props.live) return false
  const start = input.selectionStart, end = input.selectionEnd, value = input.value
  const selected = value.slice(start, end) || placeholder
  const unwrapped = start >= before.length && value.slice(start - before.length, start) === before && value.slice(end, end + after.length) === after
  input.value = unwrapped ? value.slice(0, start - before.length) + selected + value.slice(end + after.length) : value.slice(0, start) + before + selected + after + value.slice(end)
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.focus()
  const caret = start + (unwrapped ? -before.length : before.length)
  input.setSelectionRange(caret, caret + selected.length)
  return true
}
const appContext = getCurrentInstance()!.appContext
const live = liveMarkdown({ resolveUrl: url => props.resolveUrl(url), openLink: url => emit('link', url), message: text => emit('message', text), renderDiagram(root, code) {
  const node = h(MermaidBlock, { code, large: true })
  node.appContext = appContext
  render(node, root)
  return () => render(null, root)
} })
const extensions = () => [props.live ? live : [lineNumbers(), syntaxHighlighting(defaultHighlightStyle)], EditorView.contentAttributes.of({ 'aria-label': props.live ? 'Markdown 所见即所得编辑器' : 'Markdown 源码编辑器', spellcheck: String(props.spellcheck) })]

function replaceSource(value: string, start?: number, end = start) {
  if (!view) return
  const previous = view.state.doc.toString()
  let from = 0, oldEnd = previous.length, newEnd = value.length
  while (from < oldEnd && from < newEnd && previous[from] === value[from]) from++
  while (oldEnd > from && newEnd > from && previous[oldEnd - 1] === value[newEnd - 1]) { oldEnd--; newEnd-- }
  view.dispatch({
    ...(previous !== value ? { changes: { from, to: oldEnd, insert: value.slice(from, newEnd) }, userEvent: 'input.command' } : {}),
    ...(start !== undefined ? { selection: { anchor: Math.min(start, value.length), head: Math.min(end ?? start, value.length) }, scrollIntoView: true } : {}),
  })
}

function centerCaret() {
  if (view && props.typewriter) view.dispatch({ effects: EditorView.scrollIntoView(view.state.selection.main.head, { y: 'center' }) })
}

onMounted(() => {
  host.value!.addEventListener('focusin', onFocus)
  view = new EditorView({ parent: host.value!, state: EditorState.create({ doc: props.modelValue, extensions: [
    EditorState.lineSeparator.of('\n'), markdown({ base: markdownLanguage, extensions: [Subscript, Superscript] }), history(), drawSelection(), dropCursor(), highlightActiveLine(), EditorView.lineWrapping,
    keymap.of([...historyKeymap, ...defaultKeymap]), appearance.of(extensions()),
    EditorView.domEventHandlers({
      keydown(event) { emit('keydown', event); return event.defaultPrevented },
      paste(event) { emit('paste', event); return event.defaultPrevented },
      copy(event) { emit('copy', event); return event.defaultPrevented },
      cut(event) { emit('cut', event); return event.defaultPrevented },
    }),
    EditorView.updateListener.of(update => {
      if (update.docChanged) { publishing = true; try { emit('update:modelValue', update.state.doc.toString()) } finally { publishing = false } }
      if (update.docChanged || update.selectionSet) {
        emit('caret')
        emit('history', { undo: undoDepth(update.state) > 0, redo: redoDepth(update.state) > 0 })
        if (props.typewriter) requestAnimationFrame(centerCaret)
      }
    }),
  ] }) })
  view.focus()
})
watch(() => props.modelValue, value => { if (!publishing && view?.state.doc.toString() !== value) replaceSource(value) })
watch(() => [props.live, props.spellcheck], () => view?.dispatch({ effects: appearance.reconfigure(extensions()) }))
watch(() => props.typewriter, centerCaret)
onBeforeUnmount(() => { host.value?.removeEventListener('focusin', onFocus); view?.destroy(); view = null })

defineExpose({
  get selectionStart() { return view?.state.selection.main.from ?? 0 },
  get selectionEnd() { return view?.state.selection.main.to ?? 0 },
  get scrollTop() { return view?.scrollDOM.scrollTop ?? 0 },
  set scrollTop(value: number) { if (view) view.scrollDOM.scrollTop = value },
  get clientHeight() { return view?.scrollDOM.clientHeight ?? 0 },
  focus: () => view?.focus(),
  setSelectionRange: (start: number, end: number) => view?.dispatch({ selection: { anchor: Math.min(start, view.state.doc.length), head: Math.min(end, view.state.doc.length) }, scrollIntoView: true }),
  replaceSource,
  undo: () => view && undo(view),
  redo: () => view && redo(view),
  scrollTo: (options: ScrollToOptions) => view?.scrollDOM.scrollTo(options),
  centerCaret,
  wrapInlineCell,
})
</script>

<template><div ref="host" class="markdown-editor" :class="{ 'is-live': live, 'is-line-focus': focusMode }" /></template>

<script setup lang="ts">
import { computed, getCurrentInstance, h, render, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView, keymap, drawSelection, dropCursor, lineNumbers, highlightActiveLine } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap, undo, redo, undoDepth, redoDepth } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { Subscript, Superscript } from '@lezer/markdown'
import { syntaxHighlighting, defaultHighlightStyle, syntaxTree } from '@codemirror/language'
import { isTopLevelParagraph } from '../editorInput'
import { liveMarkdown } from '../liveMarkdown'
import { editorCodeHighlight } from '../editorCodeHighlight'
import type { ThemeManifest } from '../types'
import { editorDirectoryTrees } from '../parser'
import EditorDirectoryNavigator from './EditorDirectoryNavigator.vue'
import MermaidBlock from './MermaidBlock.vue'

const props = defineProps<{ modelValue: string; directoryTreeSource?: string; live: boolean; spellcheck: boolean; typewriter: boolean; focusMode: boolean; themeMode?: ThemeManifest['mode']; resolveUrl: (url: string) => string }>()
const emit = defineEmits<{
  'update:modelValue': [value: string]
  caret: [position: { offset: number; line: number; column: number }]
  keydown: [event: KeyboardEvent]
  paste: [event: ClipboardEvent]
  copy: [event: ClipboardEvent]
  cut: [event: ClipboardEvent]
  history: [state: { undo: boolean; redo: boolean }]
  message: [text: string]
  link: [url: string]
  'code-language': [language: string]
  'refresh-directory-tree': []
}>()
const host = ref<HTMLElement | null>(null)
const fallback = ref(false)
const failed = ref(false)
const appearance = new Compartment()
let view: EditorView | null = null
let publishing = false
let lastCell: HTMLTextAreaElement | null = null
let selectionPointerDown = false
let selectionDragFrozen = false
let typewriterFrame: number | null = null
const cursorLine = ref(1)
const treeAnchorTop = ref<number | null>(null)
const directoryTreeSource = computed(() => props.directoryTreeSource ?? props.modelValue)
const directoryTrees = computed(() => editorDirectoryTrees(directoryTreeSource.value))
const activeDirectoryTree = computed(() => directoryTrees.value.find(tree => cursorLine.value >= tree.startLine && cursorLine.value <= tree.endLine))
const treeAnchorMeasure = {
  read(editor: EditorView) {
    if (!activeDirectoryTree.value || !host.value) return null
    const bounds = editor.scrollDOM.getBoundingClientRect()
    const line = editor.lineBlockAt(editor.state.selection.main.from)
    const top = editor.documentTop + line.top
    if (top + line.height <= bounds.top || top >= bounds.bottom) return null
    return Math.max(bounds.top, top) - host.value.getBoundingClientRect().top
  },
  write(top: number | null) { treeAnchorTop.value = top },
}
watch([cursorLine, activeDirectoryTree], () => view?.requestMeasure(treeAnchorMeasure))

function jumpToDirectoryLine(number: number) {
  if (!view || directoryTreeSource.value !== props.modelValue || number > view.state.doc.lines) return
  const line = view.state.doc.line(number)
  const offset = line.from + line.text.trimEnd().length
  view.focus()
  view.dispatch({ selection: { anchor: offset }, scrollIntoView: true })
}

function onSelectionMouseDown(event: MouseEvent) {
  const target = event.target
  if (event.button !== 0 || !(target instanceof Element) || !target.closest('.cm-content')) return
  cancelTypewriterCenter()
  if (target.closest('input, textarea, button, a, .live-preview-widget, .live-table-widget, .live-diagram-widget')) return
  selectionPointerDown = true
  selectionDragFrozen = false
}
function onSelectionMouseMove(event: MouseEvent) {
  if (!(event.buttons & 1)) {
    if (selectionPointerDown) finishSelectionDrag(event)
    resetSelectionDrag()
  } else if (selectionDragFrozen) {
    event.preventDefault()
    event.stopImmediatePropagation()
  }
}
function resetSelectionDrag() {
  selectionPointerDown = false
  selectionDragFrozen = false
}
function onSelectionMouseUp(event: MouseEvent) {
  if (event.isTrusted && event.button === 0) resetSelectionDrag()
}
function finishSelectionDrag(event: MouseEvent | FocusEvent) {
  cancelTypewriterCenter()
  if (!selectionPointerDown || selectionDragFrozen) return
  selectionDragFrozen = true
  const currentView = view
  const state = currentView?.state
  document.dispatchEvent(new MouseEvent('mouseup', {
    bubbles: true,
    cancelable: true,
    button: 0,
    buttons: 0,
    clientX: event instanceof MouseEvent ? event.clientX : 0,
    clientY: event instanceof MouseEvent ? event.clientY : 0,
  }))
  // Releasing a pending click inside an existing selection can collapse it.
  if (currentView && state && currentView.state.doc === state.doc && !state.selection.eq(currentView.state.selection)) {
    currentView.dispatch({ selection: state.selection, userEvent: 'select.pointer' })
  }
}

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
const live = liveMarkdown({ resolveUrl: url => props.resolveUrl(url), openLink: url => emit('link', url), message: text => emit('message', text), selectCodeLanguage: language => emit('code-language', language), renderDiagram(root, code) {
  const node = h(MermaidBlock, { code, large: true })
  node.appContext = appContext
  render(node, root)
  return () => render(null, root)
} })
const extensions = () => [props.live && !fallback.value ? live : [lineNumbers(), syntaxHighlighting(defaultHighlightStyle)], EditorView.contentAttributes.of({ 'aria-label': props.live && !fallback.value ? 'Markdown 所见即所得编辑器' : 'Markdown 源码编辑器', spellcheck: String(props.spellcheck) })]

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

function cancelTypewriterCenter() {
  if (typewriterFrame === null) return
  cancelAnimationFrame(typewriterFrame)
  typewriterFrame = null
}

onMounted(() => {
  host.value!.addEventListener('focusin', onFocus)
  host.value!.addEventListener('mousedown', onSelectionMouseDown, true)
  document.addEventListener('wheel', finishSelectionDrag, { capture: true, passive: true })
  document.addEventListener('mousemove', onSelectionMouseMove, true)
  document.addEventListener('mouseup', onSelectionMouseUp, true)
  window.addEventListener('blur', finishSelectionDrag)
  const createEditor = () => new EditorView({ parent: host.value!, state: EditorState.create({ doc: props.modelValue, extensions: [
    // Tauri's packaged CSP requires dynamic editor styles to reuse its style nonce.
    EditorView.cspNonce.of(document.querySelector<HTMLStyleElement>('style[nonce]')?.nonce ?? ''),
    EditorState.lineSeparator.of('\n'), ...(fallback.value ? [] : [markdown({ base: markdownLanguage, extensions: [Subscript, Superscript] }), editorCodeHighlight]), history(), drawSelection(), dropCursor(), highlightActiveLine(), EditorView.lineWrapping,
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
        cancelTypewriterCenter()
        const offset = update.state.selection.main.from
        const line = update.state.doc.lineAt(offset)
        cursorLine.value = line.number
        emit('caret', { offset, line: line.number, column: offset - line.from + 1 })
        emit('history', { undo: undoDepth(update.state) > 0, redo: redoDepth(update.state) > 0 })
        if (props.typewriter && !update.transactions.some(transaction => transaction.isUserEvent('select.pointer') || transaction.isUserEvent('select.outline') || transaction.isUserEvent('select.table') || transaction.isUserEvent('input.table'))) {
          typewriterFrame = requestAnimationFrame(() => {
            typewriterFrame = null
            centerCaret()
          })
        }
      }
      if (activeDirectoryTree.value && (update.geometryChanged || update.viewportChanged)) update.view.requestMeasure(treeAnchorMeasure)
    }),
  ] }) })
  try {
    view = createEditor()
  } catch (error) {
    console.error('Markdown editor initialization failed', error)
    fallback.value = true
    host.value!.replaceChildren()
    try {
      view = createEditor()
      emit('message', '实时编辑器加载失败，已切换到源码编辑；草稿内容未改变')
    } catch (fallbackError) {
      console.error('Markdown source editor initialization failed', fallbackError)
      host.value!.replaceChildren()
      failed.value = true
      emit('message', '编辑器加载失败，原文可复制；请退出编辑后重试')
    }
  }
  view?.focus()
  view?.requestMeasure(treeAnchorMeasure)
  view?.scrollDOM.addEventListener('scroll', measureTreeAnchor, { passive: true })
})
function measureTreeAnchor() {
  if (activeDirectoryTree.value) view?.requestMeasure(treeAnchorMeasure)
}
watch(() => props.modelValue, value => { if (!publishing && view?.state.doc.toString() !== value) replaceSource(value) })
watch(() => [props.live, props.spellcheck], () => view?.dispatch({ effects: appearance.reconfigure(extensions()) }))
watch(() => props.typewriter, () => {
  cancelTypewriterCenter()
  centerCaret()
})
onBeforeUnmount(() => {
  cancelTypewriterCenter()
  host.value?.removeEventListener('focusin', onFocus)
  host.value?.removeEventListener('mousedown', onSelectionMouseDown, true)
  document.removeEventListener('wheel', finishSelectionDrag, true)
  document.removeEventListener('mousemove', onSelectionMouseMove, true)
  document.removeEventListener('mouseup', onSelectionMouseUp, true)
  window.removeEventListener('blur', finishSelectionDrag)
  view?.scrollDOM.removeEventListener('scroll', measureTreeAnchor)
  view?.destroy()
  view = null
})

defineExpose({
  get selectionStart() { return view?.state.selection.main.from ?? 0 },
  get selectionEnd() { return view?.state.selection.main.to ?? 0 },
  get scrollTop() { return view?.scrollDOM.scrollTop ?? 0 },
  set scrollTop(value: number) { if (view) view.scrollDOM.scrollTop = value },
  get clientHeight() { return view?.scrollDOM.clientHeight ?? 0 },
  focus: () => view?.focus(),
  setSelectionRange(start: number, end: number, align: 'nearest' | 'start' | 'center' = 'nearest') {
    if (!view) return
    const anchor = Math.min(start, view.state.doc.length)
    view.dispatch({
      selection: { anchor, head: Math.min(end, view.state.doc.length) },
      ...(align === 'nearest'
        ? { scrollIntoView: true }
        : { userEvent: 'select.outline', effects: EditorView.scrollIntoView(anchor, { y: align, yMargin: 16 }) }),
    })
  },
  replaceSource,
  placeContextCaret(event: MouseEvent) {
    if (!view || !(event.target instanceof Element) || !view.contentDOM.contains(event.target)) return
    const position = view.posAtCoords({ x: event.clientX, y: event.clientY })
    const { from, to } = view.state.selection.main
    if (position !== null && (position < from || position > to)) view.dispatch({ selection: { anchor: position } })
  },
  imageAt(event: MouseEvent) {
    if (!view || !host.value?.contains(event.target as Node)) return null
    const target = event.target as HTMLElement
    const widget = target.closest('img')?.closest<HTMLElement>('[data-image-offset]')
    const position = widget ? Number(widget.dataset.imageOffset) : view.posAtCoords({ x: event.clientX, y: event.clientY })
    if (position === null) return null
    const selection = view.state.selection.main
    const tree = syntaxTree(view.state)
    for (const offset of [position, ...(!selection.empty && position >= selection.from && position <= selection.to ? [selection.from] : [])]) {
      let node = tree.resolveInner(offset, 1)
      while (node.parent && !['Image', 'HTMLTag', 'HTMLBlock'].includes(node.name)) node = node.parent
      const source = view.state.sliceDoc(node.from, node.to)
      if (node.name === 'Image') {
        const url = node.getChild('URL')
        if (url) return { from: node.from, to: node.to, source, url: view.state.sliceDoc(url.from, url.to).replace(/^<|>$/g, ''), alt: source.slice(2, source.lastIndexOf('](')), html: false }
      }
      if (/^<img\s[^<>]*>\s*$/i.test(source)) {
        const image = new DOMParser().parseFromString(source, 'text/html').querySelector('img')
        const url = image?.getAttribute('src')
        if (url) return { from: node.from, to: node.to, source, url, alt: image?.alt ?? '', html: true }
      }
    }
    return null
  },
  undo: () => view && undo(view),
  redo: () => view && redo(view),
  scrollTo: (options: ScrollToOptions) => view?.scrollDOM.scrollTo(options),
  centerCaret,
  wrapInlineCell,
  isTopLevelParagraph: () => view && !fallback.value ? isTopLevelParagraph(syntaxTree(view.state), view.state.selection.main.from, view.state.selection.main.to) : false,
})
</script>

<template>
  <div class="markdown-editor" :data-code-theme="themeMode ?? 'system'" :class="{ 'is-live': live && !fallback, 'is-line-focus': focusMode && !fallback }">
    <p v-if="fallback" role="alert" class="editor-fallback-notice">{{ failed ? '编辑器加载失败，原文未改变。请复制原文或退出编辑后重试。' : '实时渲染加载失败，已切换到源码编辑；草稿内容未改变。' }}</p>
    <textarea v-if="failed" :value="modelValue" class="editor-fallback-source" readonly aria-label="编辑器加载失败时的原文" />
    <div class="editor-code-frame">
      <div ref="host" class="editor-code-host" :hidden="failed" />
      <EditorDirectoryNavigator v-if="activeDirectoryTree && treeAnchorTop !== null"
        :key="activeDirectoryTree.startLine" :tree="activeDirectoryTree" :line="cursorLine"
        class="editor-directory-anchor" :style="{ '--tree-anchor-top': `${treeAnchorTop}px` }"
        @open="emit('refresh-directory-tree')" @jump="jumpToDirectoryLine" />
    </div>
  </div>
</template>

<style scoped>
.markdown-editor { display: flex; flex-direction: column; }
.editor-code-frame { position: relative; flex: 1; min-height: 0; display: flex; }
.editor-code-host { flex: 1; min-width: 0; min-height: 0; }
.editor-directory-anchor { position: absolute; z-index: 3; inset-inline-end: 16px; inset-block-start: clamp(0px, var(--tree-anchor-top), calc(100% - 30px)); }
.editor-fallback-notice { flex: none; margin: 0; padding: 10px 16px; color: var(--ink); background: var(--accent-soft); font: 13px/1.5 var(--ui-font); }
.editor-fallback-source { flex: 1; min-height: 0; width: 100%; padding: 16px; resize: none; color: var(--ink); background: var(--surface); font: 14px/1.6 var(--mono); }
</style>

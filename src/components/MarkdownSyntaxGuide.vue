<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import logo from '../assets/moyue-logo-256.png'
import { renderSimpleFlowchart } from '../flowchart'
import { renderMarkdownFragment } from '../markdown/fragment'
import { searchSyntaxGuide, type SyntaxExample } from '../markdown/syntaxGuide'
import AppIcon from './AppIcon.vue'

const props = defineProps<{ canInsert: boolean; copy: (source: string) => Promise<void> }>()
const emit = defineEmits<{ close: []; insert: [example: SyntaxExample] }>()
const dialog = ref<HTMLDialogElement | null>(null)
const navigation = ref<HTMLElement | null>(null)
const details = ref<HTMLElement | null>(null)
const insertButton = ref<HTMLButtonElement | null>(null)
const copyButton = ref<HTMLButtonElement | null>(null)
const query = ref('')
const chosen = shallowRef<SyntaxExample>()
const copyStatus = ref('')

const groups = computed(() => searchSyntaxGuide(query.value))
const results = computed(() => groups.value.flatMap(group => group.examples))
const current = computed(() => chosen.value ?? results.value[0])
const insertionHint = computed(() => {
  if (current.value?.mode === 'copy') return '复制后放到文件开头'
  if (!props.canInsert) return '在可编辑模式下可以插入示例'
  return current.value?.mode === 'inline' ? '插在光标或选区末尾' : '插在当前内容块之后'
})
const preview = computed(() => {
  const example = current.value
  if (!example || example.previewText) return ''
  if (example.diagram) return renderSimpleFlowchart(example.diagram) ?? ''
  return renderMarkdownFragment(example.previewSource ?? example.source, url => url === './photo.png' ? logo : url)
})

watch(query, () => {
  chosen.value = undefined
  if (navigation.value) navigation.value.scrollTop = 0
}, { flush: 'sync' })
watch(current, () => {
  copyStatus.value = ''
  if (details.value) details.value.scrollTop = 0
})
onMounted(() => dialog.value?.showModal())
onBeforeUnmount(() => dialog.value?.close())

async function navigateExamples(event: KeyboardEvent, fromSearch = false) {
  if (event.isComposing || event.keyCode === 229 || !current.value) return
  if (event.key === 'Enter') {
    event.preventDefault()
    const action = insertButton.value ?? copyButton.value
    action?.focus()
    return
  }
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
  event.preventDefault()
  const index = results.value.indexOf(current.value)
  const direction = event.key === 'ArrowDown' ? 1 : -1
  chosen.value = results.value[(index + direction + results.value.length) % results.value.length]
  await nextTick()
  const selectedButton = navigation.value?.querySelector<HTMLButtonElement>('[aria-current="true"]')
  selectedButton?.scrollIntoView?.({ block: 'nearest' })
  if (!fromSearch) selectedButton?.focus()
}

async function copyExample(example: SyntaxExample) {
  let status: string
  try {
    await props.copy(example.source)
    status = '已复制'
  } catch {
    status = '复制失败，可选中源码手动复制'
  }
  if (current.value === example) copyStatus.value = status
}
</script>

<template>
  <dialog id="markdown-syntax-guide" ref="dialog" class="syntax-guide" aria-labelledby="syntax-guide-title" @cancel.prevent="emit('close')">
    <header class="syntax-guide-header">
      <h2 id="syntax-guide-title">Markdown 语法帮助</h2>
      <button type="button" class="syntax-guide-close" aria-label="关闭语法帮助" title="关闭（Esc）" @click="emit('close')"><AppIcon name="close" :size="18" /></button>
    </header>
    <label class="syntax-guide-search">
      <AppIcon name="search" :size="16" />
      <input v-model="query" type="search" autofocus aria-label="搜索 Markdown 语法" aria-describedby="syntax-guide-keys" placeholder="搜索语法，例如待办、表格、公式" @keydown="navigateExamples($event, true)" />
    </label>
    <p id="syntax-guide-keys" class="syntax-guide-keys"><kbd>↑</kbd> <kbd>↓</kbd> 切换示例 <span><kbd>Enter</kbd> 跳到操作</span></p>
    <div class="syntax-guide-body">
      <nav v-if="groups.length" ref="navigation" class="syntax-guide-nav" aria-label="语法示例" @keydown="navigateExamples($event)">
        <section v-for="group in groups" :key="group.name">
          <h3>{{ group.name }}</h3>
          <button v-for="example in group.examples" :key="example.name" type="button" :aria-current="current === example ? 'true' : undefined" :tabindex="current === example ? 0 : -1" @click="chosen = example">{{ example.name }}</button>
        </section>
      </nav>
      <article v-if="current" class="syntax-guide-example">
        <div ref="details" class="syntax-guide-details">
          <h3 aria-live="polite">{{ current.name }}</h3>
          <p>{{ current.tip }}</p>
          <div class="syntax-guide-comparison">
            <section>
              <h4>Markdown 源码</h4>
              <pre><code>{{ current.source }}</code></pre>
            </section>
            <section>
              <h4>阅读效果</h4>
              <div v-if="current.previewText" class="syntax-guide-preview">{{ current.previewText }}</div>
              <div v-else :key="current.name" class="syntax-guide-preview" :class="{ 'is-diagram': current.diagram }" @click="($event.target as HTMLElement).closest('a') && $event.preventDefault()" v-html="preview" />
            </section>
          </div>
        </div>
        <div class="syntax-guide-actions">
          <button ref="copyButton" type="button" @click="copyExample(current)">复制源码</button>
          <button v-if="canInsert && current.mode !== 'copy'" ref="insertButton" type="button" class="syntax-guide-insert" aria-describedby="syntax-guide-insertion" @click="emit('insert', current)">插入示例</button>
          <small v-show="!copyStatus" id="syntax-guide-insertion">{{ insertionHint }}</small>
          <small class="syntax-guide-copy-status" role="status">{{ copyStatus }}</small>
        </div>
      </article>
      <p v-else class="syntax-guide-empty" role="status">没有找到匹配的语法。试试「表格」或「链接」。</p>
    </div>
  </dialog>
</template>

<style scoped>
.syntax-guide {
  box-sizing: border-box;
  width: min(800px, calc(100vw - 32px));
  max-width: none;
  max-height: calc(100dvh - 32px);
  padding: 0;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface-raised, var(--surface, #fff));
  color: var(--ink);
  box-shadow: 0 20px 70px #0005;
  font: 14px/1.5 var(--ui-font, sans-serif);
}
.syntax-guide::backdrop { background: #10182770; }
.syntax-guide-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 15px 20px 10px; }
.syntax-guide-header h2 { margin: 0; font: 650 19px/1.4 var(--ui-font); }
.syntax-guide button { color: inherit; font: inherit; }
.syntax-guide-close { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 5px; background: transparent; }
.syntax-guide-close:hover { background: var(--accent-soft); }
.syntax-guide-search { display: flex; align-items: center; gap: 9px; margin: 0 20px; padding: 0 10px; border: 1px solid var(--border); border-radius: 6px; color: var(--muted); }
.syntax-guide-search:focus-within { outline: 2px solid var(--accent); outline-offset: 1px; }
.syntax-guide-search input { width: 100%; min-width: 0; height: 36px; padding: 0; border: 0; outline: 0; background: transparent; color: var(--ink); font: inherit; }
.syntax-guide-search input::placeholder { color: var(--muted); }
.syntax-guide-keys { margin: 6px 20px 10px; color: var(--muted); font-size: 12px; }
.syntax-guide-keys span { margin-inline-start: 8px; }
.syntax-guide-keys kbd { color: var(--ink); font: inherit; }
.syntax-guide-body { display: grid; grid-template-columns: 162px minmax(0, 1fr); grid-template-rows: minmax(0, 1fr); height: min(460px, max(185px, calc(100dvh - 176px))); border-top: 1px solid var(--border); }
.syntax-guide-nav { overflow: auto; padding: 12px 10px; border-right: 1px solid var(--border); }
.syntax-guide-nav section + section { margin-top: 13px; }
.syntax-guide-nav h3 { margin: 0; padding: 4px 9px; color: var(--muted); font-size: 12px; }
.syntax-guide-nav button { display: block; width: 100%; padding: 6px 9px; border-radius: 5px; background: transparent; text-align: left; }
.syntax-guide-nav button:hover, .syntax-guide-nav button[aria-current] { background: var(--accent-soft); }
.syntax-guide-nav button[aria-current] { box-shadow: inset 3px 0 var(--accent); font-weight: 650; }
.syntax-guide button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.syntax-guide-example { display: grid; grid-template-rows: minmax(0, 1fr) auto; min-width: 0; }
.syntax-guide-details { overflow: auto; padding: 19px 20px; }
.syntax-guide-details > h3 { margin: 0; font-size: 18px; }
.syntax-guide-details > p { margin: 6px 0 16px; color: var(--muted); }
.syntax-guide-comparison { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.syntax-guide-comparison > section { min-width: 0; border: 1px solid var(--border); border-radius: 6px; }
.syntax-guide-comparison h4 { margin: 0; padding: 6px 10px; border-bottom: 1px solid var(--border); color: var(--muted); font-size: 12px; }
.syntax-guide-comparison pre, .syntax-guide-preview { margin: 0; padding: 10px; }
.syntax-guide-comparison pre { overflow: auto; background: var(--surface); white-space: pre; }
.syntax-guide-comparison code { font: 13px/1.55 var(--mono-font, monospace); }
.syntax-guide-preview { overflow: auto; overflow-wrap: anywhere; }
.syntax-guide-preview :deep(mjx-container) { max-width: 100%; overflow: auto hidden; }
.syntax-guide-preview :deep(p), .syntax-guide-preview :deep(h1), .syntax-guide-preview :deep(h2), .syntax-guide-preview :deep(h3) { margin: 0 0 .45em; }
.syntax-guide-preview :deep(ul), .syntax-guide-preview :deep(ol) { margin: 0; padding-inline-start: 22px; }
.syntax-guide-preview :deep(img) { max-width: 100%; max-height: 82px; object-fit: contain; }
.syntax-guide-preview :deep(a) { color: var(--accent); text-decoration: underline; }
.syntax-guide-preview :deep(blockquote) { margin: 0; padding-inline-start: 8px; border-inline-start: 2px solid var(--border); }
.syntax-guide-preview :deep(table) { width: 100%; border-collapse: collapse; }
.syntax-guide-preview :deep(th), .syntax-guide-preview :deep(td) { padding: 4px 6px; border: 1px solid var(--border); }
.syntax-guide-preview.is-diagram :deep(svg) { display: block; width: 100%; }
.syntax-guide-preview.is-diagram :deep(.node rect) { fill: var(--accent-soft); stroke: var(--accent); }
.syntax-guide-preview.is-diagram :deep(.node text) { fill: var(--ink); }
.syntax-guide-preview.is-diagram :deep(.edge) { stroke: var(--accent); }
.syntax-guide-preview.is-diagram :deep(marker path) { fill: var(--accent); }
.syntax-guide-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 11px 20px; border-top: 1px solid var(--border); }
.syntax-guide-actions button { padding: 5px 10px; border: 1px solid var(--border); border-radius: 5px; background: transparent; }
.syntax-guide-actions button:hover, .syntax-guide-actions .syntax-guide-insert { border-color: var(--accent); background: var(--accent-soft); }
.syntax-guide-actions small { color: var(--muted); }
.syntax-guide-copy-status:empty { position: absolute; }
.syntax-guide-empty { grid-column: 1 / -1; margin: 0; padding: 20px; color: var(--muted); }
@media (max-width: 630px) {
  .syntax-guide-body { grid-template-columns: 110px minmax(0, 1fr); }
  .syntax-guide-comparison { grid-template-columns: minmax(0, 1fr); }
  .syntax-guide-details, .syntax-guide-actions { padding: 12px; }
}
</style>

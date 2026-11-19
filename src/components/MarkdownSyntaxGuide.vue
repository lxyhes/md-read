<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import logo from '../assets/moyue-logo-256.png'
import { renderSimpleFlowchart } from '../flowchart'
import { renderMarkdownFragment } from '../markdown/fragment'
import { syntaxGuide, type SyntaxExample } from '../markdown/syntaxGuide'
import AppIcon from './AppIcon.vue'

const props = defineProps<{ canInsert: boolean; copy: (source: string) => Promise<void> }>()
const emit = defineEmits<{ close: []; insert: [example: SyntaxExample] }>()
const dialog = ref<HTMLDialogElement | null>(null)
const query = ref('')
const chosen = shallowRef<SyntaxExample>(syntaxGuide[0].examples[0])
const copyStatus = ref('')

const groups = computed(() => {
  const terms = query.value.toLowerCase().trim().split(/\s+/).filter(Boolean)
  return syntaxGuide.map(({ name, examples }) => ({
    name,
    examples: examples.filter(example => {
      const text = [name, example.name, example.keywords, example.source].join(' ').toLowerCase()
      return terms.every(term => text.includes(term))
    }),
  })).filter(group => group.examples.length)
})

const current = computed(() => groups.value.some(group => group.examples.includes(chosen.value))
  ? chosen.value
  : groups.value[0]?.examples[0])
const preview = computed(() => {
  const example = current.value
  if (!example || example.previewText) return ''
  if (example.diagram) return renderSimpleFlowchart(example.diagram) ?? ''
  return renderMarkdownFragment(example.previewSource ?? example.source, url => url === './photo.png' ? logo : url)
})

watch(current, () => { copyStatus.value = '' })
onMounted(() => dialog.value?.showModal())
onBeforeUnmount(() => dialog.value?.close())

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
      <input v-model="query" type="search" autofocus aria-label="搜索 Markdown 语法" placeholder="搜索语法，例如待办、表格、公式" />
    </label>
    <div class="syntax-guide-body">
      <nav v-if="groups.length" class="syntax-guide-nav" aria-label="语法分类">
        <section v-for="group in groups" :key="group.name">
          <h3>{{ group.name }}</h3>
          <button v-for="example in group.examples" :key="example.name" type="button" :aria-current="current === example ? 'true' : undefined" @click="chosen = example">{{ example.name }}</button>
        </section>
      </nav>
      <article v-if="current" class="syntax-guide-example">
        <h3>{{ current.name }}</h3>
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
        <div class="syntax-guide-actions">
          <button type="button" @click="copyExample(current)">复制源码</button>
          <button v-if="canInsert && current.mode !== 'copy'" type="button" class="syntax-guide-insert" @click="emit('insert', current)">插入示例</button>
          <small role="status">{{ copyStatus }}</small>
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
.syntax-guide-search { display: flex; align-items: center; gap: 9px; margin: 0 20px 14px; padding: 0 10px; border: 1px solid var(--border); border-radius: 6px; color: var(--muted); }
.syntax-guide-search:focus-within { outline: 2px solid var(--accent); outline-offset: 1px; }
.syntax-guide-search input { width: 100%; min-width: 0; height: 36px; padding: 0; border: 0; outline: 0; background: transparent; color: var(--ink); font: inherit; }
.syntax-guide-search input::placeholder { color: var(--muted); }
.syntax-guide-body { display: grid; grid-template-columns: 162px minmax(0, 1fr); height: min(460px, max(160px, calc(100dvh - 155px))); border-top: 1px solid var(--border); }
.syntax-guide-nav { overflow: auto; padding: 12px 10px; border-right: 1px solid var(--border); }
.syntax-guide-nav section + section { margin-top: 13px; }
.syntax-guide-nav h3 { margin: 0; padding: 4px 9px; color: var(--muted); font-size: 12px; }
.syntax-guide-nav button { display: block; width: 100%; padding: 6px 9px; border-radius: 5px; background: transparent; text-align: left; }
.syntax-guide-nav button:hover, .syntax-guide-nav button[aria-current] { background: var(--accent-soft); }
.syntax-guide-nav button[aria-current] { box-shadow: inset 3px 0 var(--accent); font-weight: 650; }
.syntax-guide button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.syntax-guide-example { overflow: auto; padding: 19px 20px; }
.syntax-guide-example > h3 { margin: 0; font-size: 18px; }
.syntax-guide-example > p { margin: 6px 0 16px; color: var(--muted); }
.syntax-guide-comparison { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.syntax-guide-comparison > section { min-width: 0; border: 1px solid var(--border); border-radius: 6px; }
.syntax-guide-comparison h4 { margin: 0; padding: 6px 10px; border-bottom: 1px solid var(--border); color: var(--muted); font-size: 12px; }
.syntax-guide-comparison pre, .syntax-guide-preview { margin: 0; padding: 10px; }
.syntax-guide-comparison pre { overflow: auto; background: var(--surface); white-space: pre; }
.syntax-guide-comparison code { font: 13px/1.55 var(--mono-font, monospace); }
.syntax-guide-preview { overflow: auto; overflow-wrap: anywhere; }
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
.syntax-guide-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 14px; }
.syntax-guide-actions button { padding: 5px 10px; border: 1px solid var(--border); border-radius: 5px; background: transparent; }
.syntax-guide-actions button:hover, .syntax-guide-actions .syntax-guide-insert { border-color: var(--accent); background: var(--accent-soft); }
.syntax-guide-actions small { color: var(--muted); }
.syntax-guide-empty { grid-column: 1 / -1; margin: 0; padding: 20px; color: var(--muted); }
@media (max-width: 630px) {
  .syntax-guide-body { grid-template-columns: 110px minmax(0, 1fr); }
  .syntax-guide-comparison { grid-template-columns: minmax(0, 1fr); }
  .syntax-guide-example { padding: 12px; }
}
</style>

<script setup lang="ts">
import { ref, watch } from 'vue'
import type { MoyueTheme } from '../types'
import AppIcon from './AppIcon.vue'

const props = defineProps<{ modelValue: MoyueTheme }>()
const emit = defineEmits<{
  'update:modelValue': [theme: MoyueTheme]
  preview: [theme: MoyueTheme]
  apply: [theme: MoyueTheme]
}>()

const draft = ref<MoyueTheme>(clone(props.modelValue))
const section = ref<'base' | 'color' | 'type' | 'component'>('base')

function clone(theme: MoyueTheme): MoyueTheme {
  return JSON.parse(JSON.stringify(theme)) as MoyueTheme
}

watch(() => props.modelValue, (value) => {
  if (JSON.stringify(value) !== JSON.stringify(draft.value)) draft.value = clone(value)
}, { deep: true })
watch(draft, (value) => {
  const snapshot = clone(value)
  emit('update:modelValue', snapshot)
  emit('preview', snapshot)
}, { deep: true })

function preview() { emit('preview', clone(draft.value)) }
function apply() { emit('apply', clone(draft.value)) }
</script>

<template>
  <div class="theme-editor">
    <div class="editor-head">
      <div>
        <span class="section-kicker">LIVE EDITOR</span>
        <h2>{{ draft.manifest.name }}</h2>
        <small class="editor-subtitle">{{ draft.manifest.description || '为你的长文阅读调一层自己的光。' }}</small>
      </div>
      <div class="toolbar-actions">
        <button class="ghost-button" type="button" @click="preview"><AppIcon name="eye" :size="14" />预览</button>
        <button class="primary-button" type="button" @click="apply"><AppIcon name="check" :size="14" />应用主题</button>
      </div>
    </div>

    <nav class="editor-section-nav" aria-label="主题编辑分区">
      <button :class="{ active: section === 'base' }" type="button" @click="section = 'base'"><span><AppIcon name="info" :size="14" /></span>基础信息</button>
      <button :class="{ active: section === 'color' }" type="button" @click="section = 'color'"><span><AppIcon name="palette" :size="14" /></span>颜色变量</button>
      <button :class="{ active: section === 'type' }" type="button" @click="section = 'type'"><span><AppIcon name="type" :size="14" /></span>排版系统</button>
      <button :class="{ active: section === 'component' }" type="button" @click="section = 'component'"><span><AppIcon name="components" :size="14" /></span>组件样式</button>
    </nav>

    <div class="editor-fields">
      <template v-if="section === 'base'">
        <label>主题名称<input v-model="draft.manifest.name" /></label>
        <label>主题作者<input v-model="draft.manifest.author" /></label>
        <label class="field-wide">主题描述<textarea v-model="draft.manifest.description" rows="3" /></label>
      </template>
      <template v-else-if="section === 'color'">
        <label>主色<input v-model="draft.tokens.color.accent" type="color" /></label>
        <label>应用背景<input v-model="draft.tokens.color.appBackground" type="color" /></label>
        <label>阅读表面<input v-model="draft.tokens.color.surface" type="color" /></label>
        <label>正文色<input v-model="draft.tokens.color.text" type="color" /></label>
        <label>代码背景<input v-model="draft.tokens.color.codeBackground" type="color" /></label>
      </template>
      <template v-else-if="section === 'type'">
        <label>阅读宽度<input v-model.number="draft.tokens.reader.width" type="range" min="620" max="980" step="10" /><output>{{ draft.tokens.reader.width }} px</output></label>
        <label>字号<input v-model.number="draft.tokens.reader.fontSize" type="range" min="15" max="24" step="1" /><output>{{ draft.tokens.reader.fontSize }} px</output></label>
        <label>行距<input v-model.number="draft.tokens.reader.lineHeight" type="range" min="1.4" max="2.2" step="0.05" /><output>{{ draft.tokens.reader.lineHeight }}</output></label>
        <label class="field-wide">字体<input v-model="draft.tokens.reader.fontFamily" /></label>
      </template>
      <template v-else>
        <div class="editor-note"><strong>组件样式</strong><span>V1 通过 Token 控制导航、卡片、代码、Mermaid 和专注阅读的共同气候，不加载主题脚本。</span></div>
      </template>
    </div>

    <div class="theme-preview">
      <span class="section-kicker">REAL-TIME PREVIEW</span>
      <h3>一段值得停留的文字</h3>
      <p>主题不是表面装饰，而是内容与注意力之间的缓冲层。调节颜色、宽度和字体，让它更像你的阅读空间。</p>
      <code>const focus = region =&gt; reader.enter(focus)</code>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { MoyueTheme } from '../types'
import AppIcon from './AppIcon.vue'

const props = withDefaults(defineProps<{
  themes: MoyueTheme[]
  selectedThemeId?: string | null
  compact?: boolean
}>(), { compact: false })

const emit = defineEmits<{
  select: [theme: MoyueTheme]
}>()

const cardCopy: Record<string, { kicker: string; mark: string; title: string; caption: string }> = {
  'ember-paper': { kicker: '月下 · 深蓝', mark: '月', title: '月影', caption: '冷月照纸' },
  'quiet-moss': { kicker: '苔色 · 静读', mark: '苔', title: '苔原', caption: '静默生长' },
  'paper-white': { kicker: '素纸 · 清读', mark: '白', title: '白纸', caption: '留给文字的空白' },
  'blue-hour': { kicker: '深青 · 技术', mark: '潮', title: '蓝调', caption: '夜色里的清晰' },
  'xuan-paper': { kicker: '宣纸 · 淡墨', mark: '印', title: '淡墨', caption: '一纸安静' },
  'inkstone': { kicker: '砚台 · 浓墨', mark: '砚', title: '浓墨', caption: '夜读不惊' },
  'bamboo-shadow': { kicker: '竹影 · 烟雨', mark: '竹', title: '竹影', caption: '风过有声' },
  'cinnabar-scroll': { kicker: '朱印 · 小笺', mark: '印', title: '小笺', caption: '写下要紧的事' },
}

function selectTheme(theme: MoyueTheme) {
  emit('select', theme)
}

function previewCopy(theme: MoyueTheme) {
  return cardCopy[theme.manifest.id] ?? { kicker: 'Moyue · 阅读', mark: '阅', title: theme.manifest.name, caption: '为文字留一处安静' }
}

function themeVars(theme: MoyueTheme) {
  const { color } = theme.tokens
  return {
    '--theme-bg': color.appBackground,
    '--theme-surface': color.surface,
    '--theme-surface-raised': color.surfaceRaised,
    '--theme-ink': color.text,
    '--theme-muted': color.textMuted,
    '--theme-accent': color.accent,
  }
}
</script>

<template>
  <div v-if="props.compact" class="theme-picker-compact" aria-label="阅读主题">
    <button v-for="theme in props.themes" :key="theme.manifest.id" class="theme-mini-option" :class="[`theme-mini-option-${theme.manifest.id}`, { selected: props.selectedThemeId === theme.manifest.id }]" :style="themeVars(theme)" type="button" :aria-pressed="props.selectedThemeId === theme.manifest.id" :title="`切换到${theme.manifest.name}`" @click="selectTheme(theme)">
      <span class="theme-mini-option-art"><i /><b>{{ theme.manifest.name.slice(0, 1) }}</b></span>
      <span class="theme-mini-option-copy"><strong>{{ theme.manifest.name }}</strong><small>{{ theme.manifest.mode === 'light' ? '白昼阅读' : '夜间阅读' }}</small></span>
      <span class="theme-mini-option-check" aria-hidden="true"><AppIcon name="check" :size="10" :stroke-width="2.2" /></span>
    </button>
  </div>

  <div v-else class="theme-picker-gallery">
    <button v-for="theme in props.themes" :key="theme.manifest.id" class="theme-card" :class="[`theme-card-${theme.manifest.id}`, { selected: props.selectedThemeId === theme.manifest.id }]" :style="themeVars(theme)" type="button" @click="selectTheme(theme)">
      <div class="theme-swatch">
        <span class="swatch-line" />
        <span class="theme-card-kicker">{{ previewCopy(theme).kicker }}</span>
        <span class="theme-card-mark" aria-hidden="true">{{ previewCopy(theme).mark }}</span>
        <div class="theme-card-copy"><strong>{{ previewCopy(theme).title }}</strong><small>{{ previewCopy(theme).caption }}</small></div>
      </div>
      <div class="theme-card-meta"><span>{{ theme.manifest.name }}</span><span>{{ props.selectedThemeId === theme.manifest.id ? '当前使用' : theme.manifest.mode === 'light' ? '浅色' : '深色' }}</span></div>
    </button>
  </div>
</template>

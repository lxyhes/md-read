<script setup lang="ts">
import type { MoyueTheme } from '../types'

const props = withDefaults(defineProps<{
  themes: MoyueTheme[]
  selectedThemeId?: string | null
  compact?: boolean
}>(), { compact: false })

const emit = defineEmits<{
  select: [theme: MoyueTheme]
}>()

function selectTheme(theme: MoyueTheme) {
  emit('select', theme)
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
      <span class="theme-mini-option-check">✓</span>
    </button>
  </div>

  <div v-else class="theme-picker-gallery">
    <button v-for="theme in props.themes" :key="theme.manifest.id" class="theme-card" :class="[`theme-card-${theme.manifest.id}`, { selected: props.selectedThemeId === theme.manifest.id }]" :style="themeVars(theme)" type="button" @click="selectTheme(theme)">
      <div class="theme-swatch"><span class="swatch-line" /><strong>墨阅</strong><small>{{ theme.manifest.name }}</small></div>
      <div class="theme-card-meta"><span>{{ theme.manifest.name }}</span><span>{{ props.selectedThemeId === theme.manifest.id ? '当前使用' : theme.manifest.mode === 'light' ? '浅色' : '深色' }}</span></div>
    </button>
  </div>
</template>

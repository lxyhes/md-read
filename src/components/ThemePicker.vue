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
</script>

<template>
  <div v-if="props.compact" class="theme-picker-compact" aria-label="阅读主题">
    <button v-for="theme in props.themes" :key="theme.manifest.id" class="theme-mini-option" :class="{ selected: props.selectedThemeId === theme.manifest.id }" type="button" :aria-pressed="props.selectedThemeId === theme.manifest.id" :title="`切换到${theme.manifest.name}`" @click="selectTheme(theme)">
      <span class="theme-mini-option-art" :style="{ '--theme-bg': theme.tokens.color.appBackground, '--theme-accent': theme.tokens.color.accent, '--theme-surface': theme.tokens.color.surface }"><i /><b>{{ theme.manifest.name.slice(0, 1) }}</b></span>
      <span class="theme-mini-option-copy"><strong>{{ theme.manifest.name }}</strong><small>{{ theme.manifest.mode === 'light' ? '白昼阅读' : '夜间阅读' }}</small></span>
      <span class="theme-mini-option-check">✓</span>
    </button>
  </div>

  <div v-else class="theme-picker-gallery">
    <button v-for="theme in props.themes" :key="theme.manifest.id" class="theme-card" :class="{ selected: props.selectedThemeId === theme.manifest.id }" type="button" @click="selectTheme(theme)">
      <div class="theme-swatch" :style="{ background: theme.tokens.color.appBackground, color: theme.tokens.color.text, '--theme-accent': theme.tokens.color.accent }"><span class="swatch-line" :style="{ background: theme.tokens.color.accent }" /><strong>墨阅</strong><small>{{ theme.manifest.name }}</small></div>
      <div class="theme-card-meta"><span>{{ theme.manifest.name }}</span><span>{{ theme.manifest.mode }}</span></div>
    </button>
  </div>
</template>

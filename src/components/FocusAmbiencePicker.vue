<script setup lang="ts">
import { computed } from 'vue'
import type { MoyueTheme } from '../types'
import AppIcon from './AppIcon.vue'

const props = defineProps<{ themes: MoyueTheme[]; selectedThemeId: string }>()
const emit = defineEmits<{ select: [theme: MoyueTheme] }>()

const options = computed(() => props.themes.slice(0, 3))
const current = computed(() => options.value.find((theme) => theme.manifest.id === props.selectedThemeId) ?? options.value[0])

function themeStyle(theme: MoyueTheme) {
  const { color } = theme.tokens
  return {
    '--ambience-accent': color.accent,
    '--ambience-border': color.border,
    '--ambience-surface': color.surface,
    '--ambience-ink': color.text,
    '--ambience-preview': color.appBackground,
  }
}
</script>

<template>
  <div class="focus-card ambience-card">
    <div class="focus-card-heading">
      <span>阅读主题</span>
      <small>当前 · {{ current?.manifest.name || '默认主题' }}</small>
    </div>
    <div class="ambience-grid">
      <button
        v-for="theme in options"
        :key="theme.manifest.id"
        type="button"
        class="ambience-option"
        :class="[`ambience-option-${theme.manifest.id}`, { selected: props.selectedThemeId === theme.manifest.id }]"
        :style="themeStyle(theme)"
        :aria-pressed="props.selectedThemeId === theme.manifest.id"
        :title="`切换到${theme.manifest.name}`"
        @click="emit('select', theme)"
      >
        <span class="ambience-preview" aria-hidden="true"><i /><i /><i /></span>
        <span class="ambience-copy"><b>{{ theme.manifest.name }}</b><small>{{ theme.manifest.mode === 'light' ? '白昼阅读' : '夜间阅读' }}</small></span>
        <span class="ambience-check" aria-hidden="true"><AppIcon name="check" :size="10" /></span>
      </button>
    </div>
  </div>
</template>

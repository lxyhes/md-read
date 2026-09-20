<script setup lang="ts">
import { computed, ref } from 'vue'
import { exportTheme, importTheme } from '../themes'
import type { MoyueTheme } from '../types'
import ThemeEditor from './ThemeEditor.vue'
import ThemePicker from './ThemePicker.vue'
import AppIcon from './AppIcon.vue'

const props = defineProps<{
  themes: MoyueTheme[]
  activeThemeId: string
  activeTheme: MoyueTheme
}>()
const emit = defineEmits<{
  apply: [theme: MoyueTheme]
  install: [theme: MoyueTheme]
  notify: [message: string]
}>()

const themeTab = ref<'official' | 'mine'>('official')
const themeSearch = ref('')
const themeModeFilter = ref<'all' | 'dark' | 'light'>('all')
const themeDraft = ref<MoyueTheme | null>(null)
const themeInput = ref<HTMLInputElement | null>(null)

const filteredThemes = computed(() => {
  const needle = themeSearch.value.trim().toLowerCase()
  return props.themes.filter((theme) => {
    const matchesTab = themeTab.value === 'official' ? theme.builtIn !== false : theme.builtIn === false
    const matchesMode = themeModeFilter.value === 'all' || theme.manifest.mode === themeModeFilter.value
    return matchesTab && matchesMode && (!needle || `${theme.manifest.name} ${theme.manifest.description ?? ''} ${theme.manifest.author}`.toLowerCase().includes(needle))
  })
})

function clone(theme: MoyueTheme): MoyueTheme { return JSON.parse(JSON.stringify(theme)) as MoyueTheme }
function startThemeEdit(theme: MoyueTheme) { themeDraft.value = clone(theme) }
function createCustomTheme() {
  const base = clone(props.activeTheme)
  startThemeEdit({
    ...base,
    builtIn: false,
    manifest: { ...base.manifest, id: `custom-${Date.now()}`, name: '未命名主题', version: '0.1.0', author: '我' },
  })
}
function applyDraft(theme: MoyueTheme) { emit('apply', theme) }
function saveDraft(theme: MoyueTheme) { emit('install', theme); emit('apply', theme); emit('notify', '主题已应用') }
function downloadTheme() {
  if (!themeDraft.value) return
  const url = URL.createObjectURL(exportTheme(themeDraft.value))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${themeDraft.value.manifest.id}.moyue-theme`
  anchor.click()
  URL.revokeObjectURL(url)
  emit('notify', '主题包已导出')
}
async function onThemeFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const theme = { ...(await importTheme(file)), builtIn: false }
    emit('install', theme)
    startThemeEdit(theme)
    emit('notify', '主题包已安装')
  } catch (error) {
    emit('notify', error instanceof Error ? error.message : '主题包无效')
  } finally { input.value = '' }
}
</script>

<template>
  <section class="page themes-page">
    <div class="page-heading">
      <div><p class="section-kicker">THEME PACKAGE SYSTEM</p><h1>主题，让阅读<br /><em>拥有自己的气候。</em></h1></div>
      <div class="toolbar-actions">
        <input ref="themeInput" type="file" accept=".moyue-theme,.zip" hidden @change="onThemeFile" />
        <button class="ghost-button" type="button" @click="themeInput?.click()"><AppIcon name="download" :size="14" />导入主题包</button>
        <button class="primary-button" type="button" :disabled="!themeDraft" @click="downloadTheme"><AppIcon name="download" :size="14" />导出当前主题</button>
      </div>
    </div>
    <div class="theme-center-toolbar">
      <div class="segmented-tabs">
        <button :class="{ active: themeTab === 'official' }" type="button" @click="themeTab = 'official'">官方主题</button>
        <button type="button" @click="emit('notify', '社区主题市场暂未开放')">社区主题</button>
        <button :class="{ active: themeTab === 'mine' }" type="button" @click="themeTab = 'mine'">我的主题</button>
      </div>
      <label class="theme-search"><AppIcon name="search" :size="14" /><input v-model="themeSearch" placeholder="搜索主题、风格、作者…" /></label>
      <select v-model="themeModeFilter" class="theme-filter" aria-label="主题风格"><option value="all">全部风格</option><option value="dark">深色阅读</option><option value="light">浅色阅读</option></select>
    </div>
    <div class="theme-layout">
      <div class="theme-gallery">
        <ThemePicker :themes="filteredThemes" :selected-theme-id="themeDraft?.manifest.id ?? props.activeThemeId" @select="startThemeEdit" />
        <button class="theme-card create-theme" type="button" @click="createCustomTheme"><span><AppIcon name="plus" :size="22" /></span><small>创建新主题</small></button>
      </div>
      <ThemeEditor v-if="themeDraft" v-model="themeDraft" @preview="applyDraft" @apply="saveDraft" />
      <div v-else class="theme-empty-state"><span><AppIcon name="sparkle" :size="30" /></span><strong>选择一个主题开始编辑</strong><small>颜色、宽度、字号和阅读气候都会实时预览</small></div>
    </div>
  </section>
</template>

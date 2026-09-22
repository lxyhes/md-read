<script setup lang="ts">
import { computed } from 'vue'
import { fontPresets } from '../fonts'

const props = withDefaults(defineProps<{
  modelValue: string
  fallbackFamily: string
  label: string
  defaultLabel?: string
  compact?: boolean
}>(), { defaultLabel: '跟随主题', compact: false })
const emit = defineEmits<{ 'update:modelValue': [family: string] }>()
const custom = computed(() => props.modelValue && !fontPresets.some((font) => font.family === props.modelValue))
</script>

<template>
  <div class="font-picker" :class="{ 'font-picker-compact': compact }">
    <label class="font-select-label">
      <span>{{ label }}</span>
      <select :value="modelValue" :aria-label="label" @keydown.stop @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)">
        <option value="">{{ defaultLabel }}</option>
        <option v-for="font in fontPresets" :key="font.id" :value="font.family">{{ font.name }}</option>
        <option v-if="custom" :value="modelValue">自定义字体</option>
      </select>
    </label>
    <template v-if="!compact">
      <p class="font-picker-note">使用本机字体；未安装时自动使用同类字体。选择后立即生效并保存。</p>
      <div class="font-samples" :aria-label="`${label}样张`">
        <button v-for="font in fontPresets" :key="font.id" type="button" class="font-sample"
          :aria-pressed="modelValue === font.family" :aria-label="`选择${font.name}`"
          @click="emit('update:modelValue', font.family)">
          <span class="font-sample-heading"><strong>{{ font.name }}</strong><span>{{ modelValue === font.family ? '已选' : 'Aa' }}</span></span>
          <span class="font-sample-text" :style="{ fontFamily: font.family }">字里行间，自有天地</span>
          <small>{{ font.note }}</small>
        </button>
      </div>
      <div class="font-reading-preview" :style="{ fontFamily: modelValue || fallbackFamily }">
        <span class="font-preview-label">{{ label }}预览</span>
        <p>雨停了，窗外的树叶还在滴水。我把书翻回上一页，接着读那段没有读完的文字。</p>
        <p lang="en">Read at your own pace. Chapter 01 · 2026</p>
      </div>
    </template>
  </div>
</template>

<style scoped>
.font-picker { min-width: 0; color: var(--ink); font: 12px/1.5 var(--ui-font); }
.font-select-label { display: flex; align-items: center; gap: 12px; color: var(--muted); }
.font-select-label > span { flex-shrink: 0; }
.font-select-label select { min-width: 154px; max-width: 100%; padding: 8px 30px 8px 10px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface-raised); color: var(--ink); font: inherit; }
.font-select-label select:focus-visible, .font-sample:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.font-picker-note { margin: 12px 0 18px; color: var(--muted); font-size: 11px; }
.font-samples { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.font-sample { display: grid; gap: 14px; min-width: 0; padding: 15px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface-raised); color: var(--ink); text-align: left; }
.font-sample:hover { border-color: var(--accent); }
.font-sample[aria-pressed="true"] { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 7%, var(--surface-raised)); }
.font-sample-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; font: 12px var(--ui-font); }
.font-sample-heading strong { font-weight: 500; }
.font-sample-heading > span { color: var(--accent); font-size: 10px; }
.font-sample-text { font-size: 18px; line-height: 1.6; overflow-wrap: anywhere; }
.font-sample > small { color: var(--muted); font: 10px/1.5 var(--ui-font); }
.font-reading-preview { margin-top: 20px; padding: 18px 22px; border-left: 2px solid var(--accent); background: var(--app-bg); color: var(--ink); }
.font-preview-label { color: var(--muted); font: 10px var(--ui-font); }
.font-reading-preview p { margin: 12px 0 0; font-size: var(--reader-size, 18px); line-height: var(--reader-leading, 1.8); }
.font-reading-preview p[lang="en"] { margin-top: 7px; font-size: 16px; }
.font-picker-compact { flex-shrink: 0; }
.font-picker-compact .font-select-label { gap: 7px; font-size: 11px; }
.font-picker-compact select { min-width: 118px; padding: 5px 8px; }
@media (max-width: 1180px) { .font-samples { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>

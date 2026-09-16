<script setup lang="ts">
import { computed } from 'vue'
import type { FocusAmbienceId } from '../types'

const props = defineProps<{ modelValue: FocusAmbienceId }>()
const emit = defineEmits<{ 'update:modelValue': [value: FocusAmbienceId] }>()

const options: Array<{ id: FocusAmbienceId; name: string; hint: string }> = [
  { id: 'moonlit', name: '山湖夜色', hint: '安静' },
  { id: 'forest', name: '森林细雨', hint: '清醒' },
  { id: 'fire', name: '篝火氛围', hint: '温暖' },
]

const current = computed(() => options.find((item) => item.id === props.modelValue) ?? options[0])

function select(id: FocusAmbienceId) {
  localStorage.setItem('moyue:focus-ambience', id)
  emit('update:modelValue', id)
}
</script>

<template>
  <div class="focus-card ambience-card">
    <div class="focus-card-heading">
      <span>沉浸氛围</span>
      <small>当前 · {{ current.name }}</small>
    </div>
    <div class="ambience-grid">
      <button
        v-for="item in options"
        :key="item.id"
        type="button"
        :class="['ambience-option', `ambience-${item.id}`, { selected: props.modelValue === item.id }]"
        :aria-pressed="props.modelValue === item.id"
        :title="`切换到${item.name}`"
        @click="select(item.id)"
      >
        <span class="ambience-preview" aria-hidden="true"><i /><i /><i /></span>
        <span class="ambience-copy"><b>{{ item.name }}</b><small>{{ item.hint }}</small></span>
        <span class="ambience-check" aria-hidden="true">✓</span>
      </button>
    </div>
  </div>
</template>

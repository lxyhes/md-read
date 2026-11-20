<script setup lang="ts">
withDefaults(defineProps<{
  label: string
  layout?: 'list' | 'compact' | 'text'
  rows?: number
}>(), { layout: 'list', rows: 4 })
</script>

<template>
  <div class="content-skeleton" :class="`content-skeleton--${layout}`" role="status">
    <span class="content-skeleton-label">{{ label }}</span>
    <div v-for="row in rows" :key="row" class="content-skeleton-row" aria-hidden="true">
      <span v-if="layout !== 'text'" class="content-skeleton-shape content-skeleton-icon" />
      <div class="content-skeleton-lines">
        <span class="content-skeleton-shape" />
        <span v-if="layout === 'list'" class="content-skeleton-shape content-skeleton-short" />
      </div>
      <span v-if="layout === 'list'" class="content-skeleton-shape content-skeleton-meta" />
    </div>
  </div>
</template>

<style scoped>
.content-skeleton-label {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
.content-skeleton-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 54px;
  padding: 8px;
  border-bottom: 1px solid var(--border);
}
.content-skeleton-lines { display: grid; flex: 1; min-width: 0; gap: 6px; }
.content-skeleton-shape {
  display: block;
  width: 86%;
  height: 9px;
  border-radius: 5px;
  background: color-mix(in srgb, var(--ink, #252525) 10%, transparent);
  animation: content-skeleton-pulse 1.6s ease-in-out infinite alternate;
}
.content-skeleton-row:nth-of-type(even) .content-skeleton-lines > :first-child { width: 69%; }
.content-skeleton-short { width: 38%; height: 7px; }
.content-skeleton-icon { flex: 0 0 26px; width: 26px; height: 30px; border-radius: 6px; }
.content-skeleton-meta { flex: 0 0 clamp(16px, 11%, 62px); height: 8px; }
.content-skeleton--compact .content-skeleton-row { min-height: 28px; padding: 4px 8px 4px 0; border: 0; }
.content-skeleton--compact .content-skeleton-icon { flex-basis: 13px; width: 13px; height: 13px; border-radius: 3px; }
.content-skeleton--text .content-skeleton-row { min-height: 22px; padding: 5px 0; border: 0; }
.content-skeleton--text .content-skeleton-row:last-child .content-skeleton-shape { width: 42%; }

@keyframes content-skeleton-pulse { from { opacity: .62; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .content-skeleton-shape { animation: none; }
}
</style>

<script setup lang="ts">
import logoAsset from '../assets/moyue-logo-256.png'

export type AppIconName =
  | 'logo'
  | 'home'
  | 'library'
  | 'history'
  | 'star'
  | 'sparkle'
  | 'note'
  | 'palette'
  | 'plugin'
  | 'settings'
  | 'focus'
  | 'eye'
  | 'fullscreen'
  | 'file'
  | 'trash'
  | 'close'
  | 'plus'
  | 'minus'
  | 'search'
  | 'external'
  | 'reader'
  | 'sync'
  | 'expand'
  | 'more'
  | 'download'
  | 'copy'
  | 'edit'
  | 'check'
  | 'chevron-up'
  | 'chevron-down'
  | 'chevron-right'
  | 'code'
  | 'table'
  | 'image'
  | 'info'
  | 'type'
  | 'components'

withDefaults(defineProps<{ name: AppIconName; size?: number; strokeWidth?: number }>(), {
  size: 16,
  strokeWidth: 1.8,
})
</script>

<template>
  <img v-if="name === 'logo'" class="app-icon app-icon-logo" :src="logoAsset" :width="size" :height="size" alt="" aria-hidden="true" />
  <svg
    v-else
    class="app-icon"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <template v-if="name === 'home'">
      <path d="m3.5 10.7 8.5-7 8.5 7" />
      <path d="M5.5 9.8v9.7h13V9.8M9.5 19.5v-5h5v5" />
    </template>
    <template v-else-if="name === 'library'">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </template>
    <template v-else-if="name === 'history'">
      <path d="M4.5 11a7.5 7.5 0 1 0 2.2-5.3" />
      <path d="M4.5 5.5v4h4" />
      <path d="M12 7.7V12l3 1.8" />
    </template>
    <template v-else-if="name === 'star'">
      <path d="m12 3 2.7 5.4 5.9.9-4.3 4.2 1 5.8-5.3-2.8-5.3 2.8 1-5.8-4.3-4.2 5.9-.9L12 3Z" />
    </template>
    <template v-else-if="name === 'sparkle'">
      <path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Z" />
      <path d="m19 16 .6 1.9L21.5 18l-1.9.6L19 20.5l-.6-1.9-1.9-.6 1.9-.6L19 16Z" />
    </template>
    <template v-else-if="name === 'note'">
      <path d="M5 3.5h10l4 4v13H5v-17Z" />
      <path d="M14 3.5v4h5M8 12h8M8 16h5" />
    </template>
    <template v-else-if="name === 'palette'">
      <path d="M12 4a8 8 0 1 0 0 16h1.2a1.8 1.8 0 0 0 1.3-3.1 1.8 1.8 0 0 1 1.3-3.1H17a3 3 0 0 0 3-3A6.8 6.8 0 0 0 12 4Z" />
      <circle cx="8" cy="10" r=".8" fill="currentColor" stroke="none" />
      <circle cx="11" cy="7.7" r=".8" fill="currentColor" stroke="none" />
      <circle cx="15" cy="8" r=".8" fill="currentColor" stroke="none" />
    </template>
    <template v-else-if="name === 'plugin'">
      <path d="M9 3v4H7a2 2 0 0 0-2 2v2h4v4H5v2a2 2 0 0 0 2 2h2v-4h4v4h2a2 2 0 0 0 2-2v-2h-4v-4h4V9a2 2 0 0 0-2-2h-2V3H9Z" />
    </template>
    <template v-else-if="name === 'settings'">
      <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" />
      <path d="m19.4 15 .1.1a2 2 0 0 1-2.8 2.8l-.1-.1a2 2 0 0 0-3.4 1.4v.2a2 2 0 0 1-4 0v-.2a2 2 0 0 0-3.4-1.4l-.1.1a2 2 0 0 1-2.8-2.8l.1-.1A2 2 0 0 0 3.7 12a2 2 0 0 0-.7-1.5 2 2 0 0 1 2.8-2.8l.1.1A2 2 0 0 0 9.3 6.4v-.2a2 2 0 0 1 4 0v.2a2 2 0 0 0 3.4 1.4l.1-.1a2 2 0 0 1 2.8 2.8l-.1.1A2 2 0 0 0 20.3 12a2 2 0 0 0-.9 3Z" />
    </template>
    <template v-else-if="name === 'focus'">
      <circle cx="12" cy="12" r="6.5" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2" />
    </template>
    <template v-else-if="name === 'eye'">
      <path d="M3.5 12s3-5 8.5-5 8.5 5 8.5 5-3 5-8.5 5-8.5-5-8.5-5Z" />
      <circle cx="12" cy="12" r="2.2" />
    </template>
    <template v-else-if="name === 'fullscreen'">
      <path d="M8 4H4v4M16 4h4v4M8 20H4v-4M20 16v4h-4" />
    </template>
    <template v-else-if="name === 'file'">
      <path d="M6 3.5h8l4 4v13H6v-17Z" />
      <path d="M14 3.5v4h4" />
    </template>
    <template v-else-if="name === 'trash'">
      <path d="M5 7h14M10 4h4l1 3H9l1-3ZM7 7l.8 13h8.4L17 7M10 10.5v6M14 10.5v6" />
    </template>
    <template v-else-if="name === 'close'">
      <path d="m6 6 12 12M18 6 6 18" />
    </template>
    <template v-else-if="name === 'plus'">
      <path d="M12 5v14M5 12h14" />
    </template>
    <template v-else-if="name === 'minus'">
      <path d="M5 12h14" />
    </template>
    <template v-else-if="name === 'search'">
      <circle cx="10.8" cy="10.8" r="6.4" />
      <path d="m16 16 4.2 4.2" />
    </template>
    <template v-else-if="name === 'external'">
      <path d="M13 5h6v6M19 5l-8 8" />
      <path d="M18 13v5.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H11" />
    </template>
    <template v-else-if="name === 'reader'">
      <path d="M5 4.5h10l4 4v11H5v-15Z" />
      <path d="M15 4.5v4h4M8 12h8M8 15.5h5" />
    </template>
    <template v-else-if="name === 'sync'">
      <path d="M20 7v4h-4M4 17v-4h4" />
      <path d="M18.2 11A6.5 6.5 0 0 0 6.1 7.4L4 9M5.8 13A6.5 6.5 0 0 0 17.9 16.6L20 15" />
    </template>
    <template v-else-if="name === 'expand'">
      <path d="m9 5-4 4M5 5v4h4M15 19l4-4M19 19v-4h-4" />
    </template>
    <template v-else-if="name === 'more'">
      <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" />
    </template>
    <template v-else-if="name === 'download'">
      <path d="M12 3v11M8 10l4 4 4-4M5 19h14" />
    </template>
    <template v-else-if="name === 'copy'">
      <rect x="8" y="8" width="11" height="12" rx="1.5" />
      <path d="M6 16H5a1.5 1.5 0 0 1-1.5-1.5v-9A1.5 1.5 0 0 1 5 4h8.5A1.5 1.5 0 0 1 15 5.5V7" />
    </template>
    <template v-else-if="name === 'edit'">
      <path d="m5 16-.8 4 4-.8L19 8.4 15.6 5 5 16Z" />
      <path d="m13.8 6.8 3.4 3.4M4.2 20h4" />
    </template>
    <template v-else-if="name === 'check'">
      <path d="m5 12.5 4.2 4.2L19 7" />
    </template>
    <template v-else-if="name === 'chevron-up'">
      <path d="m6 14 6-6 6 6" />
    </template>
    <template v-else-if="name === 'chevron-down'">
      <path d="m6 10 6 6 6-6" />
    </template>
    <template v-else-if="name === 'chevron-right'">
      <path d="m9 6 6 6-6 6" />
    </template>
    <template v-else-if="name === 'code'">
      <path d="m9 7-5 5 5 5M15 7l5 5-5 5" />
    </template>
    <template v-else-if="name === 'table'">
      <rect x="4" y="5" width="16" height="14" rx="1.5" />
      <path d="M4 10h16M4 14.5h16M10 5v14" />
    </template>
    <template v-else-if="name === 'image'">
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.3" />
      <path d="m5.5 17 4.2-4 3 2.5 2.1-2 3.7 3.5" />
    </template>
    <template v-else-if="name === 'info'">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 10.5v5M12 7.5v.2" />
    </template>
    <template v-else-if="name === 'type'">
      <path d="M5 5h14M12 5v14M8 19h8" />
    </template>
    <template v-else-if="name === 'components'">
      <rect x="4" y="4" width="6" height="6" rx="1" />
      <rect x="14" y="4" width="6" height="6" rx="1" />
      <rect x="4" y="14" width="6" height="6" rx="1" />
      <rect x="14" y="14" width="6" height="6" rx="1" />
    </template>
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  AimOutlined,
  AlignLeftOutlined,
  AppstoreOutlined,
  ArrowDownOutlined,
  ArrowUpOutlined,
  BoldOutlined,
  BookOutlined,
  CheckCircleOutlined,
  CheckOutlined,
  CloseOutlined,
  CodeOutlined,
  CompressOutlined,
  CopyOutlined,
  DeleteOutlined,
  DoubleRightOutlined,
  DownOutlined,
  DownloadOutlined,
  EditOutlined,
  EllipsisOutlined,
  ExpandAltOutlined,
  ExportOutlined,
  EyeOutlined,
  FileOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  FolderOutlined,
  FontSizeOutlined,
  FullscreenExitOutlined,
  FullscreenOutlined,
  HistoryOutlined,
  HomeOutlined,
  InfoCircleOutlined,
  ItalicOutlined,
  LeftOutlined,
  LinkOutlined,
  MinusOutlined,
  OrderedListOutlined,
  PictureOutlined,
  PlusOutlined,
  ProfileOutlined,
  PushpinFilled,
  PushpinOutlined,
  ReadOutlined,
  RightOutlined,
  ScissorOutlined,
  SearchOutlined,
  SettingOutlined,
  SnippetsOutlined,
  StarFilled,
  StarOutlined,
  SyncOutlined,
  TableOutlined,
  UnorderedListOutlined,
  UpOutlined,
  UploadOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
} from '@ant-design/icons-vue'
import logoAsset from '../assets/moyue-logo-256.png'

const icons = {
  home: HomeOutlined,
  library: BookOutlined,
  folder: FolderOutlined,
  'folder-open': FolderOpenOutlined,
  clipboard: ProfileOutlined,
  history: HistoryOutlined,
  star: StarOutlined,
  'star-filled': StarFilled,
  pin: PushpinOutlined,
  'pin-filled': PushpinFilled,
  note: FileTextOutlined,
  settings: SettingOutlined,
  focus: AimOutlined,
  eye: EyeOutlined,
  fullscreen: FullscreenOutlined,
  'fullscreen-exit': FullscreenExitOutlined,
  file: FileOutlined,
  trash: DeleteOutlined,
  close: CloseOutlined,
  plus: PlusOutlined,
  minus: MinusOutlined,
  search: SearchOutlined,
  external: ExportOutlined,
  reader: ReadOutlined,
  sync: SyncOutlined,
  expand: ExpandAltOutlined,
  fit: CompressOutlined,
  'zoom-in': ZoomInOutlined,
  'zoom-out': ZoomOutOutlined,
  more: EllipsisOutlined,
  download: DownloadOutlined,
  upload: UploadOutlined,
  copy: CopyOutlined,
  edit: EditOutlined,
  check: CheckOutlined,
  'chevron-up': UpOutlined,
  'chevron-down': DownOutlined,
  'chevron-left': LeftOutlined,
  'chevron-right': RightOutlined,
  'chevrons-right': DoubleRightOutlined,
  'arrow-up': ArrowUpOutlined,
  'arrow-down': ArrowDownOutlined,
  code: CodeOutlined,
  table: TableOutlined,
  image: PictureOutlined,
  info: InfoCircleOutlined,
  type: FontSizeOutlined,
  components: AppstoreOutlined,
  cut: ScissorOutlined,
  paste: SnippetsOutlined,
  bold: BoldOutlined,
  italic: ItalicOutlined,
  link: LinkOutlined,
  quote: AlignLeftOutlined,
  'ordered-list': OrderedListOutlined,
  'unordered-list': UnorderedListOutlined,
  'task-list': CheckCircleOutlined,
}

export type AppIconName = keyof typeof icons | 'logo' | 'sparkle' | 'palette' | 'plugin'

const props = withDefaults(defineProps<{ name: AppIconName; size?: number }>(), { size: 16 })
const frameworkIcon = computed(() => {
  const { name } = props
  if (name === 'logo' || name === 'sparkle' || name === 'palette' || name === 'plugin') return undefined
  return icons[name]
})
</script>

<template>
  <img v-if="name === 'logo'" class="app-icon app-icon-logo" :src="logoAsset" :width="size" :height="size" alt="" aria-hidden="true" />
  <component
    :is="frameworkIcon"
    v-else-if="frameworkIcon"
    class="app-icon app-icon-vector"
    :data-icon="name"
    :style="{ '--app-icon-size': size + 'px' }"
    aria-hidden="true"
  />
  <svg
    v-else
    class="app-icon app-icon-vector"
    :data-icon="name"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.75"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <template v-if="name === 'sparkle'">
      <path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Z" />
      <path d="m19 16 .6 1.9L21.5 18l-1.9.6L19 20.5l-.6-1.9-1.9-.6 1.9-.6L19 16Z" />
    </template>
    <template v-else-if="name === 'palette'">
      <path d="M12 4a8 8 0 1 0 0 16h1.2a1.8 1.8 0 0 0 1.3-3.1 1.8 1.8 0 0 1 1.3-3.1H17a3 3 0 0 0 3-3A6.8 6.8 0 0 0 12 4Z" />
      <circle cx="8" cy="10" r=".8" fill="currentColor" stroke="none" />
      <circle cx="11" cy="7.7" r=".8" fill="currentColor" stroke="none" />
      <circle cx="15" cy="8" r=".8" fill="currentColor" stroke="none" />
    </template>
    <template v-else-if="name === 'plugin'">
      <path d="M9 5V4a2 2 0 0 1 4 0v1h5a1 1 0 0 1 1 1v4h1a2 2 0 0 1 0 4h-1v5a1 1 0 0 1-1 1h-4v-1a2 2 0 0 0-4 0v1H5a1 1 0 0 1-1-1v-5h1a2 2 0 0 0 0-4H4V6a1 1 0 0 1 1-1h4Z" />
    </template>
  </svg>
</template>

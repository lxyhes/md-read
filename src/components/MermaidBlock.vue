<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useReaderStore } from '../stores/reader'
import { renderSimpleFlowchart } from '../flowchart'
import AppIcon from './AppIcon.vue'

const mermaidCache = new Map<string, Promise<string>>()
const MERMAID_CACHE_LIMIT = 64
let mermaidModule: Promise<typeof import('mermaid')['default']> | null = null
let initializedThemeKey = ''

function loadMermaid() {
  return mermaidModule ??= import('mermaid').then((module) => module.default)
}

const props = defineProps<{ code: string; large?: boolean; themeKey?: string; nativeLabels?: boolean; playFlow?: boolean }>()
const emit = defineEmits<{ click: []; rendered: [] }>()
const store = useReaderStore()
const svg = ref('')
const error = ref('')
const errorDetail = ref('')
const root = ref<HTMLElement | null>(null)
const diagramRatio = ref(1)
const shouldRender = ref(Boolean(props.large))
let visibilityObserver: IntersectionObserver | null = null
let renderRequest = 0

const diagramVariant = computed(() => {
  if (diagramRatio.value >= 2.1) return 'wide'
  if (diagramRatio.value >= 1.4) return 'landscape'
  return 'compact'
})
const diagramHint = computed(() => diagramVariant.value === 'compact' ? '点击放大阅读' : '完整预览 · 点击查看细节')

function measureDiagram() {
  const element = root.value?.querySelector<SVGSVGElement>('.mermaid-svg svg')
  if (!element) return
  const viewBox = element.getAttribute('viewBox')?.trim().split(/\s+/).map(Number)
  const width = viewBox?.[2] || Number.parseFloat(element.getAttribute('width') || '')
  const height = viewBox?.[3] || Number.parseFloat(element.getAttribute('height') || '')
  diagramRatio.value = width > 0 && height > 0 ? width / height : 1
}

function normalizeMermaidCode(code: string) {
  return code.split(/\r?\n/).map((line) => line.replace(/([A-Za-z_]\w*)\{([^{}\r\n]*\([^{}\r\n]*\)[^{}\r\n]*)\}/g, (_, id: string, label: string) => id + '{"' + label + '"}')).join('\n')
}

watch(() => [svg.value, props.playFlow] as const, ([markup, playing], _, onCleanup) => {
  if (!markup || !playing) return
  const diagram = root.value?.querySelector('.mermaid-svg svg')
  if (!diagram) return
  const edges = Array.from(diagram.querySelectorAll<SVGPathElement>('path[marker-end], path[marker-start]'))
    .filter(path => !path.closest('defs, marker') && typeof path.getTotalLength === 'function')
    .map(path => ({ path, length: path.getTotalLength(), reverse: !path.hasAttribute('marker-end') }))
    .filter(edge => edge.length > 0)
  if (!edges.length) return

  const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
  dot.setAttribute('class', 'mermaid-flow-dot')
  dot.setAttribute('r', '4')
  dot.setAttribute('aria-hidden', 'true')
  let frame = 0
  let startedAt: number | undefined
  const millisecondsPerEdge = 900
  const tick = (time: number) => {
    startedAt ??= time
    const elapsed = time - startedAt
    const edge = edges[Math.floor(elapsed / millisecondsPerEdge) % edges.length]
    const progress = (elapsed % millisecondsPerEdge) / millisecondsPerEdge
    const point = edge.path.getPointAtLength((edge.reverse ? 1 - progress : progress) * edge.length)
    if (dot.parentNode !== edge.path.parentNode) edge.path.parentNode?.appendChild(dot)
    dot.setAttribute('cx', String(point.x))
    dot.setAttribute('cy', String(point.y))
    frame = requestAnimationFrame(tick)
  }
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
  const syncMotion = () => {
    cancelAnimationFrame(frame)
    dot.remove()
    startedAt = undefined
    if (!motion.matches) frame = requestAnimationFrame(tick)
  }
  motion.addEventListener('change', syncMotion)
  syncMotion()
  onCleanup(() => {
    motion.removeEventListener('change', syncMotion)
    cancelAnimationFrame(frame)
    dot.remove()
  })
}, { flush: 'post' })

async function render() {
  const request = ++renderRequest
  svg.value = ''
  error.value = ''
  errorDetail.value = ''
  diagramRatio.value = 1
  const normalizedCode = normalizeMermaidCode(props.code)

  const simpleSvg = renderSimpleFlowchart(normalizedCode)
  if (simpleSvg) {
    if (request !== renderRequest) return
    svg.value = simpleSvg
    await nextTick()
    measureDiagram()
    emit('rendered')
    return
  }

  try {
    const mermaid = await loadMermaid()
    const shell = document.querySelector<HTMLElement>('.app-shell')
    const styles = shell ? getComputedStyle(shell) : getComputedStyle(document.documentElement)
    const token = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback
    const colors = store.activeTheme.tokens.color
    const themeKey = `${props.themeKey ?? store.activeThemeId}:${props.nativeLabels ? 'native' : 'html'}`
    if (initializedThemeKey !== themeKey) {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        theme: 'base',
        themeVariables: {
          primaryColor: token('--surface-raised', colors.surfaceRaised),
          primaryTextColor: token('--ink', colors.text),
          lineColor: token('--accent', colors.accent),
          secondaryColor: token('--surface', colors.surface),
          tertiaryColor: token('--app-bg', colors.appBackground),
          primaryBorderColor: token('--accent', colors.accent),
          edgeLabelBackground: token('--surface', colors.surface),
          fontFamily: token('--ui-font', '"Aptos", "Segoe UI", sans-serif'),
          fontSize: '14px',
          fontWeight: '400',
        },
        flowchart: { htmlLabels: !props.nativeLabels, nodeSpacing: 36, rankSpacing: 50, padding: 18, wrappingWidth: 260, curve: 'basis' },
      })
      initializedThemeKey = themeKey
    }
    const cacheKey = `${themeKey}:${normalizedCode}`
    let pending = mermaidCache.get(cacheKey)
    if (!pending) {
      pending = mermaid.render(`moyue-${Math.random().toString(36).slice(2)}`, normalizedCode).then((result) => result.svg).catch((cause) => {
        mermaidCache.delete(cacheKey)
        throw cause
      })
      mermaidCache.set(cacheKey, pending)
      if (mermaidCache.size > MERMAID_CACHE_LIMIT) mermaidCache.delete(mermaidCache.keys().next().value as string)
    }
    const renderedSvg = await pending
    if (request !== renderRequest) return
    svg.value = renderedSvg
  } catch (cause) {
    if (request !== renderRequest) return
    const rawMessage = cause instanceof Error ? cause.message : '图表渲染失败'
    const line = rawMessage.match(/line\s+(\d+)/i)?.[1]
    error.value = line ? 'Mermaid 图表语法错误（第 ' + line + ' 行）' : 'Mermaid 图表语法无法解析'
    errorDetail.value = rawMessage.split('\n')[0] ?? rawMessage
  }
  await nextTick()
  if (svg.value) {
    measureDiagram()
    emit('rendered')
  }
}

onMounted(() => {
  if (shouldRender.value || typeof IntersectionObserver === 'undefined') void render()
  else {
    visibilityObserver = new IntersectionObserver((entries) => {
      if (!entries[0]?.isIntersecting) return
      shouldRender.value = true
      visibilityObserver?.disconnect()
      void render()
    }, { rootMargin: '240px 0px' })
    if (root.value) visibilityObserver.observe(root.value)
  }
})
onUnmounted(() => visibilityObserver?.disconnect())
watch(() => [props.code, props.themeKey, props.nativeLabels, store.activeThemeId], () => {
  if (shouldRender.value) void render()
})
</script>

<template>
  <button ref="root" class="mermaid-block" :class="[{ large }, `diagram-${diagramVariant}`]" type="button" :aria-label="diagramHint" :title="diagramHint" @click="emit('click')">
    <div v-if="svg" class="mermaid-svg" v-html="svg" />
    <pre v-else-if="error" class="mermaid-error"><strong>{{ error }}</strong><small>{{ errorDetail }}</small><code>{{ code }}</code></pre>
    <div v-else-if="!shouldRender" class="mermaid-loading"><span class="pulse-dot" /> 靠近图表后绘制</div>
    <div v-else class="mermaid-loading"><span class="pulse-dot" /> 正在绘制图表</div>
    <span class="diagram-action">{{ diagramHint }} <AppIcon name="external" :size="12" /></span>
  </button>
</template>

<script setup lang="ts">
import type { AsciiTreeNode } from '../asciiDiagram'

defineProps<{ node: AsciiTreeNode; root?: boolean }>()
</script>

<template>
  <div v-if="root" class="tree-diagram" role="tree">
    <div class="tree-root">{{ node.label }}</div>
    <ul v-if="node.children.length" class="tree-children">
      <TreeDiagram v-for="(child, index) in node.children" :key="`${child.label}-${index}`" :node="child" />
    </ul>
  </div>
  <li v-else class="tree-item" role="treeitem">
    <details v-if="node.children.length" open>
      <summary>{{ node.label }}</summary>
      <ul class="tree-children">
        <TreeDiagram v-for="(child, index) in node.children" :key="`${child.label}-${index}`" :node="child" />
      </ul>
    </details>
    <span v-else class="tree-leaf">{{ node.label }}</span>
  </li>
</template>

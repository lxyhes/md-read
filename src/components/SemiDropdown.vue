<script setup lang="ts">
import { h, useSlots } from 'vue'
import { Dropdown } from '@kousum/semi-ui-vue/dist/dropdown'

const slots = useSlots()
const menuContent = () => h('div', { class: 'reader-more-popover' }, slots.menu?.())
</script>

<template>
  <Dropdown trigger="click" position="bottomLeft" :render="menuContent()" content-class-name="moyue-semi-dropdown">
    <slot />
  </Dropdown>
</template>

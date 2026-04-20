<!--
  @deprecated Use <InfoBar> instead. Kept as a thin wrapper for one minor so
  pre-rename callers keep rendering. Forwards every prop/attr to InfoBar
  (InfoBar renders its own content — no slots to forward).
-->
<script setup lang="ts">
import InfoBar from './InfoBar.vue';
</script>

<template>
  <InfoBar v-bind="$attrs" />
</template>

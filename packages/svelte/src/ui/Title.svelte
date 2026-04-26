<script lang="ts">
import { getThemeContext, getTitleAnchor } from '../context';
import { portal } from './portal';

const themeStore = getThemeContext();
const anchorStore = getTitleAnchor();

$: theme = $themeStore;
$: anchor = $anchorStore;
</script>

{#if anchor}
  <div
    use:portal={anchor}
    data-chart-title=""
    style="
      display:flex;
      align-items:baseline;
      gap:6px;
      padding:6px 8px 4px;
      flex-shrink:0;
      font-family:{theme.typography.fontFamily};
      font-size:{theme.typography.fontSize}px;
      font-weight:600;
      color:{theme.tooltip.textColor};
      pointer-events:none;
    "
  >
    <span><slot /></span>
    {#if $$slots.sub}
      <span
        style="
          font-weight:400;
          color:{theme.axis.textColor};
          font-size:{theme.axis.fontSize}px;
        "
      ><slot name="sub" /></span>
    {/if}
  </div>
{/if}

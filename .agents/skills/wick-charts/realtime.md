# Live data, history and linked charts

## How a data update lands

Pass a new `data` array for each change. The series compares it with the previous one and takes the cheapest correct path:

| The new array | What the chart does |
|---|---|
| Same length, only the last point changed | Eases the last point to its new value (a live tick) |
| Up to 20 new points at the end | Appends them with an entry animation |
| Same length, the first point dropped and one point added (`[...prev, p].slice(-N)`) | Appends and trims; the view scrolls without a snap. Two or more points per update on a full window replace the data. |
| Older points added at the start | Prepends them; the view stays where it is |
| Anything else (a bulk load, a shrink, an edit in the middle) | Replaces the data |

```tsx
// React: a live candle, then a new one
setData((prev) => [...prev.slice(0, -1), liveCandle]);
setData((prev) => [...prev, nextCandle]);
// A rolling window of 500 points
setData((prev) => [...prev, point].slice(-500));
```

The imperative API does the same without a framework round trip: `chart.appendData(id, point)`, `chart.updateData(id, point)`, `chart.prependData(id, points)`, `chart.keepLast(id, count)`, `chart.setSeriesData(id, points)`.

### React

The series compare array references: an in-place `push` does not re-render, so the chart does not see it. Update state with a new array.

### Vue

Hold large data in a `shallowRef` and assign a new array. A deep `ref` makes Vue proxy every point that your code touches. On a `ref` or `reactive` array, the series also sees an in-place `push` and an in-place edit of the last point, but not an edit of an older point. `triggerRef` after an in-place `push` on a `shallowRef` does not reach the chart.

```ts
const data = shallowRef<TimePoint[]>([]);

function onTick(point: TimePoint) {
  data.value = [...data.value, point];
}
```

### Svelte

Svelte 5: keep chart data in `$state.raw` (or a store) and assign a new array. A deep `$state` gives the chart a proxy, and a read of each point through it is very slow on large data. The chart does not see an in-place change of a `$state.raw` array.

```svelte
<script lang="ts">
  import { ChartContainer, LineSeries, type TimePoint } from '@wick-charts/svelte';

  let data = $state.raw<TimePoint[]>([]);

  $effect(() => {
    const id = setInterval(() => {
      data = [...data, { time: Date.now(), value: Math.random() * 100 }].slice(-500);
    }, 1000);

    return () => clearInterval(id);
  });
</script>

<div style="height: 300px">
  <ChartContainer>
    <LineSeries {data} />
  </ChartContainer>
</div>
```

Svelte 4: assign a new array, or edit in place and then assign the same array (`data = data`).

## History on scroll

Load older data when the user pans to the start of the data, then prepend it to the array. The view stays where it is, and the new points play the series' `historyReveal` animation (`historyReveal: 'none'` turns it off).

React has `<EdgeLoader>`. It calls `onTrigger` when the view comes within `threshold` bars of the edge (default 5) and shows a loading indicator at the edge while the returned Promise runs. Resolve the Promise with `false` when there is no more data.

```tsx
function Prices({ initial }: { initial: OHLCData[] }) {
  const [data, setData] = useState(initial);

  const loadOlder = useCallback(async () => {
    const older = await fetchCandles({ before: data[0].time });
    setData((prev) => [...older, ...prev]);

    return older.length > 0; // false: no more history, stop the loader
  }, [data]);

  return (
    <ChartContainer viewport={{ initialRange: 60 }}>
      <CandlestickSeries data={data} />
      <EdgeLoader side="left" threshold={8} onTrigger={loadOlder} indicator={skeletonLoadingIndicator} />
      <YAxis />
      <TimeAxis />
    </ChartContainer>
  );
}
```

- `indicator`: `'canvas'` (default spinner), `skeletonLoadingIndicator` (placeholder candles), your own `LoadingIndicatorFn`, or `'custom'` with a render-prop child that gets `{ x, side, isLoading, boundaryTime, hasMore }`.
- `skeletonMorphIntro()` as the candlestick `historyReveal` grows the real candles out of the skeleton shapes.

Vue and Svelte use the `onEdgeReached` prop of `ChartContainer` (React has it too). It fires when the user releases a pan or zoom that went past the first or last point by more than ~10% of the visible range, with `{ side, boundaryTime, overshoot }`. The chart reads the callback at mount only, so it must not close over state that changes: read the current data through a ref or a store.

```vue
<ChartContainer @edge-reached="(info) => info.side === 'left' && loadBefore(info.boundaryTime)">
```

## Navigator

`<Navigator>` is a small overview strip under the plot, with a window that shows and drags the visible range. Give it the same data as the main series:

```tsx
<ChartContainer>
  <CandlestickSeries data={candles} />
  <YAxis />
  <TimeAxis />
  <Navigator data={{ type: 'candlestick', points: candles }} height={60} />
</ChartContainer>
```

`data` is `{ type: 'line' | 'bar', points }`, `{ type: 'line' | 'bar', series: [points, …] }` or `{ type: 'candlestick', points }` (`NavigatorDataInput`). Time is ms or a `Date`, as in the series data. Time X axis only.

## Several linked charts

Price, volume and RSI panes that pan, zoom and hover together: take each `ChartInstance` (`onReady`), listen to `viewportChange` and `crosshairMove` on each, and copy the state to the others. A flag stops the copies from firing the copy again.

```ts
function linkCharts(charts: ChartInstance[]): () => void {
  let busy = false;

  const copy = (source: ChartInstance, apply: (target: ChartInstance) => void) => {
    if (busy) return;

    busy = true;
    try {
      for (const target of charts) {
        if (target !== source) apply(target);
      }
    } finally {
      busy = false;
    }
  };

  const listeners = charts.map((source) => {
    const onViewport = () => copy(source, (t) => t.setVisibleRange(source.getVisibleRange(), { gesture: true }));
    const onCrosshair = () => {
      const position = source.getCrosshairPosition();
      copy(source, (t) => t.setCrosshair(position ? { time: position.time } : null));
    };

    source.on('viewportChange', onViewport);
    source.on('crosshairMove', onCrosshair);

    return () => {
      source.off('viewportChange', onViewport);
      source.off('crosshairMove', onCrosshair);
    };
  });

  return () => {
    for (const remove of listeners) {
      remove();
    }
  };
}
```

`{ gesture: true }` eases the linked panes on the same fast curve as a hand pan, so their Y axes refit together. Each pane draws its own `Crosshair` and `Tooltip` at the shared time.

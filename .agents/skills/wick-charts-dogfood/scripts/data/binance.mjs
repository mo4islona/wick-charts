// Binance spot datasets: btc-1h-gap, pepe-1h, stable-1m-flat, btc-1m-big, trades-stream.
// Usage: node binance.mjs [id ...]   (no args = all)
import { columnProfile, fetchJson, fmtDur, iso, sleep, timeProfile, writeDataset } from './lib.mjs';

const API = 'https://api.binance.com/api/v3';
const MIN = 60_000;

async function klines({ symbol, interval, startTime, endTime, max }) {
  const out = [];
  const urls = [];
  let cursor = startTime;
  while (out.length < max) {
    const limit = Math.min(1000, max - out.length);
    const end = endTime ? `&endTime=${endTime}` : '';
    const url = `${API}/klines?symbol=${symbol}&interval=${interval}&startTime=${cursor}${end}&limit=${limit}`;
    urls.push(url);
    const page = await fetchJson(url);
    out.push(...page);
    if (page.length < limit) break;

    cursor = page[page.length - 1][0] + 1;
    await sleep(120);
  }

  return { rows: out, urls };
}

// Binance returns numeric fields as strings; Number() is the only transformation applied.
const toObj = (k) => ({
  time: k[0],
  open: Number(k[1]),
  high: Number(k[2]),
  low: Number(k[3]),
  close: Number(k[4]),
  volume: Number(k[5]),
  quoteVolume: Number(k[7]),
  trades: k[8],
});

function candleQuirks(rows, get = (r, c) => r[c]) {
  let flat = 0;
  let zeroVol = 0;
  let maxRangePct = 0;
  let maxRangeAt = null;
  for (const r of rows) {
    const o = get(r, 'open');
    const h = get(r, 'high');
    const l = get(r, 'low');
    const c = get(r, 'close');
    if (o === h && h === l && l === c) flat++;
    if (get(r, 'volume') === 0) zeroVol++;
    const pct = ((h - l) / l) * 100;
    if (pct > maxRangePct) {
      maxRangePct = pct;
      maxRangeAt = get(r, 'time');
    }
  }

  return { flat, zeroVol, maxRangePct, maxRangeAt };
}

function gapLines(tp, limit = 10) {
  const lines = tp.gaps
    .slice(0, limit)
    .map((g) => `gap ${g.from} -> ${g.to} (delta ${g.delta}, ${g.missing} missing bars)`);
  if (tp.gaps.length > limit) lines.push(`... and ${tp.gaps.length - limit} more gaps`);

  return lines;
}

const jobs = {
  async 'btc-1h-gap'() {
    const startTime = Date.UTC(2023, 1, 15);
    const { rows: raw, urls } = await klines({ symbol: 'BTCUSDT', interval: '1h', startTime, max: 1500 });
    const rows = raw.map(toObj);
    const tp = timeProfile(rows.map((r) => r.time));
    const cp = columnProfile(rows, ['open', 'high', 'low', 'close', 'volume']);
    const cq = candleQuirks(rows);

    writeDataset({
      id: 'btc-1h-gap',
      title: 'BTC/USDT 1h, Binance, window with a real exchange halt (2023-03-24)',
      source: 'Binance spot klines API',
      url: urls,
      rowFormat: 'objects',
      columns: ['time', 'open', 'high', 'low', 'close', 'volume', 'quoteVolume', 'trades'],
      units: { price: 'USDT', volume: 'BTC', quoteVolume: 'USDT', trades: 'count', time: 'ms UTC, candle open time' },
      quirks: [
        `${rows.length} candles ${tp.first} .. ${tp.last}, modal interval ${tp.modalInterval}, ${tp.gaps.length} gap(s) in the time axis`,
        ...gapLines(tp),
        `${cq.zeroVol} candle(s) with volume=0 (the 2023-03-24T12:00Z candle is O=H=L=C=28080, volume 0, right before the missing hour)`,
        `${cq.flat} fully flat candle(s) (open=high=low=close)`,
        `close range ${cp.close.min}..${cp.close.max} USDT; volume range ${cp.volume.min}..${cp.volume.max} BTC`,
        `widest candle ${cq.maxRangePct.toFixed(2)}% high/low at ${iso(cq.maxRangeAt)}`,
        'numeric fields were strings in the source; converted with Number()',
      ],
      suggestedCharts: ['candlestick + volume bars', 'line of close', 'crosshair/tooltip across the gap'],
      profile: { time: tp, columns: cp },
      rows,
    });
  },

  async 'pepe-1h'() {
    // startTime=0 returns the first candles after listing (2023-05-05).
    const { rows: raw, urls } = await klines({ symbol: 'PEPEUSDT', interval: '1h', startTime: 0, max: 1000 });
    const rows = raw.map(toObj);
    const tp = timeProfile(rows.map((r) => r.time));
    const cp = columnProfile(rows, ['open', 'high', 'low', 'close', 'volume', 'quoteVolume']);
    const cq = candleQuirks(rows);
    const first = rows[0];

    writeDataset({
      id: 'pepe-1h',
      title: 'PEPE/USDT 1h, Binance, first 1000 hours after listing',
      source: 'Binance spot klines API',
      url: urls,
      rowFormat: 'objects',
      columns: ['time', 'open', 'high', 'low', 'close', 'volume', 'quoteVolume', 'trades'],
      units: { price: 'USDT', volume: 'PEPE', quoteVolume: 'USDT', trades: 'count', time: 'ms UTC, candle open time' },
      quirks: [
        `${rows.length} candles ${tp.first} .. ${tp.last}, modal interval ${tp.modalInterval}, ${tp.gaps.length} gap(s)`,
        ...gapLines(tp),
        `price range ${cp.low.min}..${cp.high.max} USDT (8 decimal places, tick 1e-8; JSON serializes values < 1e-6 in exponent form, e.g. 9.5e-7)`,
        `volume range ${cp.volume.min.toExponential(3)}..${cp.volume.max.toExponential(3)} PEPE (13-14 digit integers)`,
        `listing candle ${iso(first.time)}: open ${first.open}, high ${first.high} (+${(((first.high - first.open) / first.open) * 100).toFixed(0)}% wick), volume ${first.volume.toExponential(3)}`,
        `widest candle ${cq.maxRangePct.toFixed(1)}% at ${iso(cq.maxRangeAt)}; ${cq.flat} flat candle(s)`,
        `price tick 1e-8 is 0.2-1.2% of price: ${rows.filter((r) => r.open === r.close).length} candles have open==close, only ${new Set(rows.map((r) => r.close)).size} distinct close values (stair-step look)`,
        'numeric fields were strings in the source; converted with Number()',
      ],
      suggestedCharts: [
        'candlestick + volume (Y-axis label formatting of 1e-6 prices, 1e12 volumes)',
        'line with tooltip',
      ],
      profile: { time: tp, columns: cp },
      rows,
    });
  },

  async 'stable-1m-flat'() {
    const endTime = Date.UTC(2026, 9, 17) - 1;
    const startTime = endTime + 1 - 1000 * MIN;
    const { rows: raw, urls } = await klines({ symbol: 'FDUSDUSDT', interval: '1m', startTime, endTime, max: 1000 });
    const rows = raw.map(toObj);
    const tp = timeProfile(rows.map((r) => r.time));
    const cp = columnProfile(rows, ['open', 'high', 'low', 'close', 'volume', 'trades']);
    const cq = candleQuirks(rows);
    const distinctClose = new Set(rows.map((r) => r.close)).size;
    let longestFlatRun = 0;
    let run = 0;
    for (let i = 1; i < rows.length; i++) {
      run = rows[i].close === rows[i - 1].close ? run + 1 : 0;
      longestFlatRun = Math.max(longestFlatRun, run + 1);
    }

    writeDataset({
      id: 'stable-1m-flat',
      title: 'FDUSD/USDT 1m, Binance, stablecoin pair (nearly flat)',
      source: 'Binance spot klines API',
      url: urls,
      rowFormat: 'objects',
      columns: ['time', 'open', 'high', 'low', 'close', 'volume', 'quoteVolume', 'trades'],
      units: { price: 'USDT', volume: 'FDUSD', quoteVolume: 'USDT', trades: 'count', time: 'ms UTC, candle open time' },
      quirks: [
        `${rows.length} candles ${tp.first} .. ${tp.last}, modal interval ${tp.modalInterval}, ${tp.gaps.length} gap(s)`,
        ...gapLines(tp),
        `${cq.flat} of ${rows.length} candles are fully flat (open=high=low=close)`,
        `${cq.zeroVol} candles with volume=0 and trades=0 (flat candles carrying the previous close)`,
        `whole-series price range ${cp.low.min}..${cp.high.max} (${(((cp.high.max - cp.low.min) / cp.low.min) * 1e4).toFixed(1)} bp); only ${distinctClose} distinct close values`,
        `longest run of identical closes: ${longestFlatRun} candles (a zoomed window can have zero Y range)`,
        `volume range ${cp.volume.min}..${cp.volume.max}`,
        'numeric fields were strings in the source; converted with Number()',
      ],
      suggestedCharts: ['candlestick (zero-height bodies, zero-range Y axis)', 'line', 'bar of volume with many zeros'],
      profile: { time: tp, columns: cp },
      rows,
    });
  },

  async 'btc-1m-big'() {
    const startTime = Date.UTC(2023, 1, 1);
    const endTime = Date.UTC(2023, 4, 2) - 1;
    const { rows: raw, urls } = await klines({ symbol: 'BTCUSDT', interval: '1m', startTime, endTime, max: 200_000 });
    const rows = raw.map((k) => [k[0], Number(k[1]), Number(k[2]), Number(k[3]), Number(k[4]), Number(k[5])]);
    const cols = ['time', 'open', 'high', 'low', 'close', 'volume'];
    const tp = timeProfile(rows.map((r) => r[0]));
    const cp = columnProfile(rows, cols);
    const cq = candleQuirks(rows, (r, c) => r[cols.indexOf(c)]);

    writeDataset({
      id: 'btc-1m-big',
      title: 'BTC/USDT 1m, Binance, 90 days (performance dataset)',
      source: 'Binance spot klines API',
      url: [
        `${API}/klines?symbol=BTCUSDT&interval=1m&startTime=${startTime}&endTime=${endTime}&limit=1000 (paged ${urls.length}x, next startTime = last openTime + 1)`,
      ],
      rowFormat: 'arrays',
      rowFormatNote: 'each row is [time, open, high, low, close, volume]; same order as "columns"',
      columns: cols,
      units: { price: 'USDT', volume: 'BTC', time: 'ms UTC, candle open time' },
      quirks: [
        `${rows.length} candles ${tp.first} .. ${tp.last}, modal interval ${tp.modalInterval}, ${tp.gaps.length} gap(s), total ${tp.gaps.reduce((s, g) => s + g.missing, 0)} missing minutes`,
        ...gapLines(tp, 12),
        `${cq.zeroVol} zero-volume candles, ${cq.flat} fully flat candles; the zero-volume ones run ${iso(rows.find((r) => r[5] === 0)?.[0])} .. ${iso(rows.findLast((r) => r[5] === 0)?.[0])} (frozen price before the halt gap)`,
        `price range ${cp.low.min}..${cp.high.max}; widest 1m candle ${cq.maxRangePct.toFixed(2)}% at ${iso(cq.maxRangeAt)}`,
        'numeric fields were strings in the source; converted with Number()',
      ],
      suggestedCharts: ['candlestick perf test (pan/zoom across 130k bars)', 'line of close', 'sparkline downsampling'],
      profile: { time: { ...tp, gaps: tp.gaps.slice(0, 50) }, columns: cp },
      rows,
    });
  },

  async 'trades-stream'() {
    const startTime = Date.UTC(2024, 7, 5, 0, 50);
    const endTime = startTime + 10 * MIN;
    const urls = [];
    const first = `${API}/aggTrades?symbol=BTCUSDT&startTime=${startTime}&endTime=${startTime + MIN}&limit=1000`;
    urls.push(first);
    let page = await fetchJson(first);
    const raw = [...page];
    while (page.length > 0 && raw[raw.length - 1].T < endTime) {
      const url = `${API}/aggTrades?symbol=BTCUSDT&fromId=${raw[raw.length - 1].a + 1}&limit=1000`;
      page = await fetchJson(url);
      raw.push(...page);
      await sleep(60);
    }
    const kept = raw.filter((t) => t.T >= startTime && t.T < endTime);
    const rows = kept.map((t) => ({ time: t.T, price: Number(t.p), qty: Number(t.q), isBuyerMaker: t.m }));

    const tp = timeProfile(rows.map((r) => r.time));
    const cp = columnProfile(rows, ['price', 'qty']);
    const perMs = new Map();
    for (const r of rows) perMs.set(r.time, (perMs.get(r.time) ?? 0) + 1);
    const sharedMs = [...perMs.values()].filter((c) => c > 1);
    const maxPerMs = Math.max(...perMs.values());
    const maxPerMsAt = [...perMs.entries()].find(([, c]) => c === maxPerMs)?.[0];
    const perSec = new Map();
    for (const r of rows) {
      const s = Math.floor(r.time / 1000);
      perSec.set(s, (perSec.get(s) ?? 0) + 1);
    }
    const maxPerSec = Math.max(...perSec.values());
    const silentSeconds = 600 - perSec.size;
    let maxJumpPct = 0;
    let maxJumpAt = 0;
    for (let i = 1; i < rows.length; i++) {
      const pct = (Math.abs(rows[i].price - rows[i - 1].price) / rows[i - 1].price) * 100;
      if (pct > maxJumpPct) {
        maxJumpPct = pct;
        maxJumpAt = rows[i].time;
      }
    }
    const buyerMaker = rows.filter((r) => r.isBuyerMaker).length;
    const deltas = [];
    for (let i = 1; i < rows.length; i++) deltas.push(rows[i].time - rows[i - 1].time);
    const maxIdle = Math.max(...deltas);

    writeDataset({
      id: 'trades-stream',
      title: 'BTC/USDT aggregated trades, Binance, 10 minutes of the 2024-08-05 crash (00:50-01:00 UTC)',
      source: 'Binance spot aggTrades API',
      url: [first, `${API}/aggTrades?symbol=BTCUSDT&fromId=<last aggId + 1>&limit=1000 (paged until T >= ${endTime})`],
      rowFormat: 'objects',
      columns: ['time', 'price', 'qty', 'isBuyerMaker'],
      units: { price: 'USDT', qty: 'BTC', time: 'ms UTC, trade time', isBuyerMaker: 'true = sell aggressor' },
      quirks: [
        `${rows.length} aggregated trades ${tp.first} .. ${tp.last}; order ${tp.order} (non-decreasing)`,
        `${tp.duplicateSteps} consecutive pairs share the same millisecond; ${sharedMs.length} distinct ms carry >1 trade; max ${maxPerMs} trades in one ms (${iso(maxPerMsAt)})`,
        `peak ${maxPerSec} trades in one second; ${silentSeconds} of 600 seconds have no trade; longest idle ${fmtDur(maxIdle)}`,
        `price ${cp.price.min}..${cp.price.max} USDT (${(((cp.price.max - cp.price.min) / cp.price.min) * 100).toFixed(2)}% range); largest trade-to-trade jump ${maxJumpPct.toFixed(3)}% at ${iso(maxJumpAt)}`,
        `qty ${cp.qty.min}..${cp.qty.max} BTC (5+ orders of magnitude; min is the 0.00001 lot step)`,
        `${buyerMaker} isBuyerMaker=true vs ${rows.length - buyerMaker} false`,
        'aggId was dropped; numeric fields were strings in the source; converted with Number()',
      ],
      suggestedCharts: [
        'live-stream replay into a 1s/5s candlestick (many updates per bucket, same-ms ticks)',
        'line of price',
        'buy/sell volume bars',
      ],
      profile: { time: { ...tp, gaps: [] }, columns: cp },
      rows,
    });
  },

  // Rolling: the REST API has no historical book, so a re-fetch gives a different book.
  async 'orderbook-snapshots'() {
    const plan = { BTCUSDT: 20, PEPEUSDT: 5 };
    const symbols = {};
    const urls = [];
    const quirks = [];
    for (const [symbol, count] of Object.entries(plan)) {
      const url = `${API}/depth?symbol=${symbol}&limit=1000`;
      urls.push(url);
      const snaps = [];
      for (let i = 0; i < count; i++) {
        const book = await fetchJson(url);
        snaps.push({ time: Date.now(), lastUpdateId: book.lastUpdateId, bids: book.bids, asks: book.asks });
        await sleep(1500);
      }

      symbols[symbol] = snaps;

      const first = snaps[0];
      const sizes = [...first.bids, ...first.asks].map((l) => Number(l[1]));
      const bestBid = Number(first.bids[0][0]);
      const bestAsk = Number(first.asks[0][0]);
      const lowBid = Number(first.bids[first.bids.length - 1][0]);
      const highAsk = Number(first.asks[first.asks.length - 1][0]);
      quirks.push(
        `${symbol}: ${count} snapshots ~1.5 s apart, ${first.bids.length} bids + ${first.asks.length} asks each; bids descending, asks ascending (API order)`,
        `${symbol}: best bid ${bestBid}, best ask ${bestAsk}, spread ${(bestAsk - bestBid).toPrecision(3)}; book spans ${lowBid}..${highAsk}`,
        `${symbol}: level sizes ${Math.min(...sizes)}..${Math.max(...sizes)}`,
      );
    }

    quirks.push(
      'prices and sizes are STRINGS as the API sends them ("0.00000456"); Number() them for the plain variant',
    );

    writeDataset({
      id: 'orderbook-snapshots',
      title: 'Binance spot order book snapshots: BTCUSDT x20 and PEPEUSDT x5, 1000 levels a side',
      source: 'Binance spot depth API',
      url: urls,
      rowFormat: 'snapshots',
      layout: 'symbols: { <symbol>: [{ time, lastUpdateId, bids: [[price, size]], asks: [[price, size]] }] }',
      units: { price: 'quote asset (USDT)', size: 'base asset', time: 'ms UTC, local capture time' },
      quirks,
      suggestedCharts: ['depth chart (cumulative bids / asks)', 'live depth replay, one snapshot per second'],
      symbols,
    });
  },
};

const wanted = process.argv.slice(2);
for (const [id, job] of Object.entries(jobs)) {
  if (wanted.length && !wanted.includes(id)) continue;

  console.log(`--- ${id}`);
  await job();
}

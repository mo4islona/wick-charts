// Non-Binance datasets. Usage: node others.mjs [id ...]   (no args = all)
import { columnProfile, fetchJson, fetchRaw, fmtDur, iso, parseCsv, sleep, timeProfile, writeDataset } from './lib.mjs';

const DAY = 86_400_000;

const num = (v) => (v === null || v === undefined || v === '' || v === '.' ? null : Number(v));

function berlinDayCounts(times) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const counts = new Map();
  for (const t of times) {
    const d = fmt.format(new Date(t));
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }

  return counts;
}

function seriesProfile(series, cols) {
  const out = {};
  for (const [name, rows] of Object.entries(series)) {
    out[name] = { time: timeProfile(rows.map((r) => r.time)), columns: columnProfile(rows, cols) };
  }

  return out;
}

const jobs = {
  async 'stock-daily'() {
    // Stooq now serves a JS proof-of-work page instead of CSV, so Yahoo's chart API is used.
    const p1 = Math.floor(Date.UTC(2016, 9, 17) / 1000);
    const p2 = Math.floor(Date.UTC(2026, 9, 17) / 1000);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/AAPL?interval=1d&period1=${p1}&period2=${p2}&events=div%2Csplit&includeAdjustedClose=true`;
    const j = await fetchJson(url);
    const r = j.chart.result[0];
    const q = r.indicators.quote[0];
    const adj = r.indicators.adjclose?.[0]?.adjclose ?? [];
    const rows = r.timestamp.map((t, i) => ({
      time: t * 1000,
      open: q.open[i],
      high: q.high[i],
      low: q.low[i],
      close: q.close[i],
      adjClose: adj[i] ?? null,
      volume: q.volume[i],
    }));

    const tp = timeProfile(rows.map((x) => x.time));
    const cp = columnProfile(rows, ['open', 'high', 'low', 'close', 'adjClose', 'volume']);
    const tod = new Map();
    for (const x of rows) {
      const k = new Date(x.time).toISOString().slice(11, 16);
      tod.set(k, (tod.get(k) ?? 0) + 1);
    }
    const deltaDays = new Map();
    for (let i = 1; i < rows.length; i++) {
      const d = Math.round((rows[i].time - rows[i - 1].time) / DAY);
      deltaDays.set(d, (deltaDays.get(d) ?? 0) + 1);
    }
    const nonDayMultiple = rows.filter((x, i) => i > 0 && (x.time - rows[i - 1].time) % DAY !== 0).length;
    const floatNoise = rows.filter((x) => String(x.close).replace(/^\d+\./, '').length > 6).length;
    const splits = Object.values(r.events?.splits ?? {}).map((s) => ({ time: s.date * 1000, ratio: s.splitRatio }));
    const dividends = Object.values(r.events?.dividends ?? {}).map((d) => ({ time: d.date * 1000, amount: d.amount }));
    const preSplit = rows.find((x) => x.time === Date.UTC(2020, 7, 28, 13, 30));

    writeDataset({
      id: 'stock-daily',
      title: 'AAPL daily OHLCV, 10 years (Yahoo Finance chart API)',
      source: 'Yahoo Finance v8 chart API (Stooq CSV now sits behind a JS proof-of-work page)',
      url,
      rowFormat: 'objects',
      columns: ['time', 'open', 'high', 'low', 'close', 'adjClose', 'volume'],
      units: { price: 'USD', volume: 'shares', time: 'ms UTC of the US market open (09:30 New York), NOT midnight' },
      quirks: [
        `${rows.length} trading days ${tp.first} .. ${tp.last}; no weekend/holiday rows`,
        `bar-to-bar delta in days: ${[...deltaDays.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([d, c]) => `${d}d×${c}`)
          .join(', ')}`,
        `timestamps are the 09:30 New York open in UTC, so time-of-day flips with US DST: ${[...tod.entries()].map(([k, c]) => `${k}Z×${c}`).join(', ')}; ${nonDayMultiple} bar-to-bar deltas are not whole days (23h/25h around DST)`,
        `OHLC are split-adjusted, NOT raw: 4:1 split ${splits.map((s) => `${iso(s.time)} ${s.ratio}`).join(', ')}; 2020-08-28 close shows ${preSplit?.close} (raw print was ~499). Unadjusted prices are not available from this source`,
        `adjClose is also dividend-adjusted (${dividends.length} dividends in events): ${rows.filter((x) => x.adjClose !== null && x.adjClose < x.close).length} of ${rows.length} rows have adjClose < close`,
        `float32 artifacts in the source: ${floatNoise} closes have >6 decimals (e.g. ${rows[0].close})`,
        `nulls: ${Object.entries(cp)
          .map(([k, v]) => `${k}=${v.nulls}`)
          .join(', ')}`,
        `close ${cp.close.min}..${cp.close.max} USD; volume ${cp.volume.min}..${cp.volume.max}`,
      ],
      suggestedCharts: [
        'candlestick + volume with weekend gaps (category-like vs time X axis)',
        'line of close vs adjClose (two series)',
      ],
      events: { splits, dividends },
      profile: { time: { ...tp, gaps: tp.gaps.length }, columns: cp },
      rows,
    });
  },

  async 'de-power-price'() {
    const windows = {
      'interval-change-2025-10-01': [
        '2025-09-28',
        '2025-10-04',
        'day-ahead resolution moves from 1h to 15min at 2025-10-01 00:00 Europe/Berlin',
      ],
      'negative-may-2024': ['2024-05-01', '2024-05-21', 'May 2024 holidays and sunny weekends: deep negative prices'],
      'dst-spring-2024': ['2024-03-30', '2024-04-01', 'local day 2024-03-31 has 23 hours (hourly resolution)'],
      'dst-autumn-2025': ['2025-10-25', '2025-10-27', 'local day 2025-10-26 has 25 hours (15-min resolution)'],
    };
    const series = {};
    const urls = {};
    const quirks = [];
    let unit = null;
    for (const [name, [start, end, note]] of Object.entries(windows)) {
      const url = `https://api.energy-charts.info/price?bzn=DE-LU&start=${start}&end=${end}`;
      urls[name] = url;
      const j = await fetchJson(url);
      unit = j.unit;
      const rows = j.unix_seconds.map((t, i) => ({ time: t * 1000, price: j.price[i] ?? null }));
      series[name] = rows;

      const tp = timeProfile(rows.map((x) => x.time));
      const cp = columnProfile(rows, ['price']);
      const perDay = berlinDayCounts(rows.map((x) => x.time));
      const minRow = rows.find((x) => x.price === cp.price.min);
      quirks.push(
        `[${name}] ${note}. ${rows.length} points ${tp.first} .. ${tp.last}; deltas ${tp.deltaHistogram.join(', ')}; points per Berlin day: ${[...perDay.entries()].map(([d, c]) => `${d}=${c}`).join(', ')}`,
        `[${name}] price ${cp.price.min}..${cp.price.max} ${j.unit}; ${cp.price.negatives} negative, ${cp.price.zeros} exactly zero, ${cp.price.nulls} null; min at ${minRow ? iso(minRow.time) : '-'}`,
      );
      if (tp.gaps.length)
        quirks.push(
          `[${name}] ${tp.gaps.length} steps are longer than the modal ${tp.modalInterval} (the hourly part before the switch)`,
        );
      await sleep(500);
    }
    const changeRows = series['interval-change-2025-10-01'];
    const switchAt = changeRows.findIndex((x, i) => i > 0 && x.time - changeRows[i - 1].time === 900_000);
    if (switchAt > 0)
      quirks.unshift(
        `interval changes inside one series: last hourly point ${iso(changeRows[switchAt - 1].time)}, first 15-min step ends ${iso(changeRows[switchAt].time)} (index ${switchAt}); hourly before, 15-min after`,
      );

    writeDataset({
      id: 'de-power-price',
      title: 'German day-ahead electricity price (DE-LU), four windows',
      source: 'Energy-Charts (Fraunhofer ISE) API, data CC BY 4.0 from Bundesnetzagentur | SMARD.de',
      url: urls,
      rowFormat: 'objects',
      layout: 'series: { <window name>: [{time, price}] } — one independent series per window; windows do not overlap',
      columns: ['time', 'price'],
      units: { price: unit, time: 'ms UTC, start of the delivery period' },
      quirks,
      suggestedCharts: [
        'line or step line of price (interval change mid-series)',
        'bar chart with negative bars',
        'X axis in Europe/Berlin local time across DST',
      ],
      profile: seriesProfile(series, ['price']),
      series,
    });
  },

  async 'de-power-mix'() {
    const url = 'https://api.energy-charts.info/public_power?country=de&start=2024-05-10&end=2024-05-14';
    const j = await fetchJson(url);
    const times = j.unix_seconds.map((t) => t * 1000);
    const series = {};
    for (const p of j.production_types) series[p.name] = p.data.map((v, i) => ({ time: times[i], value: v ?? null }));

    const tp = timeProfile(times);
    const quirks = [
      `${Object.keys(series).length} series × ${times.length} points ${tp.first} .. ${tp.last}, interval ${tp.modalInterval}, ${tp.gaps.length} gap(s)`,
      'mixed units in one payload: all production types are MW, but "Renewable share of load" / "Renewable share of generation" are percent, and "Load" / "Residual load" are totals (not stackable with the rest)',
    ];
    const longest = Object.keys(series).reduce((a, b) => (b.length > a.length ? b : a));
    const shareLoad = columnProfile(series['Renewable share of load'] ?? [], ['value']).value;
    quirks.push(`"Renewable share of load" exceeds 100 % (max ${shareLoad.max}) when renewables out-produce load`);
    quirks.push(`longest series name: "${longest}" (${longest.length} chars); names contain spaces and "/"`);
    for (const [name, rows] of Object.entries(series)) {
      const c = columnProfile(rows, ['value']).value;
      const flags = [];
      if (c.negatives) flags.push(`${c.negatives} negative`);
      if (c.zeros) flags.push(`${c.zeros} zero`);
      if (c.nulls) flags.push(`${c.nulls} null`);
      if (flags.length || name.startsWith('Renewable'))
        quirks.push(`"${name}": ${c.min}..${c.max}${flags.length ? `, ${flags.join(', ')}` : ''}`);
    }

    writeDataset({
      id: 'de-power-mix',
      title: 'Germany public net electricity generation by source, 2024-05-10..14 (15-min)',
      source: 'Energy-Charts (Fraunhofer ISE) public_power API',
      url,
      rowFormat: 'objects',
      layout: 'series: { <production type>: [{time, value}] } — all series share the same time grid',
      columns: ['time', 'value'],
      units: { value: 'MW (except "Renewable share of *" = %)', time: 'ms UTC, start of the 15-min period' },
      quirks,
      suggestedCharts: [
        'stacked area of production types (negative pumped-storage / cross-border)',
        'pie of one timestamp (negative slices, zero slices)',
        'line of Load vs Residual load',
      ],
      profile: { time: tp, deprecated: j.deprecated },
      series,
    });
  },

  async 'weather-hourly'() {
    const cities = {
      Yakutsk: [62.03, 129.73],
      Dubai: [25.2, 55.27],
      Reykjavik: [64.13, -21.9],
      Singapore: [1.29, 103.85],
    };
    const names = Object.keys(cities);
    const lat = names.map((n) => cities[n][0]).join(',');
    const lon = names.map((n) => cities[n][1]).join(',');
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=2026-08-18&end_date=2026-10-17&hourly=temperature_2m,precipitation&timezone=GMT&timeformat=unixtime&models=era5`;
    const arr = await fetchJson(url);
    const series = {};
    const quirks = [];
    arr.forEach((loc, k) => {
      const h = loc.hourly;
      const rows = h.time.map((t, i) => ({
        time: t * 1000,
        temperature: h.temperature_2m[i],
        precipitation: h.precipitation[i],
      }));
      series[names[k]] = rows;
      const cp = columnProfile(rows, ['temperature', 'precipitation']);
      let trailing = 0;
      for (let i = rows.length - 1; i >= 0 && rows[i].temperature === null; i--) trailing++;
      const lastValid = rows[rows.length - 1 - trailing];
      const innerNulls = cp.temperature.nulls - trailing;
      quirks.push(
        `${names[k]} (grid ${loc.latitude}, ${loc.longitude}, elev ${loc.elevation} m): temp ${cp.temperature.min}..${cp.temperature.max} °C, precip 0..${cp.precipitation.max} mm with ${cp.precipitation.zeros} zero hours of ${rows.length}; ${trailing} trailing null hours (last value ${lastValid ? iso(lastValid.time) : '-'}), ${innerNulls} inner nulls; precip nulls ${cp.precipitation.nulls}`,
      );
    });
    const tp = timeProfile(series[names[0]].map((r) => r.time));
    quirks.unshift(
      `${names.length} cities × ${tp.n} hourly points ${tp.first} .. ${tp.last}, ${tp.gaps.length} time gaps; the archive lags real time, so the tail is null`,
    );
    const tz = arr.map((l) => l.timezone).join(',');
    quirks.push(`all times GMT (${tz}); precipitation is mostly 0 with rare spikes (bar charts dominated by zeros)`);
    quirks.push(
      'models=era5 is requested explicitly: the default best_match model had no nulls at all and even returned values for hours after the fetch time (forecast fill), which hides the archive lag',
    );

    writeDataset({
      id: 'weather-hourly',
      title: 'Hourly temperature and precipitation, 4 contrasting cities, last ~60 days',
      source: 'Open-Meteo historical weather API, models=era5 (ERA5 reanalysis, ~5-day lag)',
      url,
      rowFormat: 'objects',
      layout: 'series: { <city>: [{time, temperature, precipitation}] } — all cities share the same time grid',
      columns: ['time', 'temperature', 'precipitation'],
      units: { temperature: '°C', precipitation: 'mm per hour', time: 'ms UTC' },
      quirks,
      suggestedCharts: [
        'multi-line temperature (4 series, -X..+45 °C)',
        'bar of precipitation (mostly zeros)',
        'secondary Y axis: temp + precip',
      ],
      profile: seriesProfile(series, ['temperature', 'precipitation']),
      series,
    });
  },

  async 'weather-daily'() {
    const cities = { Yakutsk: [62.03, 129.73], Singapore: [1.29, 103.85] };
    const names = Object.keys(cities);
    const lat = names.map((n) => cities[n][0]).join(',');
    const lon = names.map((n) => cities[n][1]).join(',');
    const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=2025-10-17&end_date=2026-10-17&daily=temperature_2m_min,temperature_2m_max,temperature_2m_mean&timezone=GMT&timeformat=unixtime`;
    const arr = await fetchJson(url);
    const series = {};
    const quirks = [];
    arr.forEach((loc, k) => {
      const d = loc.daily;
      const rows = d.time.map((t, i) => ({
        time: t * 1000,
        min: d.temperature_2m_min[i],
        max: d.temperature_2m_max[i],
        mean: d.temperature_2m_mean[i],
      }));
      series[names[k]] = rows;
      const cp = columnProfile(rows, ['min', 'max', 'mean']);
      let trailing = 0;
      for (let i = rows.length - 1; i >= 0 && rows[i].mean === null; i--) trailing++;
      let widest = 0;
      let narrowest = Infinity;
      for (const r of rows) {
        if (r.max === null || r.min === null) continue;
        widest = Math.max(widest, r.max - r.min);
        narrowest = Math.min(narrowest, r.max - r.min);
      }
      quirks.push(
        `${names[k]}: min ${cp.min.min}..${cp.min.max}, max ${cp.max.min}..${cp.max.max}, mean ${cp.mean.min}..${cp.mean.max} °C; daily band width ${narrowest.toFixed(1)}..${widest.toFixed(1)} °C; ${trailing} trailing null days; nulls min=${cp.min.nulls} max=${cp.max.nulls} mean=${cp.mean.nulls}`,
      );
    });
    const tp = timeProfile(series[names[0]].map((r) => r.time));
    quirks.unshift(
      `${names.length} cities × ${tp.n} days ${tp.first} .. ${tp.last} (GMT midnight), ${tp.gaps.length} gaps`,
    );
    quirks.push(
      'Yakutsk crosses 0 °C (sign flips in band); Singapore band is ~10x narrower — shared Y axis squashes it',
    );
    quirks.push(
      `default best_match model: no nulls; the last row (${tp.last.slice(0, 10)}) is the fetch day, so it mixes observed and forecast hours`,
    );

    writeDataset({
      id: 'weather-daily',
      title: 'Daily min / max / mean temperature, Yakutsk vs Singapore, last 12 months',
      source: 'Open-Meteo historical weather API',
      url,
      rowFormat: 'objects',
      layout: 'series: { <city>: [{time, min, max, mean}] }',
      columns: ['time', 'min', 'max', 'mean'],
      units: { temperature: '°C', time: 'ms UTC, day start in GMT' },
      quirks,
      suggestedCharts: ['band (min..max) + line (mean)', 'two bands on one Y axis'],
      profile: seriesProfile(series, ['min', 'max', 'mean']),
      series,
    });
  },

  async 'fred-macro'() {
    const ids = {
      UNRATE: 'Unemployment rate, %, monthly, seasonally adjusted',
      GDPC1: 'Real GDP, billions of chained 2017 USD, quarterly, SAAR',
      DGS10: '10-year Treasury constant maturity yield, %, daily',
      T10Y2Y: '10-year minus 2-year Treasury spread, percentage points, daily',
    };
    const series = {};
    const urls = {};
    const quirks = [];
    for (const [id, desc] of Object.entries(ids)) {
      const url = `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`;
      urls[id] = url;
      const csv = parseCsv(await fetchRaw(url));
      const dateKey = Object.keys(csv[0])[0];
      const rawValues = csv.map((r) => r[id]);
      const rows = csv.map((r) => ({ time: Date.parse(`${r[dateKey]}T00:00:00Z`), value: num(r[id]) }));
      series[id] = rows;

      const tp = timeProfile(rows.map((x) => x.time));
      const cp = columnProfile(rows, ['value']);
      const dots = rawValues.filter((v) => v === '.').length;
      const empties = rawValues.filter((v) => v === '' || v === undefined).length;
      const deltas = tp.deltaHistogram.join(', ');
      let crossings = 0;
      for (let i = 1; i < rows.length; i++) {
        const a = rows[i - 1].value;
        const b = rows[i].value;
        if (a !== null && b !== null && Math.sign(a) !== Math.sign(b) && b !== 0) crossings++;
      }
      quirks.push(
        `${id} — ${desc}: ${rows.length} rows ${tp.first.slice(0, 10)} .. ${tp.last.slice(0, 10)}; deltas ${deltas}; ${cp.value.nulls} nulls (${dots} "." and ${empties} empty in CSV); range ${cp.value.min}..${cp.value.max}; ${cp.value.negatives} negative${crossings ? `, ${crossings} sign changes` : ''}`,
      );
      const nullDates = rows.filter((x) => x.value === null).map((x) => iso(x.time).slice(0, 10));
      if (nullDates.length > 0 && nullDates.length <= 3)
        quirks.push(
          `${id}: isolated null(s) mid-series at ${nullDates.join(', ')} (a period that was never published)`,
        );
      if (cp.value.negatives) {
        let runStart = null;
        let best = { from: 0, to: 0 };
        for (const x of rows) {
          if (x.value === null) continue;
          if (x.value < 0 && runStart === null) runStart = x.time;
          if (x.value >= 0 && runStart !== null) {
            if (x.time - runStart > best.to - best.from) best = { from: runStart, to: x.time };
            runStart = null;
          }
        }
        quirks.push(
          `${id}: longest run below zero ${iso(best.from).slice(0, 10)} .. ${iso(best.to).slice(0, 10)} (${Math.round((best.to - best.from) / DAY)} days)`,
        );
      }
      await sleep(300);
    }
    quirks.push(
      'mixed frequencies: monthly (1st of month), quarterly (1st of quarter), daily business days; daily series start 1962/1976 while UNRATE starts 1948 and GDPC1 1947',
    );
    quirks.push('date header in CSV is "observation_date"; the value is the period start, not the observation time');

    writeDataset({
      id: 'fred-macro',
      title: 'FRED macro series: UNRATE, GDPC1, DGS10, T10Y2Y',
      source: 'FRED (Federal Reserve Bank of St. Louis) keyless fredgraph.csv',
      url: urls,
      rowFormat: 'objects',
      layout: 'series: { <FRED id>: [{time, value}] } — different frequencies and spans per series',
      columns: ['time', 'value'],
      units: {
        UNRATE: '%',
        GDPC1: 'billions of chained 2017 USD (SAAR)',
        DGS10: '%',
        T10Y2Y: 'percentage points',
        time: 'ms UTC, period start date',
      },
      quirks,
      suggestedCharts: [
        'multi-line with mixed frequencies',
        'T10Y2Y line/area around zero (inversion)',
        'secondary Y scale (GDP vs %)',
      ],
      profile: seriesProfile(series, ['value']),
      series,
    });
  },

  async 'wiki-spike'() {
    const url =
      'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/Elizabeth_II/daily/20210901/20230831';
    const j = await fetchJson(url);
    const rows = j.items.map((it) => ({
      time: Date.UTC(
        Number(it.timestamp.slice(0, 4)),
        Number(it.timestamp.slice(4, 6)) - 1,
        Number(it.timestamp.slice(6, 8)),
      ),
      views: it.views,
    }));
    const tp = timeProfile(rows.map((r) => r.time));
    const cp = columnProfile(rows, ['views']);
    const sorted = rows.map((r) => r.views).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const peak = rows.find((r) => r.views === cp.views.max);
    const pre = rows
      .filter((r) => r.time < Date.UTC(2022, 8, 1))
      .map((r) => r.views)
      .sort((a, b) => a - b);
    const preMedian = pre[Math.floor(pre.length / 2)];
    const top = [...rows].sort((a, b) => b.views - a.views).slice(0, 5);

    writeDataset({
      id: 'wiki-spike',
      title: 'English Wikipedia daily pageviews of "Elizabeth II", 2021-09..2023-08',
      source: 'Wikimedia REST API pageviews (agent=user)',
      url,
      rowFormat: 'objects',
      columns: ['time', 'views'],
      units: { views: 'pageviews per day', time: 'ms UTC, day start' },
      quirks: [
        `${rows.length} days ${tp.first} .. ${tp.last}, ${tp.gaps.length} missing days`,
        `peak ${cp.views.max} views on ${iso(peak.time).slice(0, 10)}; pre-death median ${preMedian}, whole-series median ${median} -> peak is ${Math.round(cp.views.max / preMedian)}x baseline`,
        `top 5 days: ${top.map((r) => `${iso(r.time).slice(0, 10)}=${r.views}`).join(', ')}`,
        `min ${cp.views.min}; ${sorted.filter((v) => v > preMedian * 10).length} days above 10x baseline (spike plus long decaying tail)`,
        `second bump: coronation day 2023-05-06 = ${rows.find((r) => r.time === Date.UTC(2023, 4, 6))?.views} views (${Math.round((rows.find((r) => r.time === Date.UTC(2023, 4, 6))?.views ?? 0) / preMedian)}x baseline)`,
      ],
      suggestedCharts: ['line/area with linear vs auto Y (spike flattens everything)', 'bar chart', 'sparkline'],
      profile: { time: tp, columns: cp },
      rows,
    });
  },

  async 'npm-downloads'() {
    const pkgs = ['react', 'vue', 'svelte', 'preact', 'solid-js', '@angular/core'];
    const series = {};
    const urls = {};
    const quirks = [];
    for (const pkg of pkgs) {
      const url = `https://api.npmjs.org/downloads/range/2025-10-17:2026-10-16/${pkg}`;
      urls[pkg] = url;
      const j = await fetchJson(url);
      const rows = j.downloads.map((d) => ({ time: Date.parse(`${d.day}T00:00:00Z`), downloads: d.downloads }));
      series[pkg] = rows;
      const tp = timeProfile(rows.map((r) => r.time));
      const cp = columnProfile(rows, ['downloads']);
      const byDow = [0, 0, 0, 0, 0, 0, 0];
      const nDow = [0, 0, 0, 0, 0, 0, 0];
      for (const r of rows) {
        const d = new Date(r.time).getUTCDay();
        byDow[d] += r.downloads;
        nDow[d]++;
      }
      const avg = byDow.map((s, i) => s / nDow[i]);
      const weekday = (avg[1] + avg[2] + avg[3] + avg[4] + avg[5]) / 5;
      const weekend = (avg[0] + avg[6]) / 2;
      const minRow = rows.find((r) => r.downloads === cp.downloads.min);
      quirks.push(
        `${pkg}: ${rows.length} days, ${cp.downloads.min}..${cp.downloads.max}/day (min on ${iso(minRow.time).slice(0, 10)}), ${cp.downloads.zeros} zero days, weekend/weekday ratio ${(weekend / weekday).toFixed(2)}, ${tp.gaps.length} gaps`,
      );
      await sleep(300);
    }
    const maxes = Object.fromEntries(
      Object.entries(series).map(([k, rows]) => [k, Math.max(...rows.map((r) => r.downloads))]),
    );
    const big = Math.max(...Object.values(maxes));
    const small = Math.min(...Object.values(maxes));
    quirks.unshift(`scale spread: largest package peak / smallest package peak = ${(big / small).toFixed(1)}x`);
    const zeroDays = [
      ...new Set(
        Object.values(series).flatMap((rows) =>
          rows.filter((r) => r.downloads === 0).map((r) => iso(r.time).slice(0, 10)),
        ),
      ),
    ].sort();
    let tailZeros = 0;
    const reactRows = series.react;
    for (let i = reactRows.length - 1; i >= 0 && reactRows[i].downloads === 0; i--) tailZeros++;
    quirks.unshift(
      `missing data is reported as 0, not null: zero days across packages = ${zeroDays.join(', ')}; the last ${tailZeros} days are 0 for every package (stats lag), plus isolated 0-days (stats outages), so lines dive to zero`,
    );

    writeDataset({
      id: 'npm-downloads',
      title: 'npm daily downloads: react, vue, svelte, preact, solid-js, @angular/core (last 12 months)',
      source: 'npm registry downloads API',
      url: urls,
      rowFormat: 'objects',
      layout: 'series: { <package>: [{time, downloads}] } — package names include "@" and "/"',
      columns: ['time', 'downloads'],
      units: { downloads: 'downloads per day', time: 'ms UTC, day start' },
      quirks,
      suggestedCharts: ['multi-line (one dominant series)', 'stacked area', 'log-like comparison via secondary Y'],
      profile: seriesProfile(series, ['downloads']),
      series,
    });
  },

  async earthquakes() {
    const url =
      'https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&starttime=2026-09-17&endtime=2026-10-17&minmagnitude=2.5';
    const j = await fetchJson(url);
    const rows = j.features.map((f) => ({
      time: f.properties.time,
      mag: f.properties.mag,
      magType: f.properties.magType,
      depth: f.geometry?.coordinates?.[2] ?? null,
      place: f.properties.place,
    }));
    const tp = timeProfile(rows.map((r) => r.time));
    const cp = columnProfile(rows, ['mag', 'depth']);
    const magTypes = new Map();
    for (const r of rows) magTypes.set(r.magType, (magTypes.get(r.magType) ?? 0) + 1);
    const nullPlace = rows.filter((r) => r.place === null || r.place === '').length;
    const longestPlace = rows.reduce((a, r) => ((r.place?.length ?? 0) > a.length ? r.place : a), '');
    const absDeltas = [];
    for (let i = 1; i < rows.length; i++) absDeltas.push(Math.abs(rows[i].time - rows[i - 1].time));
    absDeltas.sort((a, b) => a - b);

    writeDataset({
      id: 'earthquakes',
      title: 'USGS earthquakes M2.5+, 2026-09-17..2026-10-17 (API order: newest first)',
      source: 'USGS FDSN event web service (GeoJSON)',
      url,
      rowFormat: 'objects',
      columns: ['time', 'mag', 'magType', 'depth', 'place'],
      units: {
        mag: 'magnitude (scale given by magType)',
        depth: 'km, negative = above sea level',
        time: 'ms UTC, event origin time',
      },
      quirks: [
        `${rows.length} events ${tp.first} .. ${tp.last}; order ${tp.order} (${tp.descSteps} descending steps, ${tp.ascSteps} ascending, ${tp.duplicateSteps} equal)`,
        `irregular spacing: median gap ${fmtDur(Math.round(absDeltas[Math.floor(absDeltas.length / 2)] / 1000) * 1000)}, min ${fmtDur(absDeltas[0])}, max ${fmtDur(Math.round(absDeltas[absDeltas.length - 1] / 1000) * 1000)}`,
        `mag ${cp.mag.min}..${cp.mag.max} (${cp.mag.nulls} null); ${magTypes.size} magnitude scales mixed: ${[
          ...magTypes.entries(),
        ]
          .sort((a, b) => b[1] - a[1])
          .map(([k, c]) => `${k}=${c}`)
          .join(', ')}`,
        `depth ${cp.depth.min}..${cp.depth.max} km, ${cp.depth.negatives} negative, ${cp.depth.zeros} exactly 0, ${cp.depth.nulls} null`,
        `${nullPlace} events without place; longest place: "${longestPlace}" (${longestPlace.length} chars)`,
      ],
      suggestedCharts: ['scatter-like line/bar of mag over time (descending input)', 'bar of depth (negative values)'],
      profile: { time: { ...tp, gaps: tp.gaps.length }, columns: cp },
      rows,
    });
  },

  async 'worldbank-gdp'() {
    const url = 'https://api.worldbank.org/v2/country/all/indicator/NY.GDP.MKTP.CD?format=json&date=2023&per_page=400';
    const [meta, data] = await fetchJson(url);
    const rows = data.map((d) => ({ country: d.country.value, iso3: d.countryiso3code, value: d.value }));

    const countriesUrl = 'https://api.worldbank.org/v2/country?format=json&per_page=400';
    const [, countries] = await fetchJson(countriesUrl);
    const aggregateIso3 = countries.filter((c) => c.region?.value === 'Aggregates').map((c) => c.id);
    const aggSet = new Set(aggregateIso3);
    const aggRows = rows.filter((r) => aggSet.has(r.iso3));
    const cp = columnProfile(rows, ['value']);
    const nullCountries = rows.filter((r) => r.value === null).map((r) => r.country);
    const emptyIso = rows.filter((r) => !r.iso3).length;
    const longest = rows.reduce((a, r) => (r.country.length > a.length ? r.country : a), '');
    const world = rows.find((r) => r.iso3 === 'WLD');
    const smallest = rows.filter((r) => r.value !== null).reduce((a, r) => (r.value < a.value ? r : a));
    const firstCountryIdx = rows.findIndex((r) => !aggSet.has(r.iso3));

    writeDataset({
      id: 'worldbank-gdp',
      title: 'GDP (current USD) by country and aggregate, 2023, World Bank',
      source: 'World Bank Indicators API v2 (NY.GDP.MKTP.CD)',
      url: [url, `${countriesUrl} (only to list aggregate codes in aggregateIso3)`],
      rowFormat: 'objects',
      columns: ['country', 'iso3', 'value'],
      units: { value: 'current USD' },
      quirks: [
        `${rows.length} rows (API total ${meta.total}); ${aggRows.length} are aggregates (regions, income groups, "World"), listed first in API order (first non-aggregate at index ${firstCountryIdx})`,
        `${cp.value.nulls} null values: ${nullCountries.slice(0, 12).join('; ')}${nullCountries.length > 12 ? '; ...' : ''}`,
        `value ${smallest.value} (${smallest.country}) .. ${cp.value.max} (World=${world?.value}); ${(cp.value.max / smallest.value).toExponential(1)}x spread`,
        `longest label "${longest}" (${longest.length} chars); ${emptyIso} rows with empty iso3`,
        'summing all rows double-counts: aggregates overlap each other and the countries',
      ],
      suggestedCharts: [
        'bar with category X axis (long labels, 266 categories)',
        'pie of countries only (filter by aggregateIso3)',
      ],
      aggregateIso3,
      rows,
    });
  },
};

const wanted = process.argv.slice(2);
for (const [id, job] of Object.entries(jobs)) {
  if (wanted.length && !wanted.includes(id)) continue;

  console.log(`--- ${id}`);
  try {
    await job();
  } catch (err) {
    console.error(`FAILED ${id}:`, err.message);
  }
}

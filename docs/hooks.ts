import { useEffect, useState } from 'react';

import type { LineData, OHLCData } from '@wick-charts/react';

import { LineStreamingSource, StreamingSource } from './data';

const BATCH_SIZE = 50;
const BATCH_DELAY = 600;

export function useOHLCStream(allData: OHLCData[], delay = 300) {
  const [data, setData] = useState<OHLCData[]>([]);
  const [phase, setPhase] = useState<'loading' | 'live'>('loading');

  useEffect(() => {
    const total = Math.ceil(allData.length / BATCH_SIZE);
    let batch = 0;
    const loadNext = () => {
      batch++;
      setData(allData.slice(0, batch * BATCH_SIZE));
      if (batch < total) setTimeout(loadNext, BATCH_DELAY);
      else setPhase('live');
    };
    setTimeout(loadNext, delay);
  }, []);

  useEffect(() => {
    if (phase !== 'live' || data.length === 0) return;
    const source = new StreamingSource(data[data.length - 1], 60);
    const unsub = source.onTick((candle) => {
      setData((prev) => {
        const last = prev[prev.length - 1];
        if (last.time === candle.time) {
          const next = [...prev];
          next[next.length - 1] = candle;
          return next;
        }
        return [...prev, candle];
      });
    });
    source.start(500);
    return () => {
      unsub();
      source.stop();
    };
  }, [phase]);

  return { data, phase };
}

export function useLineStreams(allData: LineData[][], delay = 500) {
  const [datasets, setDatasets] = useState<LineData[][]>(() => allData.map(() => []));
  const [phase, setPhase] = useState<'loading' | 'live'>('loading');

  useEffect(() => {
    const total = Math.ceil(allData[0].length / BATCH_SIZE);
    let batch = 0;
    const loadNext = () => {
      batch++;
      const end = batch * BATCH_SIZE;
      setDatasets(allData.map((line) => line.slice(0, end)));
      if (batch < total) setTimeout(loadNext, BATCH_DELAY);
      else setPhase('live');
    };
    setTimeout(loadNext, delay);
  }, []);

  useEffect(() => {
    if (phase !== 'live') return;
    const sources = allData.map((line) => new LineStreamingSource(line[line.length - 1], 60));
    const unsubs = sources.map((source, i) =>
      source.onTick((point) => {
        setDatasets((prev) => {
          const next = [...prev];
          const arr = prev[i];
          const last = arr[arr.length - 1];
          if (last && last.time === point.time) {
            next[i] = [...arr.slice(0, -1), point];
          } else {
            next[i] = [...arr, point];
          }
          return next;
        });
      }),
    );
    sources.forEach((s) => s.start(400 + Math.random() * 200));
    return () => {
      unsubs.forEach((u) => u());
      sources.forEach((s) => s.stop());
    };
  }, [phase]);

  return { datasets, phase };
}

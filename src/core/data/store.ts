import { binarySearch } from "../../utils/math";
import { EventEmitter } from "../events";

interface StoreEvents {
  update: () => void;
}

export class TimeSeriesStore<T extends { time: number }> extends EventEmitter<StoreEvents> {
  private data: T[] = [];

  setData(data: T[]): void {
    this.data = [...data].sort((a, b) => a.time - b.time);
    this.emit("update");
  }

  append(point: T): void {
    if (this.data.length > 0 && point.time <= this.data[this.data.length - 1].time) {
      this.updateLast(point);
      return;
    }
    this.data.push(point);
    this.emit("update");
  }

  updateLast(point: T): void {
    if (this.data.length === 0) return;
    this.data[this.data.length - 1] = point;
    this.emit("update");
  }

  getAll(): T[] {
    return this.data;
  }

  getVisibleData(from: number, to: number): T[] {
    if (this.data.length === 0) return [];
    const startIdx = Math.max(0, binarySearch(this.data, from, (d) => d.time) - 1);
    const endIdx = Math.min(this.data.length, binarySearch(this.data, to, (d) => d.time) + 1);
    return this.data.slice(startIdx, endIdx);
  }

  first(): T | undefined {
    return this.data[0];
  }

  last(): T | undefined {
    return this.data[this.data.length - 1];
  }

  get length(): number {
    return this.data.length;
  }

  isEmpty(): boolean {
    return this.data.length === 0;
  }
}

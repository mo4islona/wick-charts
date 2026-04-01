import type { PriceRange } from "../types";

const NICE_INTERVALS = [
  0.0001, 0.0002, 0.0005, 0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500,
  1000, 2000, 5000, 10000, 20000, 50000,
];

export class PriceScale {
  private min = 0;
  private max = 1;
  private height = 1;
  private pixelRatio = 1;

  update(range: PriceRange, mediaHeight: number, pixelRatio: number): void {
    this.min = range.min;
    this.max = range.max;
    this.height = mediaHeight;
    this.pixelRatio = pixelRatio;
  }

  priceToY(price: number): number {
    return (1 - (price - this.min) / (this.max - this.min)) * this.height;
  }

  priceToBitmapY(price: number): number {
    return Math.round(this.priceToY(price) * this.pixelRatio);
  }

  yToPrice(y: number): number {
    return this.max - (y / this.height) * (this.max - this.min);
  }

  niceTickValues(): number[] {
    const minPixelSpacing = 50;
    const pricePerPixel = (this.max - this.min) / this.height;
    const minPriceSpacing = pricePerPixel * minPixelSpacing;

    let tickInterval = NICE_INTERVALS[NICE_INTERVALS.length - 1];
    for (const interval of NICE_INTERVALS) {
      if (interval >= minPriceSpacing) {
        tickInterval = interval;
        break;
      }
    }

    const ticks: number[] = [];
    const start = Math.ceil(this.min / tickInterval) * tickInterval;
    for (let p = start; p <= this.max; p += tickInterval) {
      ticks.push(p);
    }
    return ticks;
  }

  getRange(): PriceRange {
    return { min: this.min, max: this.max };
  }

  getMediaHeight(): number {
    return this.height;
  }

  formatPrice(price: number): string {
    const range = this.max - this.min;
    if (range < 0.01) return price.toFixed(6);
    if (range < 0.1) return price.toFixed(4);
    if (range < 10) return price.toFixed(2);
    if (range < 1000) return price.toFixed(1);
    return price.toFixed(0);
  }
}

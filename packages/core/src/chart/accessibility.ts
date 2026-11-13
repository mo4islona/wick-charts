/** Fewest milliseconds between two text updates: a live chart must not rewrite the label on every tick. */
const UPDATE_INTERVAL_MS = 1000;

/** Hidden from sight, not from screen readers or `innerText`. */
const VISUALLY_HIDDEN: Partial<CSSStyleDeclaration> = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  margin: '-1px',
  padding: '0',
  border: '0',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'pre-line',
};

export interface AccessibilityConfig {
  /** Default `true`. `false` removes every attribute and element this module adds. */
  enabled?: boolean;
  /** Replaces the generated short label. The full text stays generated. */
  label?: string;
}

export interface AccessibleText {
  summary: string;
  text: string;
}

/**
 * Keeps the chart readable without pixels: the main canvas becomes an image
 * whose `aria-label` is a short summary, and a visually hidden element next to
 * it holds the full description for screen readers and browser agents.
 */
export class ChartAccessibility {
  readonly #container: HTMLElement;
  readonly #canvas: HTMLCanvasElement;
  readonly #overlay: HTMLCanvasElement;
  readonly #read: () => AccessibleText;

  #enabled = true;
  #label: string | undefined;
  #details: HTMLElement | null = null;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #lastUpdate = Number.NEGATIVE_INFINITY;

  constructor(args: {
    container: HTMLElement;
    canvases: { main: HTMLCanvasElement; overlay: HTMLCanvasElement };
    read: () => AccessibleText;
  }) {
    this.#container = args.container;
    this.#canvas = args.canvases.main;
    this.#overlay = args.canvases.overlay;
    this.#read = args.read;
  }

  configure(config: AccessibilityConfig): void {
    const enabled = config.enabled ?? true;
    const changed = enabled !== this.#enabled || config.label !== this.#label;
    this.#enabled = enabled;
    this.#label = config.label;
    if (!changed) return;

    if (!enabled) {
      this.#detach();

      return;
    }

    this.update();
  }

  /** Schedule a text update, at most one per {@link UPDATE_INTERVAL_MS}. */
  markDirty(): void {
    if (!this.#enabled || this.#timer !== null) return;

    const wait = Math.max(0, this.#lastUpdate + UPDATE_INTERVAL_MS - Date.now());
    this.#timer = setTimeout(() => {
      this.#timer = null;
      this.update();
    }, wait);
  }

  /** Write the text now. */
  update(): void {
    if (!this.#enabled) return;

    this.#lastUpdate = Date.now();
    const { summary, text } = this.#read();

    this.#canvas.setAttribute('role', 'img');
    this.#canvas.setAttribute('aria-label', this.#label ?? summary);
    this.#overlay.setAttribute('aria-hidden', 'true');

    const details = this.#details ?? this.#createDetails();
    if (details.textContent !== text) details.textContent = text;
  }

  destroy(): void {
    this.#detach();
  }

  #createDetails(): HTMLElement {
    const details = document.createElement('div');
    details.dataset.wickDescription = '';
    Object.assign(details.style, VISUALLY_HIDDEN);
    this.#container.appendChild(details);
    this.#details = details;

    return details;
  }

  #detach(): void {
    if (this.#timer !== null) clearTimeout(this.#timer);

    this.#timer = null;
    this.#canvas.removeAttribute('role');
    this.#canvas.removeAttribute('aria-label');
    this.#overlay.removeAttribute('aria-hidden');
    this.#details?.remove();
    this.#details = null;
  }
}

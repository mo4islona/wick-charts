import { type HTMLAttributes, type PointerEvent, createContext, useContext, useRef } from 'react';

import { Code } from 'lucide-react';

/** The card the Code tab prints, shared by the playground with its `<Cell cardId>`s. */
export interface CardPick {
  pickedId: string;
  /** The Code tab is open, so the cards mark the picked one. */
  marking: boolean;
  titleOf: (id: string) => string;
  pick: (id: string) => void;
}

export const CardPickContext = createContext<CardPick | null>(null);

// A press that travels further is a pan or a drag, not a pick.
const CLICK_TOLERANCE = 4;

// A click on the chart's own controls stays theirs.
const OWN_CONTROLS = 'button, a, input, select, textarea, label, [data-legend], [data-chart-perf-hud]';

export interface CardPickHandle {
  title: string;
  picked: boolean;
  marking: boolean;
  pick: () => void;
  onPointerDown: (e: PointerEvent) => void;
  onPointerUp: (e: PointerEvent) => void;
}

/**
 * Picks the card on a plain click or tap anywhere on it; `null` outside a
 * playground with per-card code. Pointer events, not `click`: the chart's
 * touch handling cancels the click a tap would make.
 */
export function useCardPick(cardId: string | undefined): CardPickHandle | null {
  const context = useContext(CardPickContext);
  const down = useRef<{ x: number; y: number } | null>(null);

  if (!context || cardId === undefined) return null;

  const pick = () => context.pick(cardId);

  const onPointerDown = (e: PointerEvent) => {
    down.current = e.button === 0 ? { x: e.clientX, y: e.clientY } : null;
  };

  const onPointerUp = (e: PointerEvent) => {
    const start = down.current;
    down.current = null;
    if (!start) return;

    const moved = Math.hypot(e.clientX - start.x, e.clientY - start.y) > CLICK_TOLERANCE;
    if (moved) return;

    const onOwnControl = e.target instanceof Element && e.target.closest(OWN_CONTROLS) !== null;
    if (onOwnControl) return;

    pick();
  };

  return {
    title: context.titleOf(cardId),
    picked: context.pickedId === cardId,
    marking: context.marking,
    pick,
    onPointerDown,
    onPointerUp,
  };
}

/**
 * A card the reader can pick for the Code tab. While the Code tab is open, the
 * picked card is marked and a pill button picks a card by keyboard.
 */
export function CardFrame({ cardId, children, ...rest }: HTMLAttributes<HTMLDivElement> & { cardId?: string }) {
  const card = useCardPick(cardId);
  const marking = card?.marking === true;
  const marked = marking && card?.picked === true;

  return (
    <div
      {...rest}
      data-card-pickable={marking ? '' : undefined}
      data-card-picked={marked ? '' : undefined}
      onPointerDown={card?.onPointerDown}
      onPointerUp={card?.onPointerUp}
    >
      {children}

      {card && marking && (
        <button
          type="button"
          className="pg-card-pick"
          aria-label={`Show the code of ${card.title}`}
          aria-pressed={card.picked}
          onClick={card.pick}
        >
          <Code size={12} />
          Code
        </button>
      )}
    </div>
  );
}

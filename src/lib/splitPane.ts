// SPDX-License-Identifier: AGPL-3.0-only

/**
 * #105: width rules for a draggable two-pane split (the Write Paper session:
 * chat on the left, the paper session on the right). Pure functions so the
 * clamping and persistence can be unit-tested without a DOM.
 *
 * The split is stored as the left pane's fraction of the container (0–1), so
 * it survives window resizes; it's clamped against pixel minimums for both
 * panes at the current container width.
 */

export interface SplitLimits {
  /** Narrowest the left pane may get, in px. */
  minLeft: number;
  /** Narrowest the right pane may get, in px. */
  minRight: number;
  /** Width of the divider itself, in px (taken from the space both panes share). */
  divider: number;
}

export const PAPER_SPLIT_LIMITS: SplitLimits = { minLeft: 320, minRight: 440, divider: 12 };
export const PAPER_SPLIT_DEFAULT = 0.38;
/** How far one arrow-key press moves the divider. */
export const SPLIT_KEY_STEP = 0.02;

/**
 * Keeps the left fraction inside both panes' minimum widths. If the container
 * is too narrow to honour both minimums, the panes share the space by the
 * ratio of their minimums rather than one of them collapsing.
 */
export function clampSplit(fraction: number, containerWidth: number, limits: SplitLimits = PAPER_SPLIT_LIMITS): number {
  const usable = containerWidth - limits.divider;
  if (!Number.isFinite(fraction)) fraction = PAPER_SPLIT_DEFAULT;
  if (!(usable > 0)) return Math.min(Math.max(fraction, 0), 1);
  if (usable < limits.minLeft + limits.minRight) return limits.minLeft / (limits.minLeft + limits.minRight);
  const min = limits.minLeft / usable;
  const max = 1 - limits.minRight / usable;
  return Math.min(Math.max(fraction, min), max);
}

/** The left fraction for a pointer at `clientX`, given the container's left edge and width. */
export function fractionFromPointer(clientX: number, containerLeft: number, containerWidth: number, limits: SplitLimits = PAPER_SPLIT_LIMITS): number {
  const usable = containerWidth - limits.divider;
  if (!(usable > 0)) return PAPER_SPLIT_DEFAULT;
  return clampSplit((clientX - containerLeft - limits.divider / 2) / usable, containerWidth, limits);
}

/** Reads a stored fraction; anything missing, malformed or out of range falls back to the default. */
export function parseStoredSplit(raw: string | null | undefined, fallback = PAPER_SPLIT_DEFAULT): number {
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 && n < 1 ? n : fallback;
}

export function serializeSplit(fraction: number): string {
  return fraction.toFixed(4);
}

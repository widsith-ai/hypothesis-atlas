// SPDX-License-Identifier: AGPL-3.0-only
"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

// useLayoutEffect on the client (restore before paint), useEffect on the server (no warning).
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;
import {
  PAPER_SPLIT_DEFAULT,
  PAPER_SPLIT_LIMITS,
  SPLIT_KEY_STEP,
  clampSplit,
  fractionFromPointer,
  parseStoredSplit,
  serializeSplit,
  type SplitLimits,
} from "@/lib/splitPane";

/**
 * #105: two panes side by side with a draggable divider. Used by the Write
 * Paper session (chat left, paper session right).
 *
 * - Drag with mouse, touch or pen; double-click the divider (or press Enter
 *   on it) to reset; arrow keys nudge, Home/End jump to the limits.
 * - The split is remembered per browser under `storageKey`.
 * - Below the `lg` breakpoint the panes stack (left first) and the divider is
 *   hidden; widths only apply at `lg` and up, via the `--split-left` variable.
 */
export default function ResizableSplit({
  left,
  right,
  storageKey,
  defaultFraction = PAPER_SPLIT_DEFAULT,
  limits = PAPER_SPLIT_LIMITS,
  leftLabel = "Chat",
  rightLabel = "Session",
  className = "",
}: {
  left: React.ReactNode;
  right: React.ReactNode;
  storageKey: string;
  defaultFraction?: number;
  limits?: SplitLimits;
  leftLabel?: string;
  rightLabel?: string;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // `preferred` is what the user chose (and what's stored); the width shown is
  // that, clamped to the current container. Keeping them apart means a window
  // that's briefly narrow never overwrites the remembered split.
  const [preferred, setPreferred] = useState(defaultFraction);
  const [containerWidth, setContainerWidth] = useState(0);
  const [dragging, setDragging] = useState(false);
  const fraction = containerWidth > 0 ? clampSplit(preferred, containerWidth, limits) : preferred;
  const fractionRef = useRef(fraction);
  fractionRef.current = fraction;

  const width = () => containerRef.current?.getBoundingClientRect().width ?? 0;

  const persist = useCallback(
    (f: number) => {
      try {
        localStorage.setItem(storageKey, serializeSplit(f));
      } catch {
        /* storage blocked: the split lasts for this page view */
      }
    },
    [storageKey],
  );

  // Restore before paint so the panes don't jump.
  useIsomorphicLayoutEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(storageKey);
    } catch {
      stored = null;
    }
    setPreferred(parseStoredSplit(stored, defaultFraction));
    setContainerWidth(width());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // Track the container's width so the shown split stays within both minimums.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setContainerWidth(width()));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setPreferred(fractionFromPointer(e.clientX, rect.left, rect.width, limits));
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    persist(fractionRef.current);
  };

  const setAndPersist = (f: number) => {
    const next = clampSplit(f, width(), limits);
    setPreferred(next);
    persist(next);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const w = width();
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      setAndPersist(fraction + (e.key === "ArrowRight" ? SPLIT_KEY_STEP : -SPLIT_KEY_STEP));
    } else if (e.key === "Home") {
      e.preventDefault();
      setAndPersist(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setAndPersist(1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      setAndPersist(clampSplit(defaultFraction, w, limits));
    }
  };

  const percent = Math.round(fraction * 100);
  // Announce the range the divider can actually reach at this width.
  const minPercent = containerWidth > 0 ? Math.round(clampSplit(0, containerWidth, limits) * 100) : 0;
  const maxPercent = containerWidth > 0 ? Math.round(clampSplit(1, containerWidth, limits) * 100) : 100;

  return (
    <div
      ref={containerRef}
      className={`flex flex-col gap-4 lg:flex-row lg:gap-0 ${dragging ? "select-none cursor-col-resize" : ""} ${className}`}
      style={{ ["--split-left" as string]: `calc((100% - ${limits.divider}px) * ${fraction})` }}
    >
      <section aria-label={leftLabel} className="min-w-0 flex-none w-full lg:w-[var(--split-left)] lg:h-full">
        {left}
      </section>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={`Resize ${leftLabel.toLowerCase()} and ${rightLabel.toLowerCase()}`}
        aria-valuemin={minPercent}
        aria-valuemax={maxPercent}
        aria-valuenow={percent}
        aria-valuetext={`${leftLabel} ${percent}%`}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={() => setAndPersist(clampSplit(defaultFraction, width(), limits))}
        onKeyDown={onKeyDown}
        title="Drag to resize · double-click to reset"
        className="group relative hidden lg:flex flex-none items-center justify-center cursor-col-resize touch-none outline-none"
        style={{ width: limits.divider }}
      >
        <span
          aria-hidden
          className={`h-full w-px transition-colors ${dragging ? "bg-indigo-500" : "bg-gray-200 group-hover:bg-indigo-400 group-focus-visible:bg-indigo-500"}`}
        />
        <span
          aria-hidden
          className={`absolute h-10 w-1.5 rounded-full transition-colors ${dragging ? "bg-indigo-500" : "bg-gray-300 group-hover:bg-indigo-400 group-focus-visible:bg-indigo-500"}`}
        />
      </div>

      <section aria-label={rightLabel} className="min-w-0 flex-1 lg:h-full">
        {right}
      </section>
    </div>
  );
}

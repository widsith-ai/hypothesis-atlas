// SPDX-License-Identifier: AGPL-3.0-only
"use client";

import { useCallback, useRef, useSyncExternalStore } from "react";

/**
 * #93: a place in a page's own top bar where the account widget
 * (AuthWidget: Sign in / profile menu / Model key) renders, so it takes part
 * in the bar's layout like any other nav item instead of floating over it.
 *
 * AuthWidget is mounted once in RootLayout and portals itself into the most
 * recently mounted slot. A page without a slot keeps the widget's fixed
 * top-right position.
 *
 * Slots are tracked as a stack and removed by identity: React clears a
 * callback ref (calls it with null) *before* detaching the element, so
 * "is it still connected?" can't be used to tell which slot went away.
 */

const slots: HTMLElement[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const currentSlot = () => slots[slots.length - 1] ?? null;

/** The slot to render into, or null (then the widget falls back to fixed positioning). */
export function useAccountSlot(): HTMLElement | null {
  return useSyncExternalStore(subscribe, currentSlot, () => null);
}

export default function AccountSlot({ className = "" }: { className?: string }) {
  const mine = useRef<HTMLElement | null>(null);
  const ref = useCallback((el: HTMLDivElement | null) => {
    if (el) {
      mine.current = el;
      slots.push(el);
    } else if (mine.current) {
      const i = slots.lastIndexOf(mine.current);
      if (i !== -1) slots.splice(i, 1);
      mine.current = null;
    }
    emit();
  }, []);
  return <div ref={ref} data-atlas-account-slot className={`flex items-center ${className}`} />;
}

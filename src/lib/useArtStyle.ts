"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  ART_STYLE_CHANGE_EVENT,
  ART_STYLE_KEY,
  DEFAULT_ART_STYLE,
  getArtStyle,
  isArtStyle,
  setArtStyle,
  type ArtStyle,
} from "./artStyle";

function subscribe(onChange: () => void) {
  // Another tab changed it: follow along.
  const onStorage = (e: StorageEvent) => {
    if (e.key === ART_STYLE_KEY && isArtStyle(e.newValue)) {
      document.documentElement.dataset.style = e.newValue;
      onChange();
    }
  };
  window.addEventListener(ART_STYLE_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(ART_STYLE_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** The current art style, and a setter. Server render uses the default. */
export function useArtStyle(): [ArtStyle, (style: ArtStyle) => void] {
  const style = useSyncExternalStore(subscribe, getArtStyle, () => DEFAULT_ART_STYLE);
  return [style, useCallback((s: ArtStyle) => setArtStyle(s), [])];
}

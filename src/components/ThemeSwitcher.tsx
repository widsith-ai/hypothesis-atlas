// SPDX-License-Identifier: AGPL-3.0-only
"use client";

import { useEffect, useRef, useState } from "react";
import { ART_STYLES, ART_STYLE_LABEL, type ArtStyle } from "@/lib/artStyle";
import { useArtStyle } from "@/lib/useArtStyle";

export type Theme = "dark" | "light" | "vibrant";

const THEMES: Theme[] = ["dark", "light", "vibrant"];

const THEME_DOT: Record<Theme, string> = {
  dark: "bg-zinc-900 ring-1 ring-zinc-500",
  light: "bg-zinc-100 ring-1 ring-zinc-400",
  vibrant: "bg-teal-600 ring-1 ring-amber-400",
};

// The three theme keys (every page reads `theme` from localStorage), named for
// the painting each one evokes in each art style (#87, src/lib/artStyle.ts).
const THEME_LABEL: Record<ArtStyle, Record<Theme, string>> = {
  monet: { dark: "Impression, Sunrise", light: "Water Lilies", vibrant: "The Footbridge" },
  ink: { dark: "Ink Night", light: "Xuan Paper", vibrant: "Jade Hills" },
};

const STYLE_DOT: Record<ArtStyle, string> = {
  monet: "bg-gradient-to-br from-sky-300 via-violet-300 to-pink-300 ring-1 ring-emerald-500/60",
  ink: "bg-zinc-900 ring-1 ring-red-500/70",
};

/**
 * Compact dropdown for the art style (Monet / Ink wash, #87) and the scene
 * (colour mode) within it. Moved here from the landing page (#97) so the
 * open-source app, which opens on Explorer, can still switch styles.
 * Choosing a scene saves it to localStorage (`theme`) for the other pages.
 */
export default function ThemeSwitcher({ theme, onThemeChange }: { theme: Theme; onThemeChange: (theme: Theme) => void }) {
  const [artStyle, setArtStyle] = useArtStyle();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const pickTheme = (t: Theme) => {
    onThemeChange(t);
    try {
      localStorage.setItem("theme", t);
    } catch {
      /* storage blocked: the choice lasts for this page view */
    }
    setOpen(false);
  };

  const dark = theme === "dark";
  const item = (active: boolean) =>
    `w-full flex items-center gap-2 px-3 py-2 text-xs font-medium transition-colors ${
      active
        ? dark ? "bg-zinc-700 text-white" : "bg-zinc-100 text-zinc-900"
        : dark ? "text-zinc-300 hover:bg-zinc-700/60" : "text-zinc-600 hover:bg-zinc-50"
    }`;
  const heading = `px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.2em] ${dark ? "text-zinc-500" : "text-zinc-400"}`;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Style and scene"
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium backdrop-blur-sm transition-colors ${
          dark
            ? "bg-zinc-800/50 text-zinc-200 hover:bg-zinc-700/50"
            : theme === "light"
              ? "bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-50"
              : "bg-white/70 border border-teal-700/30 text-teal-900 hover:bg-white"
        }`}
      >
        <span className={`w-2.5 h-2.5 rounded-full ${THEME_DOT[theme]}`} />
        <span className="hidden sm:inline">{THEME_LABEL[artStyle][theme]}</span>
        <svg className={`w-3 h-3 opacity-60 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className={`absolute top-full right-0 mt-1.5 w-48 rounded-lg shadow-lg overflow-hidden z-30 ${
            dark ? "bg-zinc-800 border border-zinc-700" : "bg-white border border-zinc-200"
          }`}
        >
          <div className={`${heading} pt-2`}>Style</div>
          {ART_STYLES.map((s) => (
            <button key={s} type="button" onClick={() => setArtStyle(s)} aria-pressed={artStyle === s} className={item(artStyle === s)}>
              <span className={`w-2.5 h-2.5 rounded-full ${STYLE_DOT[s]}`} />
              {ART_STYLE_LABEL[s]}
            </button>
          ))}
          <div className={`${heading} pt-2.5 border-t ${dark ? "border-zinc-700" : "border-zinc-200"}`}>Scene</div>
          {THEMES.map((t) => (
            <button key={t} type="button" onClick={() => pickTheme(t)} aria-pressed={theme === t} className={item(theme === t)}>
              <span className={`w-2.5 h-2.5 rounded-full ${THEME_DOT[t]}`} />
              {THEME_LABEL[artStyle][t]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

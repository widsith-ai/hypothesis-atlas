// Plain module (no hooks, no "use client") so the layout, a server component,
// can import ART_STYLE_INIT_SCRIPT. The React hook is in src/lib/useArtStyle.ts.

/**
 * Art style (#87): the painting the whole app is dressed in. Independent of
 * the colour mode (`theme` = dark / light / vibrant), which picks the scene
 * within a style:
 *
 *                monet (default)        ink
 *   light   →   Water Lilies           Xuan Paper
 *   vibrant →   The Footbridge         Jade Hills
 *   dark    →   Impression, Sunrise    Ink Night
 *
 * The choice lives in localStorage (`style`) and on <html data-style>, which
 * the palette (src/lib/palette.ts), the component layer (src/app/paint.css)
 * and the page backgrounds (src/app/globals.css) all key off. The layout sets
 * the attribute before first paint with ART_STYLE_INIT_SCRIPT, so there is no
 * flash of the wrong style.
 */
export type ArtStyle = "monet" | "ink";

export const ART_STYLES: readonly ArtStyle[] = ["monet", "ink"];
export const DEFAULT_ART_STYLE: ArtStyle = "monet";
export const ART_STYLE_KEY = "style";

export const ART_STYLE_LABEL: Record<ArtStyle, string> = {
  monet: "Monet",
  ink: "Ink wash",
};

export const ART_STYLE_CHANGE_EVENT = "atlas:art-style";

export const isArtStyle = (v: unknown): v is ArtStyle => v === "monet" || v === "ink";

/** Inline <head> script: applies the saved style before the page paints. */
export const ART_STYLE_INIT_SCRIPT = `try{var s=localStorage.getItem(${JSON.stringify(
  ART_STYLE_KEY,
)});if(s==="monet"||s==="ink")document.documentElement.dataset.style=s}catch(e){}`;

export function getArtStyle(): ArtStyle {
  if (typeof document === "undefined") return DEFAULT_ART_STYLE;
  const s = document.documentElement.dataset.style;
  return isArtStyle(s) ? s : DEFAULT_ART_STYLE;
}

export function setArtStyle(style: ArtStyle) {
  document.documentElement.dataset.style = style;
  try {
    localStorage.setItem(ART_STYLE_KEY, style);
  } catch {
    /* private mode / storage blocked: the choice lasts for this page view */
  }
  window.dispatchEvent(new Event(ART_STYLE_CHANGE_EVENT));
}

/**
 * Runtime-switchable colour palette (#87).
 *
 * Tailwind's colour families resolve to CSS variables (`--c-zinc-500` holds
 * "r g b"), and the variables are defined once per art style:
 *
 *   :root                → Monet palette (default)
 *   [data-style="ink"]   → ink-wash palette
 *
 * so `bg-zinc-900/60`, gradients, etc. switch with the `data-style` attribute
 * on <html> (src/lib/artStyle.ts) without touching any component.
 */
import * as inkP from "./inkPalette";
import * as monetP from "./monetPalette";

type Scale = Record<number, string>;
type FamilyMap = Record<string, Scale>;

const rgbTriplet = (hex: string) => {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(" ");
};

const varRef = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`;

const families = Object.keys(inkP.familyMap);

/** Tailwind `theme.extend.colors`: every family/shade, plus white and black, as variables. */
export const tailwindColors: Record<string, string | Record<string, string>> = {
  ...Object.fromEntries(
    families.map((fam) => [
      fam,
      Object.fromEntries(
        Object.keys((inkP.familyMap as FamilyMap)[fam]).map((shade) => [shade, varRef(`${fam}-${shade}`)]),
      ),
    ]),
  ),
  white: varRef("white"),
  black: varRef("black"),
};

function vars(map: FamilyMap, white: string, black: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const fam of families) {
    for (const [shade, hex] of Object.entries(map[fam])) out[`--c-${fam}-${shade}`] = rgbTriplet(hex);
  }
  out["--c-white"] = rgbTriplet(white);
  out["--c-black"] = rgbTriplet(black);
  return out;
}

/** Base CSS: variable definitions for each art style. Added by a plugin in tailwind.config.ts. */
export const paletteBase = {
  ":root": vars(monetP.familyMap as FamilyMap, monetP.canvas, monetP.violetBlack),
  ':root[data-style="ink"]': vars(inkP.familyMap as FamilyMap, inkP.paper, inkP.inkBlack),
};

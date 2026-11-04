/**
 * Monet / Impressionist palette — the default "monet" art style (#87).
 *
 * Same contract as src/lib/inkPalette.ts: Tailwind's built-in colour families
 * are remapped onto pigments, so every existing `bg-zinc-50` / `text-indigo-600`
 * keeps its role but renders in this palette. Each shade has the same OKLCH
 * lightness as the matching ink shade (grey ↔ ink, cobalt ↔ huaqing, …), so
 * every text/background pairing keeps its contrast when the user switches
 * style — only hue and chroma change (src/lib/palette.test.ts checks this).
 *
 *   gray / zinc / slate / neutral / stone → Prussian-blue grey (blue shadow, never black)
 *   blue / indigo                         → cobalt
 *   sky / cyan                            → cerulean
 *   purple / violet                       → mauve
 *   red / rose / pink / fuchsia           → rose madder
 *   green / emerald / teal / lime         → viridian / sap green
 *   amber / orange / yellow               → chrome yellow / cadmium orange
 *
 * Shades were generated in OKLCH from the ink scales' lightness; hand edits
 * must keep the lightness within the test's tolerance.
 */

/** Prussian-blue grey — Monet painted shadow as blue and violet, never black
 *  or neutral grey. All body and secondary text uses this scale. 500–700 (the
 *  usual secondary-text shades) sit a step darker than their ink twins, so
 *  text stays readable over glass panels and brushwork (#90). */
export const lilacGrey = {
  50: "#f2f4fa",
  100: "#e8ebf3",
  200: "#d5dae3",
  300: "#bbc1ce",
  400: "#929bae",
  500: "#5d6880",
  600: "#3d4862",
  700: "#2a3652",
  800: "#1e2a49",
  900: "#101b38",
  950: "#071027",
};

/** Cobalt blue — pond depths and evening water. */
export const cobalt = {
  50: "#eef4ff",
  100: "#dbe7fe",
  200: "#b5cfff",
  300: "#8dafec",
  400: "#658bd0",
  500: "#476cb4",
  600: "#335697",
  700: "#27457d",
  800: "#1f3765",
  900: "#182b4f",
  950: "#0c1a34",
};

/** Cerulean — open sky reflected in water. */
export const cerulean = {
  50: "#e6f7ff",
  100: "#ceebf9",
  200: "#a8d4e8",
  300: "#7ab5d0",
  400: "#4c94b2",
  500: "#287898",
  600: "#116380",
  700: "#055069",
  800: "#054054",
  900: "#073241",
  950: "#011d28",
};

/** Mauve / lilac — the haze between the lilies. */
export const mauve = {
  50: "#f7efff",
  100: "#eee0fb",
  200: "#d8c3ec",
  300: "#ba9fd3",
  400: "#9676b2",
  500: "#785895",
  600: "#62447c",
  700: "#503566",
  800: "#3f2950",
  900: "#2f1f3d",
  950: "#1d1127",
};

/** Rose madder — water-lily blossoms. */
export const roseMadder = {
  50: "#fff1f3",
  100: "#fedee2",
  200: "#fbb8c3",
  300: "#e691a1",
  400: "#ca6a7e",
  500: "#ae4b62",
  600: "#963b51",
  700: "#7c2d40",
  800: "#632333",
  900: "#4d1c27",
  950: "#2f0c14",
};

/** Viridian & sap green — lily pads, willow, the footbridge. */
export const viridian = {
  50: "#e6faea",
  100: "#d3eed9",
  200: "#b2dabb",
  300: "#89be96",
  400: "#609f72",
  500: "#3f8354",
  600: "#2c6b41",
  700: "#1f5733",
  800: "#184628",
  900: "#14361f",
  950: "#07200f",
};

/** Chrome yellow & cadmium orange — sunlight, the sunrise. */
export const chrome = {
  50: "#fff4e8",
  100: "#fee3c8",
  200: "#f5c99b",
  300: "#e2a96b",
  400: "#cd8b3c",
  500: "#b4710b",
  600: "#935b09",
  700: "#754806",
  800: "#5d3804",
  900: "#492b02",
  950: "#2b1700",
};

/** Primed-canvas white and Prussian-blue black, replacing pure #fff / #000. */
export const canvas = "#fbfbf8";
export const violetBlack = "#060d22";

/** Tailwind family → Monet pigment. Used by src/lib/palette.ts. */
export const familyMap = {
  gray: lilacGrey,
  zinc: lilacGrey,
  slate: lilacGrey,
  neutral: lilacGrey,
  stone: lilacGrey,
  blue: cobalt,
  indigo: cobalt,
  sky: cerulean,
  cyan: cerulean,
  purple: mauve,
  violet: mauve,
  red: roseMadder,
  rose: roseMadder,
  pink: roseMadder,
  fuchsia: roseMadder,
  green: viridian,
  emerald: viridian,
  teal: viridian,
  lime: viridian,
  amber: chrome,
  orange: chrome,
  yellow: chrome,
} as const;

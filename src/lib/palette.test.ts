import { describe, expect, it } from "vitest";
import { paletteBase, tailwindColors } from "./palette";
import * as ink from "./inkPalette";
import * as monet from "./monetPalette";

// OKLab lightness of an sRGB hex colour.
function lightness(hex: string): number {
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
}

const GREYS = new Set(["gray", "zinc", "slate", "neutral", "stone"]);

describe("art-style palettes (#87)", () => {
  const monetVars = paletteBase[":root"];
  const inkVars = paletteBase[':root[data-style="ink"]'];

  it("defines the same colour variables for both styles", () => {
    expect(Object.keys(monetVars).sort()).toEqual(Object.keys(inkVars).sort());
    expect(monetVars["--c-zinc-900"]).toMatch(/^\d+ \d+ \d+$/);
  });

  it("points every Tailwind colour at a defined variable", () => {
    const refs = JSON.stringify(tailwindColors).match(/--c-[a-z]+(-\d+)?/g) ?? [];
    expect(refs.length).toBeGreaterThan(200);
    for (const ref of refs) expect(monetVars).toHaveProperty(ref);
  });

  it("keeps each Monet shade at the ink shade's lightness (secondary-text greys darker), so contrast never drops", () => {
    for (const fam of Object.keys(ink.familyMap) as (keyof typeof ink.familyMap)[]) {
      const inkScale = ink.familyMap[fam] as Record<number, string>;
      const monetScale = monet.familyMap[fam] as Record<number, string>;
      for (const shade of Object.keys(inkScale)) {
        const diff = lightness(monetScale[+shade]) - lightness(inkScale[+shade]);
        // Monet's secondary-text greys (500–700) are deliberately a step darker
        // (#90): more contrast on light glass, never less. Everything else matches.
        if (GREYS.has(fam) && ["500", "600", "700"].includes(shade)) {
          expect(diff, `${fam}-${shade}`).toBeLessThan(0);
          expect(diff, `${fam}-${shade}`).toBeGreaterThan(-0.08);
        } else {
          expect(Math.abs(diff), `${fam}-${shade}`).toBeLessThan(0.005);
        }
      }
    }
  });
});

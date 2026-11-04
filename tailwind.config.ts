import type { Config } from 'tailwindcss'
import plugin from 'tailwindcss/plugin'
import { tailwindColors, paletteBase } from './src/lib/palette'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      // Every built-in color family is remapped onto a pigment palette, held in
      // CSS variables so it follows the art style (Monet by default, ink-wash
      // under [data-style="ink"]) — see src/lib/palette.ts.
      colors: {
        ...tailwindColors,
        border: 'hsl(var(--border))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
      },
      fontFamily: {
        display: ['var(--font-display)', '"Songti SC"', 'Georgia', 'serif'],
        brush: ['var(--font-brush)', '"STKaiti"', '"KaiTi"', 'serif'],
      },
      // Slightly uneven corners, like paper cut and mounted by hand — every
      // existing rounded-* picks this up. rounded-full stays a true circle.
      borderRadius: {
        sm: '2px 3px 2px 3px',
        DEFAULT: '4px 3px 5px 3px',
        md: '6px 4px 7px 4px',
        lg: '8px 4px 9px 5px',
        xl: '10px 5px 11px 6px',
        '2xl': '12px 6px 14px 7px',
        '3xl': '16px 8px 18px 9px',
      },
      // Ink seeping into paper instead of a hard drop shadow.
      boxShadow: {
        sm: '0 1px 2px -1px rgb(31 28 25 / 0.12), 0 4px 10px -8px rgb(31 28 25 / 0.25)',
        DEFAULT: '0 1px 3px -1px rgb(31 28 25 / 0.14), 0 8px 18px -12px rgb(31 28 25 / 0.3)',
        md: '0 2px 4px -2px rgb(31 28 25 / 0.14), 0 12px 26px -16px rgb(31 28 25 / 0.35)',
        lg: '0 3px 6px -3px rgb(31 28 25 / 0.14), 0 18px 36px -20px rgb(31 28 25 / 0.4)',
        xl: '0 4px 8px -4px rgb(31 28 25 / 0.16), 0 24px 48px -24px rgb(31 28 25 / 0.45)',
        '2xl': '0 6px 12px -6px rgb(31 28 25 / 0.18), 0 32px 64px -28px rgb(31 28 25 / 0.5)',
      },
    },
  },
  plugins: [plugin(({ addBase }) => addBase(paletteBase))],
}
export default config

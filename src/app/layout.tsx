import type { Metadata } from "next";
import { Inter, Cormorant_Garamond, Ma_Shan_Zheng } from "next/font/google";
import "katex/dist/katex.min.css";
import "./globals.css";
import "./paint.css";
import SessionProviderWrapper from "@/components/SessionProviderWrapper";
import AuthWidget from "@/components/AuthWidget";
import { ModelKeyDialogHost } from "@/components/ModelKeySettings";
import { ART_STYLE_INIT_SCRIPT, DEFAULT_ART_STYLE } from "@/lib/artStyle";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
// Display serif for headings in both art styles (its italic signs the Monet
// style's seal and inscriptions), and a brush script for the ink style's seals
// and inscriptions (see src/app/paint.css, src/components/ink/).
const display = Cormorant_Garamond({ subsets: ["latin"], weight: ["500", "600", "700"], style: ["normal", "italic"], variable: "--font-display" });
const brush = Ma_Shan_Zheng({ weight: "400", subsets: ["latin"], variable: "--font-brush", preload: false });

export const metadata: Metadata = {
  title: "Hypothesis Atlas",
  description: "Evidence mapping for biotech research",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // data-style: the art style (#87). Server-rendered as the default, then
    // swapped to the saved choice by the inline script before first paint.
    <html lang="en" data-style={DEFAULT_ART_STYLE} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: ART_STYLE_INIT_SCRIPT }} />
      </head>
      <body className={`${inter.className} ${inter.variable} ${display.variable} ${brush.variable}`} suppressHydrationWarning>
        <SessionProviderWrapper>
          {/* #88: first, so the fetch bridge is installed before page effects run. */}
          <ModelKeyDialogHost />
          <AuthWidget />
          {children}
        </SessionProviderWrapper>
      </body>
    </html>
  );
}

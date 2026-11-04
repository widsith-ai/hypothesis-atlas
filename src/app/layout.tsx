import type { Metadata } from "next";
import { Inter, Cormorant_Garamond, Ma_Shan_Zheng } from "next/font/google";
import "katex/dist/katex.min.css";
import "./globals.css";
import "./ink.css";
import SessionProviderWrapper from "@/components/SessionProviderWrapper";
import AuthWidget from "@/components/AuthWidget";
import { ModelKeyDialogHost } from "@/components/ModelKeySettings";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
// Ink-wash theme type: a calligraphic serif for headings, and a brush script
// for seals and inscriptions (see src/app/ink.css, src/components/ink/).
const display = Cormorant_Garamond({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-display" });
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
    <html lang="en" suppressHydrationWarning>
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

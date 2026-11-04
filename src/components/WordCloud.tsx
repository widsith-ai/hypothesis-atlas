"use client";

import { useEffect, useRef } from "react";

interface Word {
  text: string;
  value: number;
}

interface WordCloudProps {
  words: Word[];
  onWordClick: (word: string) => void;
  centerWord?: string;
}

interface PlacedWord {
  x: number;
  y: number;
  width: number;
  height: number;
}

export default function WordCloudComponent({
  words,
  onWordClick,
  centerWord,
}: WordCloudProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const onWordClickRef = useRef(onWordClick);
  useEffect(() => { onWordClickRef.current = onWordClick; }, [onWordClick]);

  useEffect(() => {
    if (!canvasRef.current) return;

    const container = canvasRef.current;
    container.innerHTML = "";

    const width = container.clientWidth;
    const height = 600;

    const maxValue = Math.max(...words.map((w) => w.value));
    const minValue = Math.min(...words.map((w) => w.value));

    const placedWords: PlacedWord[] = [];

    const checkCollision = (
      x: number,
      y: number,
      w: number,
      h: number,
    ): boolean => {
      const padding = 12;
      for (const placed of placedWords) {
        if (
          x < placed.x + placed.width + padding &&
          x + w + padding > placed.x &&
          y < placed.y + placed.height + padding &&
          y + h + padding > placed.y
        ) {
          return true;
        }
      }
      return false;
    };

    const findPosition = (
      wordWidth: number,
      wordHeight: number,
    ): { x: number; y: number } | null => {
      const centerX = width / 2;
      const centerY = height / 2;
      const maxAttempts = 500;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.sqrt(Math.random()) * Math.min(width, height) * 0.4;

        const x = centerX + Math.cos(angle) * radius - wordWidth / 2;
        const y = centerY + Math.sin(angle) * radius - wordHeight / 2;

        if (
          x >= 10 &&
          x + wordWidth <= width - 10 &&
          y >= 10 &&
          y + wordHeight <= height - 10 &&
          !checkCollision(x, y, wordWidth, wordHeight)
        ) {
          return { x, y };
        }
      }

      for (let attempt = 0; attempt < 200; attempt++) {
        const x = Math.random() * (width - wordWidth - 20) + 10;
        const y = Math.random() * (height - wordHeight - 20) + 10;

        if (!checkCollision(x, y, wordWidth, wordHeight)) {
          return { x, y };
        }
      }

      return null;
    };

    // Place center word first, pinned to exact center
    if (centerWord) {
      const span = document.createElement("span");
      span.textContent = centerWord;
      span.style.fontSize = "42px";
      span.style.color = "var(--wc-center)";
      span.style.cursor = "pointer";
      span.style.position = "absolute";
      span.style.fontWeight = "800";
      span.style.transition = "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)";
      span.style.padding = "8px 18px";
      span.style.borderRadius = "12px";
      span.style.background = "rgba(69, 92, 104, 0.08)";
      span.style.border = "2px solid rgba(69, 92, 104, 0.25)";
      span.style.whiteSpace = "nowrap";
      span.style.userSelect = "none";
      span.style.opacity = "0";
      span.style.zIndex = "20";

      container.appendChild(span);
      const rect = span.getBoundingClientRect();
      const cw = rect.width;
      const ch = rect.height;
      const cx = width / 2 - cw / 2;
      const cy = height / 2 - ch / 2;

      span.style.left = `${cx}px`;
      span.style.top = `${cy}px`;
      setTimeout(() => { span.style.opacity = "1"; }, 0);

      placedWords.push({ x: cx, y: cy, width: cw, height: ch });

      span.addEventListener("mouseenter", () => {
        span.style.transform = "scale(1.08)";
        span.style.background = "rgba(69, 92, 104, 0.14)";
        span.style.boxShadow = "0 4px 20px rgba(69, 92, 104, 0.25)";
      });
      span.addEventListener("mouseleave", () => {
        span.style.transform = "scale(1)";
        span.style.background = "rgba(69, 92, 104, 0.08)";
        span.style.boxShadow = "none";
      });
      span.addEventListener("click", () => {
        span.style.transform = "scale(0.95)";
        setTimeout(() => { onWordClickRef.current(centerWord); }, 100);
      });
    }

    const sortedWords = [...words].sort((a, b) => b.value - a.value);

    sortedWords.forEach((word, index) => {
      const span = document.createElement("span");
      span.textContent = word.text;
      span.className = "word-cloud-item";

      const normalizedSize =
        ((word.value - minValue) / (maxValue - minValue)) * 28 + 16;
      span.style.fontSize = `${normalizedSize}px`;

      // Palette variables (src/lib/palette.ts), so the cloud follows the art
      // style; src/app/paint.css lightens them on the Monet night scene (#90).
      // Under ink these are the same pigments the cloud always used.
      const colorPalette = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `var(--wc-${n})`);
      span.style.color = colorPalette[index % colorPalette.length];

      span.style.cursor = "pointer";
      span.style.position = "absolute";
      span.style.fontWeight = "700";
      span.style.transition = "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)";
      span.style.padding = "6px 12px";
      span.style.borderRadius = "8px";
      span.style.whiteSpace = "nowrap";
      span.style.userSelect = "none";
      span.style.opacity = "0";

      container.appendChild(span);

      const rect = span.getBoundingClientRect();
      const wordWidth = rect.width;
      const wordHeight = rect.height;

      const position = findPosition(wordWidth, wordHeight);

      if (position) {
        span.style.left = `${position.x}px`;
        span.style.top = `${position.y}px`;

        setTimeout(() => {
          span.style.opacity = "1";
        }, index * 30);

        placedWords.push({
          x: position.x,
          y: position.y,
          width: wordWidth,
          height: wordHeight,
        });

        span.addEventListener("mouseenter", () => {
          span.style.transform = "scale(1.15) translateY(-2px)";
          span.style.backgroundColor = "rgba(88, 115, 128, 0.1)";
          span.style.boxShadow = "0 4px 12px rgba(19, 17, 15, 0.15)";
          span.style.zIndex = "10";
        });

        span.addEventListener("mouseleave", () => {
          span.style.transform = "scale(1) translateY(0)";
          span.style.backgroundColor = "transparent";
          span.style.boxShadow = "none";
          span.style.zIndex = "1";
        });

        span.addEventListener("click", () => {
          span.style.transform = "scale(0.95)";
          setTimeout(() => {
            onWordClickRef.current(word.text);
          }, 100);
        });
      } else {
        container.removeChild(span);
      }
    });
  }, [words, centerWord]);

  return (
    <div
      ref={canvasRef}
      className="relative w-full"
      style={{ height: "600px", minHeight: "600px" }}
    />
  );
}

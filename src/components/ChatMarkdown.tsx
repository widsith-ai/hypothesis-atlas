// SPDX-License-Identifier: AGPL-3.0-only
"use client";

import katex from "katex";

interface ChatMarkdownProps {
  text: string;
  className?: string;
}

function renderMath(tex: string, displayMode: boolean): string | null {
  try {
    return katex.renderToString(tex, { displayMode, throwOnError: false, output: "html" });
  } catch {
    return null;
  }
}

/**
 * Parses **bold** and $inline math$ together within a single line of text.
 * No italics, no links — not needed by anything that feeds this component
 * today, and skipping them keeps the tokenizer simple.
 *
 * The math alternative requires non-whitespace right inside both `$`
 * delimiters (Pandoc's tex_math_dollars heuristic) — without it, ordinary
 * chat prose mentioning two dollar amounts on one line (e.g. "costs $500
 * but insurance covers $200") gets its middle span fed to KaTeX as if it
 * were TeX.
 */
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const regex = /\*\*([^*]+)\*\*|\$([^\s$](?:[^$\n]*[^\s$])?)\$/g;
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) nodes.push(<span key={`${keyPrefix}-t${i++}`}>{text.slice(last, m.index)}</span>);
    if (m[1] !== undefined) {
      nodes.push(
        <strong key={`${keyPrefix}-b${i++}`} className="font-semibold">
          {m[1]}
        </strong>
      );
    } else if (m[2] !== undefined) {
      const html = renderMath(m[2], false);
      nodes.push(
        html ? (
          <span key={`${keyPrefix}-m${i++}`} dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <span key={`${keyPrefix}-m${i++}`}>{m[0]}</span>
        )
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(<span key={`${keyPrefix}-t${i++}`}>{text.slice(last)}</span>);
  return nodes;
}

type Block =
  | { type: "heading"; level: 1 | 2 | 3; text: string }
  | { type: "list"; items: string[] }
  | { type: "hr" }
  | { type: "paragraph"; lines: string[] }
  | { type: "blockMath"; tex: string }
  | { type: "code"; lang: string | null; code: string };

// #22/V4.2: fenced ```code``` blocks — Lean snippets and verification output
// in the Experiments persona arrive this way. Split out before block-math
// parsing so code containing a literal "$$" is never misread as TeX.
function splitCodeFences(text: string): (string | { lang: string | null; code: string })[] {
  const parts: (string | { lang: string | null; code: string })[] = []
  const regex = /```(\w+)?\n?([\s\S]*?)```/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    parts.push({ lang: m[1] ?? null, code: m[2].replace(/\n$/, "") })
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

/** Splits text into $$block math$$ segments and everything in between, so block math isn't line-split by the block parser below. */
function splitBlockMath(text: string): (string | { tex: string })[] {
  const parts: (string | { tex: string })[] = [];
  const regex = /\$\$([\s\S]+?)\$\$/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push({ tex: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function parseBlocks(segment: string): Block[] {
  const blocks: Block[] = [];
  const lines = segment.split("\n");
  let paragraphLines: string[] = [];
  let listItems: string[] = [];

  const flushParagraph = () => {
    if (paragraphLines.length > 0) {
      blocks.push({ type: "paragraph", lines: paragraphLines });
      paragraphLines = [];
    }
  };
  const flushList = () => {
    if (listItems.length > 0) {
      blocks.push({ type: "list", items: listItems });
      listItems = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const headingMatch = line.match(/^(#{1,3})\s+(.*)/);
    const listMatch = line.match(/^[-*]\s+(.*)/);
    const isHr = /^(-{3,}|_{3,})$/.test(line);

    if (line === "") {
      flushParagraph();
      flushList();
    } else if (headingMatch) {
      flushParagraph();
      flushList();
      blocks.push({ type: "heading", level: headingMatch[1].length as 1 | 2 | 3, text: headingMatch[2] });
    } else if (isHr) {
      flushParagraph();
      flushList();
      blocks.push({ type: "hr" });
    } else if (listMatch) {
      flushParagraph();
      listItems.push(listMatch[1]);
    } else {
      flushList();
      paragraphLines.push(line);
    }
  }
  flushParagraph();
  flushList();
  return blocks;
}

function toBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  for (const fence of splitCodeFences(text)) {
    if (typeof fence !== "string") {
      blocks.push({ type: "code", lang: fence.lang, code: fence.code });
      continue;
    }
    for (const part of splitBlockMath(fence)) {
      if (typeof part === "string") {
        blocks.push(...parseBlocks(part));
      } else {
        blocks.push({ type: "blockMath", tex: part.tex });
      }
    }
  }
  return blocks;
}

/** Whether a message's content contains "wide content" (block math or a fenced
 * code block) that #22/V4.2 gives a dedicated, near-full-width block instead
 * of cramming into a normal chat bubble — LaTeX claims, Lean snippets, and
 * verification output need room a chat bubble doesn't give them. */
export function hasWideContent(text: string): boolean {
  return /\$\$[\s\S]+?\$\$/.test(text) || /```[\s\S]*?```/.test(text);
}

const HEADING_STYLE: Record<1 | 2 | 3, string> = {
  1: "text-base font-bold mt-3 mb-1.5 first:mt-0",
  2: "text-sm font-bold mt-3 mb-1 first:mt-0",
  3: "text-sm font-semibold mt-2 mb-1 first:mt-0 text-gray-600",
};

/**
 * A small, purpose-built Markdown renderer for chat messages: headings,
 * **bold**, "- " bullet lists, "---" rules, $inline$/$$block$$ math via
 * KaTeX, and ```fenced code``` blocks (#22/V4.2 — Lean snippets and
 * verification output) — the subset this app's chat prompts actually
 * produce (see lib/boldIdeaAgents.ts and the experiment-persona prompt in
 * /api/jobs/[id]/assistant-chat). Builds real React elements rather than
 * dangerouslySetInnerHTML-ing a general Markdown library's output, so a
 * chat message (including the user's own, typed free text) can't inject
 * arbitrary HTML — text content always lands in text nodes, never innerHTML,
 * except for KaTeX's own sanitized output on a successful math parse.
 */
export default function ChatMarkdown({ text, className }: ChatMarkdownProps) {
  const blocks = toBlocks(text);
  return (
    <div className={className}>
      {blocks.map((block, i) => {
        const key = `b${i}`;
        switch (block.type) {
          case "heading": {
            const Tag = (`h${block.level + 1}`) as "h2" | "h3" | "h4";
            return (
              <Tag key={key} className={HEADING_STYLE[block.level]}>
                {renderInline(block.text, key)}
              </Tag>
            );
          }
          case "hr":
            return <hr key={key} className="my-2.5 border-gray-200" />;
          case "list":
            return (
              <ul key={key} className="my-1.5 space-y-1 list-none">
                {block.items.map((item, j) => (
                  <li key={`${key}-${j}`} className="flex gap-1.5">
                    <span className="text-gray-400 flex-shrink-0">•</span>
                    <span>{renderInline(item, `${key}-${j}`)}</span>
                  </li>
                ))}
              </ul>
            );
          case "blockMath": {
            const html = renderMath(block.tex, true);
            return html ? (
              <div key={key} className="my-2 overflow-x-auto text-center" dangerouslySetInnerHTML={{ __html: html }} />
            ) : (
              <div key={key}>{`$$${block.tex}$$`}</div>
            );
          }
          case "code":
            return (
              <div key={key} className="my-2 rounded-lg overflow-hidden border border-gray-700">
                {block.lang && (
                  <div className="px-3 py-1 text-[10px] font-mono uppercase tracking-wide bg-gray-800 text-gray-400">
                    {block.lang}
                  </div>
                )}
                <pre className="overflow-x-auto bg-gray-900 text-gray-100 text-xs p-3 m-0">
                  <code>{block.code}</code>
                </pre>
              </div>
            );
          case "paragraph":
          default:
            return block.lines.length > 0 ? (
              <p key={key} className="my-1 first:mt-0 last:mb-0">
                {block.lines.map((line, j) => (
                  <span key={`${key}-${j}`}>
                    {j > 0 && <br />}
                    {renderInline(line, `${key}-${j}`)}
                  </span>
                ))}
              </p>
            ) : null;
        }
      })}
    </div>
  );
}

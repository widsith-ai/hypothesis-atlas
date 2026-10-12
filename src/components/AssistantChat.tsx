"use client";

import { useEffect, useRef, useState } from "react";
import { appendNote } from "@/lib/notes";
import ChatMarkdown from "./ChatMarkdown";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ResearchIdea {
  title: string;
  problem_to_solve: string;
  proposed_method: string[];
  next_3_steps: string[];
  field_context: string[];
}

interface AssistantChatProps {
  jobId: string;
  selectedIdea?: ResearchIdea;
  persona?: "writing" | "experiment";
  welcome?: Message;
  storageKey?: string;
  onMessagesChange?: (messages: Message[]) => void;
  /** Chat endpoint to POST to. Defaults to `/api/jobs/${jobId}/assistant-chat` — pass a different one for sessions (e.g. Bold Idea) that aren't backed by a real Job row, so the request doesn't 404 against that endpoint's `prisma.job.findUnique`. */
  endpoint?: string;
  /** Whether "Save to notes" / the auto 📝 note feature is available. Both are backed by the per-Job research graph (`/api/jobs/${jobId}/notes`) — default true, but Bold Idea sessions (no Job row) must pass false or every save throws a 404. */
  enableNotes?: boolean;
  /** Called with the selected text when the user highlights something in a message and clicks the "Save" popover that appears. Omit to disable highlighting entirely (no popover is shown). */
  onHighlight?: (text: string) => void;
}

const WELCOME: Message = {
  role: "assistant",
  content:
    "Hi! I'm Atlas, your writing assistant. I can see this session's evidence and ideas, and I work alongside Atlas Plan.\n\nAsk me to explain concepts, structure an argument, compare methods from the papers — or say \"remember that ...\" and I'll save it straight to your notes.",
};

function makeCacheKey(jobId: string): string {
  return `assistant-chat:${jobId}`;
}

function loadSession(key: string): Message[] | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return (JSON.parse(raw) as { messages: Message[] }).messages;
  } catch {
    return null;
  }
}

function saveSession(key: string, messages: Message[]) {
  try {
    localStorage.setItem(key, JSON.stringify({ messages, savedAt: Date.now() }));
  } catch {}
}

/** Extracts a trailing "📝 ..." note line from an assistant reply, if present. */
function extractAutoNote(content: string): { text: string; note: string | null } {
  const match = content.match(/\n?📝\s*([\s\S]+)$/);
  if (!match) return { text: content, note: null };
  return { text: content.slice(0, match.index).trimEnd(), note: match[1].trim() };
}

export default function AssistantChat({
  jobId,
  selectedIdea,
  persona = "writing",
  welcome,
  storageKey,
  onMessagesChange,
  endpoint,
  enableNotes = true,
  onHighlight,
}: AssistantChatProps) {
  const effectiveWelcome = welcome ?? WELCOME;
  const cacheKey = storageKey ?? makeCacheKey(jobId);
  const [messages, setMessages] = useState<Message[]>([effectiveWelcome]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [noKey, setNoKey] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  const [highlightPopup, setHighlightPopup] = useState<{ text: string; x: number; y: number } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);

  // Dismiss the highlight popup if the page scrolls out from under it —
  // it's positioned fixed to the selection's viewport rect, not the
  // scrolling messages container, so it would otherwise go stale.
  useEffect(() => {
    if (!onHighlight) return;
    const clear = () => setHighlightPopup(null);
    window.addEventListener("scroll", clear, true);
    return () => window.removeEventListener("scroll", clear, true);
  }, [onHighlight]);

  const handleSelectionChange = () => {
    if (!onHighlight) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !messagesRef.current || !sel.anchorNode || !messagesRef.current.contains(sel.anchorNode)) {
      setHighlightPopup(null);
      return;
    }
    const text = sel.toString().trim();
    if (!text) {
      setHighlightPopup(null);
      return;
    }
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    setHighlightPopup({ text, x: rect.left + rect.width / 2, y: rect.top });
  };

  const handleSaveHighlight = () => {
    if (!highlightPopup) return;
    onHighlight?.(highlightPopup.text);
    window.getSelection()?.removeAllRanges();
    setHighlightPopup(null);
  };

  useEffect(() => {
    const cached = loadSession(cacheKey);
    if (cached && cached.length > 0) setMessages(cached);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  useEffect(() => {
    if (!streaming) saveSession(cacheKey, messages);
  }, [streaming, messages, cacheKey]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    onMessagesChange?.(messages);
  }, [messages, onMessagesChange]);

  const sendMessage = async (userText: string) => {
    const newMessages: Message[] = [...messages, { role: "user", content: userText }];
    setMessages(newMessages);
    setInput("");
    setStreaming(true);

    try {
      const res = await fetch(endpoint ?? `/api/jobs/${jobId}/assistant-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages
            .filter((m) => m.content !== effectiveWelcome.content)
            .map((m) => ({ role: m.role, content: m.content })),
          persona,
          selectedIdea,
        }),
      });

      if (res.status === 503) {
        const err = await res.json();
        setNoKey(true);
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: err.error },
        ]);
        return;
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `Request failed (${res.status}).` }));
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: err.error ?? `Request failed (${res.status}).` },
        ]);
        return;
      }

      if (!res.body) return;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      let assistantIndex = newMessages.length;

      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        const final = accumulated;
        setMessages((prev) => {
          const updated = [...prev];
          if (updated[assistantIndex]) {
            updated[assistantIndex] = { role: "assistant", content: final };
          }
          return updated;
        });
      }

      // Auto-note: if the model ended with a 📝 line, strip it from the
      // displayed text regardless of enableNotes (it's never meant to be
      // shown verbatim) and save it to notes only when that's available.
      const { text, note } = extractAutoNote(accumulated);
      if (note) {
        if (enableNotes) {
          try {
            await appendNote(jobId, {
              type: "insight",
              title: `From Assistant — ${userText.slice(0, 60)}`,
              content: note,
            });
          } catch (err) {
            console.error("Failed to save auto-note:", err);
          }
        }
        setMessages((prev) => {
          const updated = [...prev];
          if (updated[assistantIndex]) {
            updated[assistantIndex] = { role: "assistant", content: text };
          }
          return updated;
        });
      }
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Error connecting to the assistant. Please try again." },
      ]);
    } finally {
      setStreaming(false);
    }
  };

  const handleSaveNote = (index: number) => {
    const msg = messages[index];
    if (!msg || msg.role !== "assistant") return;
    const lastUser = [...messages.slice(0, index)].reverse().find((m) => m.role === "user");
    appendNote(jobId, {
      type: "insight",
      title: `From Assistant — ${(lastUser?.content ?? "chat").slice(0, 60)}`,
      content: msg.content,
    });
    setSavedIds((prev) => new Set(prev).add(index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || streaming) return;
    sendMessage(input.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  };

  const handleReset = () => {
    try { localStorage.removeItem(cacheKey); } catch {}
    setMessages([effectiveWelcome]);
    setSavedIds(new Set());
    setNoKey(false);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-white flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse flex-shrink-0" />
          <span className="text-sm font-semibold text-gray-700 flex-shrink-0">Atlas Assistant</span>
          {selectedIdea ? (
            <span className="text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full truncate max-w-xs">
              {selectedIdea.title}
            </span>
          ) : (
            <span className="text-xs text-gray-400">Writing assistant · Groq</span>
          )}
        </div>
        <button
          onClick={handleReset}
          className="text-xs text-gray-400 hover:text-red-500 flex items-center gap-1 transition-colors"
          title="Clear session and restart"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Restart
        </button>
      </div>

      {/* No API key banner */}
      {noKey && (
        <div className="mx-4 mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
          <strong>Missing API Key.</strong> Add{" "}
          <code className="font-mono bg-amber-100 px-1 rounded">GROQ_API_KEY=gsk_...</code>{" "}
          to your <code className="font-mono">.env.local</code> and restart the dev server.
        </div>
      )}

      {/* Highlight-to-knowledge popover — follows the current text selection, fixed to viewport coords */}
      {highlightPopup && (
        <button
          onClick={handleSaveHighlight}
          style={{ position: "fixed", left: highlightPopup.x, top: highlightPopup.y - 40, transform: "translateX(-50%)" }}
          className="z-50 flex items-center gap-1.5 bg-gray-900 text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow-lg hover:bg-gray-700 transition-colors"
        >
          ✨ Save to Knowledge
        </button>
      )}

      {/* Messages */}
      <div ref={messagesRef} onMouseUp={handleSelectionChange} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "assistant" && (
              <div className="w-7 h-7 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center flex-shrink-0 mr-2 mt-0.5">
                <span className="text-white text-xs font-bold">A</span>
              </div>
            )}
            <div className="max-w-[80%]">
              <div
                className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-emerald-600 text-white rounded-tr-sm"
                    : "bg-gray-100 text-gray-800 rounded-tl-sm"
                }`}
              >
                <ChatMarkdown text={msg.content} />
                {streaming && i === messages.length - 1 && msg.role === "assistant" && (
                  <span className="inline-block w-1.5 h-4 bg-emerald-400 ml-0.5 animate-pulse rounded-sm align-middle" />
                )}
              </div>
              {enableNotes && msg.role === "assistant" && i > 0 && msg.content && !streaming && (
                <div className="flex justify-end mt-1">
                  <button
                    onClick={() => handleSaveNote(i)}
                    disabled={savedIds.has(i)}
                    className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-emerald-600 disabled:text-emerald-500 disabled:cursor-default transition-colors"
                    title="Save this reply to your notes"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                    </svg>
                    {savedIds.has(i) ? "Saved to notes" : "Save to notes"}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex-shrink-0 border-t border-gray-200 p-4 bg-white">
        <div className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={streaming || noKey}
            placeholder={streaming ? "Thinking…" : "Ask the assistant (Enter to send, Shift+Enter for newline)"}
            rows={2}
            className="flex-1 resize-none border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 disabled:opacity-50 disabled:bg-gray-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || streaming || noKey}
            className="px-4 py-3 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:opacity-40 transition-colors flex-shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
}

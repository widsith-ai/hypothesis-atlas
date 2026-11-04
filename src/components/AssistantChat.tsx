"use client";

import { useEffect, useRef, useState } from "react";
import { appendNote } from "@/lib/notes";
import ChatMarkdown, { hasWideContent } from "./ChatMarkdown";
import { LLM_CONFIG_CHANGED_EVENT, openModelKeyDialog } from "@/lib/llmClientConfig";
import { getPaperSkill, type PaperChatContext } from "@/lib/paperSkills";

interface Message {
  role: "user" | "assistant";
  content: string;
  /** #99: the paper skill that wrote this reply (assistant messages only). */
  skill?: string;
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
  /** #99: paper skill id sent with each request (src/lib/paperSkills.ts). Replies are labelled with it. */
  skill?: string;
  /** #99: read at send time — the page's current Atlas Plan and collected papers, for the skill to work from. */
  getPaperContext?: () => PaperChatContext | undefined;
  /** #99: rendered between the messages and the input (the skill picker). */
  toolbar?: React.ReactNode;
  /** #99: one-click prompts shown above the input while it's empty. */
  starters?: string[];
  /** Header subtitle when no idea is selected. */
  subtitle?: string;
  /**
   * #105: "chatgpt" renders a full-height, ChatGPT-style chat — replies as
   * full-width text, the user's messages as right-aligned bubbles, a pinned
   * auto-growing composer with a stop button, and suggestion cards on an empty
   * conversation. Used by the Write Paper session; everything else keeps the
   * default look.
   */
  variant?: "default" | "chatgpt";
  /** #105 (chatgpt variant): rendered inside the composer, left of the send button (the skill picker). */
  composerAccessory?: React.ReactNode;
  /** #105 (chatgpt variant): header title. */
  title?: string;
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
  skill,
  getPaperContext,
  toolbar,
  starters,
  subtitle,
  variant = "default",
  composerAccessory,
  title,
}: AssistantChatProps) {
  const chatgpt = variant === "chatgpt";
  const effectiveWelcome = welcome ?? WELCOME;
  const cacheKey = storageKey ?? makeCacheKey(jobId);
  const [messages, setMessages] = useState<Message[]>([effectiveWelcome]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [noKey, setNoKey] = useState(false);
  // #88: adding (or changing) a key in the Model & API key dialog unlocks the chat again.
  useEffect(() => {
    const unlock = () => setNoKey(false);
    window.addEventListener(LLM_CONFIG_CHANGED_EVENT, unlock);
    return () => window.removeEventListener(LLM_CONFIG_CHANGED_EVENT, unlock);
  }, []);
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [highlightPopup, setHighlightPopup] = useState<{ text: string; x: number; y: number } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // #105: lets the composer's stop button cancel a streaming reply.
  const abortRef = useRef<AbortController | null>(null);
  // #105: only auto-scroll while the reader is already at (or near) the bottom.
  const stickToBottom = useRef(true);

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

  // Saving waits until *this key's* conversation has been restored. Otherwise
  // the first render's save (just the welcome message) overwrites it before it
  // loads — React's double-run effects in development then restore that
  // overwritten copy — and when the key changes (another paper), the previous
  // conversation would be written under the new key.
  const [restoredKey, setRestoredKey] = useState<string | null>(null);

  useEffect(() => {
    const cached = loadSession(cacheKey);
    // A session holding only a greeting may carry an older welcome text, so
    // show the current welcome instead.
    const hasConversation = !!cached && cached.length > 0 && !(cached.length === 1 && cached[0].role === "assistant");
    setMessages(hasConversation ? cached! : [effectiveWelcome]);
    setRestoredKey(cacheKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  useEffect(() => {
    if (restoredKey === cacheKey && !streaming) saveSession(cacheKey, messages);
  }, [restoredKey, streaming, messages, cacheKey]);

  useEffect(() => {
    if (chatgpt) {
      // Scroll the thread itself — scrollIntoView would also scroll the page
      // and the session pane beside it.
      const el = messagesRef.current;
      if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
      return;
    }
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chatgpt]);

  // #105: the composer grows with its content, up to a cap, then scrolls.
  useEffect(() => {
    if (!chatgpt || !textareaRef.current) return;
    const el = textareaRef.current;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input, chatgpt]);

  useEffect(() => {
    onMessagesChange?.(messages);
  }, [messages, onMessagesChange]);

  const sendMessage = async (userText: string) => {
    const newMessages: Message[] = [...messages, { role: "user", content: userText }];
    setMessages(newMessages);
    setInput("");
    setStreaming(true);
    stickToBottom.current = true;
    const controller = new AbortController();
    abortRef.current = controller;
    const assistantIndex = newMessages.length;
    let accumulated = "";
    let placeholder = false;

    // Auto-note: if the model ended with a 📝 line, strip it from the displayed
    // text regardless of enableNotes (it's never meant to be shown verbatim) and
    // save it to notes only when that's available — and only from a finished reply.
    const finishReply = async (complete: boolean) => {
      const { text, note } = extractAutoNote(accumulated);
      if (!note) return;
      if (complete && enableNotes) {
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
        if (updated[assistantIndex]) updated[assistantIndex] = { role: "assistant", content: text, skill };
        return updated;
      });
    };

    try {
      const res = await fetch(endpoint ?? `/api/jobs/${jobId}/assistant-chat`, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Never send the greeting (whatever its text) or empty turns as history.
          messages: newMessages
            .filter((m, idx) => !(idx === 0 && m.role === "assistant") && m.content !== effectiveWelcome.content && m.content.trim() !== "")
            .map((m) => ({ role: m.role, content: m.content })),
          persona,
          selectedIdea,
          ...(skill ? { skill } : {}),
          ...(getPaperContext ? { paperContext: getPaperContext() } : {}),
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

      setMessages((prev) => [...prev, { role: "assistant", content: "", skill }]);
      placeholder = true;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        const final = accumulated;
        setMessages((prev) => {
          const updated = [...prev];
          if (updated[assistantIndex]) {
            updated[assistantIndex] = { role: "assistant", content: final, skill };
          }
          return updated;
        });
      }

      await finishReply(true);
    } catch (err) {
      // Stopped by the user: keep whatever had streamed in (minus a half-written
      // 📝 note), no error bubble — and no empty reply left in the history.
      if ((err as { name?: string })?.name === "AbortError") {
        if (placeholder && !accumulated.trim()) {
          setMessages((prev) => prev.filter((_, idx) => idx !== assistantIndex));
        } else {
          await finishReply(false);
        }
        return;
      }
      console.error(err);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Error connecting to the assistant. Please try again." },
      ]);
    } finally {
      abortRef.current = null;
      setStreaming(false);
    }
  };

  const stopStreaming = () => abortRef.current?.abort();

  // Cancel an in-flight reply if the chat unmounts (e.g. leaving the page).
  useEffect(() => () => abortRef.current?.abort(), []);

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
    // Don't send while an IME is composing (Chinese / Japanese / Korean input).
    // Safari reports the confirming Enter with isComposing=false but keyCode 229.
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  };

  const handleReset = () => {
    abortRef.current?.abort();
    try { localStorage.removeItem(cacheKey); } catch {}
    setMessages([effectiveWelcome]);
    setSavedIds(new Set());
    setNoKey(false);
  };

  // #105: ChatGPT-style layout (Write Paper session).
  if (chatgpt) {
    const isEmpty = messages.length <= 1 && messages[0]?.content === effectiveWelcome.content;
    const onThreadScroll = () => {
      const el = messagesRef.current;
      if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    };
    const confirmNewChat = () => {
      if (messages.length > 1 && !window.confirm("Start a new chat? This paper's current conversation will be cleared.")) return;
      handleReset();
      textareaRef.current?.focus();
    };
    const copy = (text: string, i: number) => {
      navigator.clipboard?.writeText(text).then(
        () => {
          setCopiedIndex(i);
          window.setTimeout(() => setCopiedIndex((c) => (c === i ? null : c)), 1500);
        },
        () => {},
      );
    };

    return (
      <div className="flex h-full min-h-0 flex-col bg-white">
        {/* Header */}
        <div className="flex flex-none items-center justify-between gap-3 border-b border-gray-200 px-4 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-gray-900">{title ?? "Atlas Assistant"}</p>
            <p className="truncate text-[11px] text-gray-500">{selectedIdea ? selectedIdea.title : subtitle ?? "Writing assistant"}</p>
          </div>
          <button
            type="button"
            onClick={confirmNewChat}
            className="flex flex-none items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
            title="Start a new conversation for this paper"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16.862 4.487a2.1 2.1 0 1 1 2.97 2.97L7.5 19.79 3 21l1.21-4.5L16.862 4.487Z" />
            </svg>
            New chat
          </button>
        </div>

        {noKey && <NoKeyBanner className="mx-4 mt-3 flex-none" />}

        {highlightPopup && <HighlightPopup x={highlightPopup.x} y={highlightPopup.y} onSave={handleSaveHighlight} />}

        {/* Thread */}
        <div
          ref={messagesRef}
          onScroll={onThreadScroll}
          onMouseUp={handleSelectionChange}
          className="min-h-0 flex-1 overflow-y-auto"
          aria-live="polite"
        >
          <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
            {messages.map((msg, i) => {
              const last = i === messages.length - 1;
              if (msg.role === "user") {
                return (
                  <div key={i} className="flex justify-end">
                    <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-3xl bg-gray-200 px-4 py-2.5 text-sm leading-relaxed text-gray-900">
                      {msg.content}
                    </div>
                  </div>
                );
              }
              const skillInfo = msg.skill ? getPaperSkill(msg.skill) : null;
              return (
                <div key={i} className="group flex gap-3">
                  <div className="mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-rose-400 text-[11px] font-bold text-white" aria-hidden>
                    A
                  </div>
                  <div className="min-w-0 flex-1">
                    {skillInfo && (
                      <p className="mb-1 text-[11px] font-medium text-gray-500">
                        {skillInfo.icon} {skillInfo.label}
                      </p>
                    )}
                    <div className="text-sm leading-relaxed text-gray-800">
                      {msg.content ? (
                        <ChatMarkdown text={msg.content} />
                      ) : (
                        streaming && last && (
                          <span className="inline-flex gap-1 py-1" aria-label="Thinking">
                            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.2s]" />
                            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.1s]" />
                            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400" />
                          </span>
                        )
                      )}
                    </div>
                    {i > 0 && msg.content && !(streaming && last) && (
                      <div className="mt-1.5 flex items-center gap-3 text-[11px] text-gray-400 opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100 lg:focus-within:opacity-100">
                        <button type="button" onClick={() => copy(msg.content, i)} className="hover:text-gray-700">
                          {copiedIndex === i ? "Copied" : "Copy"}
                        </button>
                        {enableNotes && (
                          <button
                            type="button"
                            onClick={() => handleSaveNote(i)}
                            disabled={savedIds.has(i)}
                            className="hover:text-emerald-600 disabled:cursor-default disabled:text-emerald-600"
                          >
                            {savedIds.has(i) ? "Saved to notes" : "Save to notes"}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {isEmpty && starters && starters.length > 0 && !noKey && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {starters.map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => (st.endsWith(": ") ? (setInput(st), textareaRef.current?.focus()) : sendMessage(st))}
                    className="rounded-2xl border border-gray-200 px-3.5 py-3 text-left text-xs leading-snug text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
                  >
                    {st}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Composer */}
        <form onSubmit={handleSubmit} className="flex-none px-3 pb-3 pt-1">
          <div className="mx-auto max-w-3xl rounded-[26px] border border-gray-200 bg-white shadow-[0_2px_12px_-4px_rgba(16,27,56,0.18)] focus-within:border-gray-300">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={noKey}
              rows={1}
              placeholder={streaming ? "Atlas is writing…" : "Message Atlas"}
              aria-label="Message Atlas"
              className="block max-h-[200px] w-full resize-none bg-transparent px-4 pt-3.5 text-sm leading-relaxed text-gray-900 placeholder:text-gray-400 focus:outline-none disabled:opacity-50"
            />
            <div className="flex items-center justify-between gap-2 px-2.5 pb-2.5 pt-1">
              <div className="min-w-0">{composerAccessory}</div>
              {streaming ? (
                <button
                  type="button"
                  onClick={stopStreaming}
                  aria-label="Stop generating"
                  title="Stop generating"
                  className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-gray-900 text-white transition-colors hover:bg-gray-700"
                >
                  <span className="h-2.5 w-2.5 rounded-[2px] bg-white" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim() || noKey}
                  aria-label="Send message"
                  title="Send (Enter) · new line (Shift+Enter)"
                  className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-gray-900 text-white transition-colors hover:bg-gray-700 disabled:bg-gray-200 disabled:text-gray-400"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 19V5m0 0-6 6m6-6 6 6" />
                  </svg>
                </button>
              )}
            </div>
          </div>
          <p className="mt-1.5 text-center text-[10px] text-gray-400">Atlas can make mistakes. Check important claims against your sources.</p>
        </form>
      </div>
    );
  }

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
            <span className="text-xs text-gray-400">{subtitle ?? "Writing assistant · Groq"}</span>
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
      {noKey && <NoKeyBanner className="mx-4 mt-3" />}

      {/* Highlight-to-knowledge popover — follows the current text selection, fixed to viewport coords */}
      {highlightPopup && <HighlightPopup x={highlightPopup.x} y={highlightPopup.y} onSave={handleSaveHighlight} />}

      {/* Messages */}
      <div ref={messagesRef} onMouseUp={handleSelectionChange} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map((msg, i) => {
          // #22/V4.2: a claim/proof/verification-result reply (block math or
          // a fenced code block) gets a wide, dedicated content block instead
          // of a cramped chat bubble — see ChatMarkdown's hasWideContent.
          const wide = msg.role === "assistant" && hasWideContent(msg.content);
          return (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "assistant" && (
                <div className="w-7 h-7 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center flex-shrink-0 mr-2 mt-0.5">
                  <span className="text-white text-xs font-bold">A</span>
                </div>
              )}
              <div className={wide ? "max-w-full flex-1 min-w-0" : "max-w-[80%]"}>
                {msg.role === "assistant" && msg.skill && (
                  <div className="mb-1 text-[11px] font-medium text-gray-500">
                    {getPaperSkill(msg.skill).icon} {getPaperSkill(msg.skill).label}
                  </div>
                )}
                <div
                  className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "bg-emerald-600 text-white rounded-tr-sm"
                      : wide
                      ? "bg-white border border-gray-200 rounded-xl shadow-sm"
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
          );
        })}
        <div ref={bottomRef} />
      </div>

      {toolbar && <div className="flex-shrink-0 border-t border-gray-200 bg-white">{toolbar}</div>}

      {/* Input */}
      <form onSubmit={handleSubmit} className={`flex-shrink-0 p-4 bg-white ${toolbar ? "" : "border-t border-gray-200"}`}>
        {starters && starters.length > 0 && !input.trim() && !streaming && !noKey && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {starters.map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => (st.endsWith(": ") ? setInput(st) : sendMessage(st))}
                className="text-[11px] text-gray-600 bg-gray-50 border border-gray-200 rounded-full px-2.5 py-1 hover:bg-gray-100 hover:text-gray-900 transition-colors text-left"
              >
                {st}
              </button>
            ))}
          </div>
        )}
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

/** Shown when the server has no model key and the user hasn't added one (#88). */
function NoKeyBanner({ className = "" }: { className?: string }) {
  return (
    <div className={`rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 ${className}`}>
      <strong>No model key.</strong>{" "}
      <button onClick={() => openModelKeyDialog()} className="font-semibold underline hover:text-amber-900">
        Add your own API key
      </button>{" "}
      (Claude, OpenAI, Gemini, Groq…), or set <code className="rounded bg-amber-100 px-1 font-mono">GROQ_API_KEY</code> on the server.
    </div>
  );
}

/** "Save to Knowledge" popover above a text selection, fixed to viewport coordinates. */
function HighlightPopup({ x, y, onSave }: { x: number; y: number; onSave: () => void }) {
  return (
    <button
      onClick={onSave}
      style={{ position: "fixed", left: x, top: y - 40, transform: "translateX(-50%)" }}
      className="z-50 flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white shadow-lg transition-colors hover:bg-gray-700"
    >
      ✨ Save to Knowledge
    </button>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Question {
  id: number;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

interface QuestionBotProps {
  jobId: string;
  topic: string;
}

const BOT_WELCOME: Message = {
  role: "assistant",
  content:
    "Hey, I'm your Question Cat 🐱\n\nAsk me anything about this research session — the topic, the evidence, the papers in the tree. Stuck on a concept? Ask, then hit Quiz and I'll test you on it.",
};

export default function QuestionBot({ jobId, topic }: QuestionBotProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([BOT_WELCOME]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);

  // Quiz state
  const [quizMode, setQuizMode] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizError, setQuizError] = useState<string | null>(null);
  const [quizTopic, setQuizTopic] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && !quizMode) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, open, quizMode]);

  const sendMessage = async (userText: string) => {
    const newMessages: Message[] = [...messages, { role: "user", content: userText }];
    setMessages(newMessages);
    setInput("");
    setStreaming(true);

    const assistantIndex = newMessages.length;
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const res = await fetch(`/api/jobs/${jobId}/assistant-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages
            .filter((m) => m.content !== BOT_WELCOME.content)
            .map((m) => ({ role: m.role, content: m.content })),
          persona: "ask",
        }),
      });

      if (!res.ok || !res.body) {
        setMessages((prev) => {
          const updated = [...prev];
          updated[assistantIndex] = {
            role: "assistant",
            content: "Hmm, I couldn't reach my brain. Add your own model key under \"Model & API key\" (top-right), or check the server's GROQ_API_KEY.",
          };
          return updated;
        });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

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
    } catch (err) {
      console.error(err);
      setMessages((prev) => {
        const updated = [...prev];
        updated[assistantIndex] = {
          role: "assistant",
          content: "Connection hiccup — try again?",
        };
        return updated;
      });
    } finally {
      setStreaming(false);
    }
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

  const startQuiz = async () => {
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    const focus = lastUser?.content.trim() || topic;
    setQuizTopic(focus);
    setQuizMode(true);
    setQuizLoading(true);
    setQuizError(null);
    setQuestions([]);
    setCurrentIndex(0);
    setSelectedIndex(null);
    setAnswered(false);
    setScore(0);
    setFinished(false);

    try {
      const res = await fetch(`/api/jobs/${jobId}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idea: {
            title: focus.slice(0, 120),
            problem_to_solve: `The user wants to understand: ${focus}`,
            proposed_method: [],
            next_3_steps: [],
            field_context: [],
          },
        }),
      });
      const data = await res.json();
      if (data.error || !data.questions) {
        setQuizError("Could not generate a quiz for that. Try asking a question first.");
      } else {
        setQuestions(data.questions);
      }
    } catch {
      setQuizError("Failed to load the quiz. Please try again.");
    } finally {
      setQuizLoading(false);
    }
  };

  const handleSelect = (optionIndex: number) => {
    if (answered) return;
    setSelectedIndex(optionIndex);
    setAnswered(true);
    if (optionIndex === questions[currentIndex].correctIndex) {
      setScore((s) => s + 1);
    }
  };

  const handleNext = () => {
    if (currentIndex + 1 >= questions.length) {
      setFinished(true);
    } else {
      setCurrentIndex((i) => i + 1);
      setSelectedIndex(null);
      setAnswered(false);
    }
  };

  const exitQuiz = () => {
    setQuizMode(false);
  };

  const q = questions[currentIndex];
  const progressPct = questions.length > 0 ? (currentIndex / questions.length) * 100 : 0;

  return (
    <>
      {/* Cute floating cat button — sits left of the Notes fab */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 z-50 w-12 h-12 rounded-full shadow-xl transition-all hover:scale-110 active:scale-95"
        style={{
          right: "11rem",
          background: "linear-gradient(135deg, #cc6e57, #76626b)",
        }}
        title="Question Cat — ask anything about this session"
      >
        <div className="absolute inset-0 rounded-full overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/question-cat.png"
            alt="Question Cat"
            className="w-full h-full object-cover"
            draggable={false}
          />
        </div>
        {!open && messages.length === 1 && (
          <span className="absolute -top-1 -right-1 flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-pink-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-pink-500" />
          </span>
        )}
      </button>

      {/* Floating chat window */}
      {open && (
        <div
          className="fixed bottom-24 z-50 flex flex-col rounded-3xl border border-gray-200 shadow-2xl bg-white overflow-hidden"
          style={{ right: "1.5rem", width: "min(380px, calc(100vw - 3rem))", height: "min(560px, calc(100vh - 8rem))" }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-pink-200 to-purple-200 flex-shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0 ring-2 ring-black/20">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/question-cat.png" alt="Question Cat" className="w-full h-full object-cover" draggable={false} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-black truncate">Question Cat</p>
                <p className="text-[10px] text-black/80 truncate">
                  {quizMode ? `Quiz · ${quizTopic.slice(0, 40)}` : topic.slice(0, 42)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {!quizMode && (
                <button
                  onClick={startQuiz}
                  disabled={streaming || quizLoading}
                  className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-black/10 hover:bg-black/20 text-black disabled:opacity-50 transition-colors"
                  title="Quiz me on my last question"
                >
                  ✨ Quiz
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded-lg text-black/70 hover:text-black hover:bg-black/10 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Body */}
          {quizMode ? (
            <div className="flex-1 overflow-y-auto p-4">
              {quizLoading && (
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-400">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500" />
                  <p className="text-xs">Writing questions about “{quizTopic.slice(0, 50)}”…</p>
                </div>
              )}

              {quizError && (
                <div className="rounded-xl bg-red-50 border border-red-200 p-4">
                  <p className="text-xs text-red-600">{quizError}</p>
                  <div className="flex gap-3 mt-3">
                    <button onClick={startQuiz} className="text-xs text-red-500 underline">Try again</button>
                    <button onClick={exitQuiz} className="text-xs text-gray-500 underline">Back to chat</button>
                  </div>
                </div>
              )}

              {!quizLoading && !quizError && finished && (
                <div className="space-y-4">
                  <div className="rounded-xl bg-purple-50 border border-purple-100 p-5 text-center">
                    <div className="text-3xl mb-1">
                      {score === questions.length ? "🏆" : score >= questions.length * 0.75 ? "🌟" : score >= questions.length * 0.5 ? "💪" : "📚"}
                    </div>
                    <p className="text-2xl font-bold text-gray-900">{score} / {questions.length}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {score === questions.length
                        ? "Perfect! You have mastered this."
                        : score >= questions.length * 0.75
                        ? "Great work — almost there."
                        : score >= questions.length * 0.5
                        ? "Good effort — re-read the answer above."
                        : "No worries — ask me to explain it again."}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={startQuiz}
                      className="flex-1 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold transition-colors"
                    >
                      Retake
                    </button>
                    <button
                      onClick={exitQuiz}
                      className="flex-1 py-2 rounded-xl border border-gray-200 text-gray-600 text-xs font-semibold hover:bg-gray-50 transition-colors"
                    >
                      Back to chat
                    </button>
                  </div>
                </div>
              )}

              {!quizLoading && !quizError && !finished && q && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-[11px] text-gray-400">
                    <span>Question {currentIndex + 1} of {questions.length}</span>
                    <button onClick={exitQuiz} className="text-purple-500 hover:underline">Exit quiz</button>
                  </div>
                  <div className="h-1 w-full rounded-full bg-gray-100">
                    <div
                      className="h-1 rounded-full bg-gradient-to-r from-pink-500 to-purple-500 transition-all duration-300"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>

                  <p className="text-sm text-gray-800 leading-relaxed font-medium">{q.question}</p>

                  <div className="space-y-2">
                    {q.options.map((option, i) => {
                      let cls =
                        "w-full text-left text-xs px-3 py-2.5 rounded-xl border transition-colors cursor-pointer ";
                      if (!answered) {
                        cls += "border-gray-200 bg-white text-gray-700 hover:border-purple-400 hover:bg-purple-50";
                      } else if (i === q.correctIndex) {
                        cls += "border-green-500 bg-green-50 text-green-700";
                      } else if (i === selectedIndex) {
                        cls += "border-red-400 bg-red-50 text-red-700";
                      } else {
                        cls += "border-gray-200 bg-gray-50 text-gray-400";
                      }
                      return (
                        <button key={i} className={cls} onClick={() => handleSelect(i)}>
                          {option}
                        </button>
                      );
                    })}
                  </div>

                  {answered && (
                    <div className="rounded-lg bg-white border border-gray-200 p-3 text-xs text-gray-600 leading-relaxed">
                      <span className="font-semibold text-gray-800">
                        {selectedIndex === q.correctIndex ? "✓ Correct — " : "✗ Not quite — "}
                      </span>
                      {q.explanation}
                    </div>
                  )}

                  {answered && (
                    <button
                      onClick={handleNext}
                      className="w-full py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-purple-500 text-white text-xs font-semibold hover:opacity-90 transition-opacity"
                    >
                      {currentIndex + 1 >= questions.length ? "See Results" : "Next Question →"}
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Chat messages */}
              <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
                {messages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    {msg.role === "assistant" && (
                      <div className="w-6 h-6 rounded-full overflow-hidden flex-shrink-0 mr-1.5 mt-0.5 ring-1 ring-pink-200">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/question-cat.png" alt="Question Cat" className="w-full h-full object-cover" draggable={false} />
                      </div>
                    )}
                    <div
                      className={`max-w-[82%] rounded-2xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap ${
                        msg.role === "user"
                          ? "bg-purple-600 text-white rounded-tr-sm"
                          : "bg-gray-100 text-gray-800 rounded-tl-sm"
                      }`}
                    >
                      {msg.content}
                      {streaming && i === messages.length - 1 && msg.role === "assistant" && (
                        <span className="inline-block w-1 h-3 bg-purple-400 ml-0.5 animate-pulse rounded-sm align-middle" />
                      )}
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>

              {/* Chat input */}
              <form onSubmit={handleSubmit} className="flex-shrink-0 border-t border-gray-100 p-3 bg-white">
                <div className="flex gap-2 items-end">
                  <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={streaming}
                    placeholder={streaming ? "Thinking…" : "Ask about this session…"}
                    rows={1}
                    className="flex-1 resize-none border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-purple-300 disabled:opacity-50 disabled:bg-gray-50"
                  />
                  <button
                    type="submit"
                    disabled={!input.trim() || streaming}
                    className="px-3 py-2 bg-purple-600 text-white rounded-xl hover:bg-purple-700 disabled:opacity-40 transition-colors flex-shrink-0"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      )}
    </>
  );
}

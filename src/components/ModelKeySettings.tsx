// SPDX-License-Identifier: AGPL-3.0-only
"use client";

import { useEffect, useState } from "react";
import { LLM_PROVIDERS, getProviderInfo, maskKey, type LLMProviderId } from "@/lib/llmProviders";
import {
  LLM_CONFIG_CHANGED_EVENT,
  OPEN_MODEL_KEY_EVENT,
  clearLLMConfig,
  getActiveLLMConfig,
  installLLMFetch,
  saveLLMConfig,
  type StoredLLMConfig,
} from "@/lib/llmClientConfig";

/**
 * #88/V4.8.1: the "Model & API key" setting — choose a provider and model,
 * paste your own key, test it, and every AI feature in this browser runs on
 * it. Used inside the global dialog (opened from the top-right widget or any
 * "not configured" message) and on Account → Settings.
 */

interface ServerInfo {
  serverModel: { provider: string; model: string } | null;
  allowCustomBaseUrl: boolean;
}

type TestState = { kind: "idle" } | { kind: "testing" } | { kind: "ok"; reply: string } | { kind: "error"; message: string };

/** Subscribes to the stored config so every consumer stays in sync. */
export function useActiveLLMConfig(): StoredLLMConfig | null {
  const [config, setConfig] = useState<StoredLLMConfig | null>(null);
  useEffect(() => {
    const sync = () => setConfig(getActiveLLMConfig());
    sync();
    window.addEventListener(LLM_CONFIG_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(LLM_CONFIG_CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return config;
}

export function describeLLMConfig(config: StoredLLMConfig | null): string {
  if (!config) return "Using the server's model";
  const label = getProviderInfo(config.provider)?.label ?? config.provider;
  const model = config.model || getProviderInfo(config.provider)?.defaultModel || "";
  return `Using your ${label} key · ${model} · ${maskKey(config.apiKey)}`;
}

export default function ModelKeySettings({ onDone }: { onDone?: () => void }) {
  const active = useActiveLLMConfig();
  const [server, setServer] = useState<ServerInfo | null>(null);
  const [provider, setProvider] = useState<LLMProviderId>("anthropic");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [remember, setRemember] = useState(false);
  const [test, setTest] = useState<TestState>({ kind: "idle" });
  const [notice, setNotice] = useState("");

  useEffect(() => {
    fetch("/api/llm")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: ServerInfo | null) => data && setServer(data))
      .catch(() => {});
  }, []);

  // Prefill from what's saved; the key field is prefilled too so "Test" and
  // "Save" work without retyping, but it's a password field.
  useEffect(() => {
    if (!active) return;
    setProvider(active.provider);
    setModel(active.model);
    setApiKey(active.apiKey);
    setBaseUrl(active.baseUrl ?? "");
    setRemember(active.remember);
  }, [active]);

  const info = getProviderInfo(provider)!;
  const providers = LLM_PROVIDERS.filter((p) => p.id !== "custom" || server?.allowCustomBaseUrl);
  const effectiveModel = model.trim() || info.defaultModel;
  const canSubmit = apiKey.trim().length > 0 && effectiveModel.length > 0 && (provider !== "custom" || baseUrl.trim().length > 0);

  const current = (): StoredLLMConfig => ({
    provider,
    model: effectiveModel,
    apiKey: apiKey.trim(),
    baseUrl: provider === "custom" ? baseUrl.trim() : undefined,
    remember,
  });

  const changeProvider = (next: LLMProviderId) => {
    setProvider(next);
    setModel("");
    setTest({ kind: "idle" });
  };

  const runTest = async () => {
    setTest({ kind: "testing" });
    try {
      const res = await fetch("/api/llm/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(current()),
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok) setTest({ kind: "ok", reply: data.reply ?? "" });
      else setTest({ kind: "error", message: data.error ?? `Request failed (${res.status})` });
    } catch {
      setTest({ kind: "error", message: "Could not reach the server." });
    }
  };

  const save = () => {
    installLLMFetch();
    const stored = saveLLMConfig(current());
    setNotice(stored ? "Saved. AI features in this browser now use your key." : "Saved for this page only — this browser blocked storage.");
    onDone?.();
  };

  const remove = () => {
    clearLLMConfig();
    setApiKey("");
    setModel("");
    setBaseUrl("");
    setRemember(false);
    setTest({ kind: "idle" });
    setNotice("Removed. AI features now use the server's model.");
  };

  return (
    <div className="space-y-4 text-sm">
      <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-xs text-gray-600">
        <span className="font-medium text-gray-800">{describeLLMConfig(active)}</span>
        {!active && server && !server.serverModel && (
          <span className="block mt-1 text-amber-700">This server has no model key of its own — add yours to use chat, planning and review.</span>
        )}
      </div>

      <label className="block">
        <span className="block text-xs font-semibold text-gray-700 mb-1">Provider</span>
        <select
          value={provider}
          onChange={(e) => changeProvider(e.target.value as LLMProviderId)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {providers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="block text-xs font-semibold text-gray-700 mb-1">Model</span>
        <input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          list={`llm-models-${provider}`}
          placeholder={info.defaultModel || "model name"}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        <datalist id={`llm-models-${provider}`}>
          {info.models.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
        <span className="block text-[11px] text-gray-400 mt-1">Any model your key can use. Leave empty for {info.defaultModel || "—"}.</span>
      </label>

      {provider === "custom" && (
        <label className="block">
          <span className="block text-xs font-semibold text-gray-700 mb-1">Base URL</span>
          <input
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="http://localhost:11434/v1"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </label>
      )}

      <label className="block">
        <span className="flex items-center justify-between text-xs font-semibold text-gray-700 mb-1">
          API key
          {info.keyUrl && (
            <a href={info.keyUrl} target="_blank" rel="noopener noreferrer" className="font-normal text-indigo-600 hover:text-indigo-800">
              Get a key ↗
            </a>
          )}
        </span>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => {
            setApiKey(e.target.value);
            setTest({ kind: "idle" });
          }}
          placeholder={info.keyPlaceholder}
          autoComplete="off"
          spellCheck={false}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </label>

      <label className="flex items-start gap-2 text-xs text-gray-600">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="mt-0.5" />
        <span>
          Remember on this device. Otherwise the key is forgotten when you close this tab.
          {remember && <span className="block text-amber-700 mt-0.5">Stored in this browser&apos;s local storage, where any script on this site could read it.</span>}
        </span>
      </label>

      <p className="text-[11px] text-gray-500 leading-relaxed">
        Your key stays in this browser. It is sent to this server only with AI requests, used for that request, and never saved,
        logged or shown again. Usage is billed by your provider. Long-running background research jobs still use the server&apos;s model.
      </p>

      {test.kind === "ok" && <p className="text-xs text-emerald-700">✓ Key works{test.reply ? ` — model replied “${test.reply}”` : ""}.</p>}
      {test.kind === "error" && <p className="text-xs text-red-600 break-words">✗ {test.message}</p>}
      {notice && <p className="text-xs text-gray-600">{notice}</p>}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <button
          type="button"
          onClick={runTest}
          disabled={!canSubmit || test.kind === "testing"}
          className="px-3 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {test.kind === "testing" ? "Testing…" : "Test key"}
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!canSubmit}
          className="px-3 py-2 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:opacity-50"
        >
          Save
        </button>
        {active && (
          <button type="button" onClick={remove} className="ml-auto px-3 py-2 rounded-lg text-red-600 hover:bg-red-50">
            Remove key
          </button>
        )}
      </div>
    </div>
  );
}

/** Global host: installs the fetch bridge and opens the dialog on `atlas:open-model-key`. */
export function ModelKeyDialogHost() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    installLLMFetch();
    const show = () => setOpen(true);
    window.addEventListener(OPEN_MODEL_KEY_EVENT, show);
    return () => window.removeEventListener(OPEN_MODEL_KEY_EVENT, show);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onMouseDown={() => setOpen(false)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="model-key-title"
        className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6 max-h-[90vh] overflow-y-auto"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 id="model-key-title" className="text-lg font-bold text-gray-900">
            Model &amp; API key
          </h2>
          <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-700 text-xl leading-none" aria-label="Close">
            ×
          </button>
        </div>
        <ModelKeySettings onDone={() => setTimeout(() => setOpen(false), 600)} />
      </div>
    </div>
  );
}

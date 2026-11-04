// SPDX-License-Identifier: AGPL-3.0-only
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LLM_PROVIDERS, getProviderInfo, maskKey, type LLMProviderId } from "@/lib/llmProviders";
import {
  LLM_CONFIG_CHANGED_EVENT,
  OPEN_MODEL_KEY_EVENT,
  clearLLMConfig,
  getActiveLLMConfig,
  installLLMFetch,
  markDefaultModelChosen,
  saveLLMConfig,
  type OpenModelKeyOptions,
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
}

/** Select value for "type my own model name". Not a valid model id, so it can't collide. */
const OTHER_MODEL = "__other__";

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
  // True when the user picked "Other model…" (or a saved model isn't in the list).
  const [otherModel, setOtherModel] = useState(false);
  const [apiKey, setApiKey] = useState("");
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
    setOtherModel(Boolean(active.model) && !(getProviderInfo(active.provider)?.models ?? []).includes(active.model));
    setApiKey(active.apiKey);
    setRemember(active.remember);
  }, [active]);

  const info = getProviderInfo(provider)!;
  // A provider's default model is always offered, even if not in its suggestion list.
  const modelOptions = info.models.includes(info.defaultModel) ? info.models : [info.defaultModel, ...info.models];
  const effectiveModel = model.trim() || (otherModel ? "" : info.defaultModel);
  const selectedModel = otherModel ? OTHER_MODEL : modelOptions.includes(effectiveModel) ? effectiveModel : info.defaultModel;

  const changeModel = (value: string) => {
    setTest({ kind: "idle" });
    if (value === OTHER_MODEL) {
      setOtherModel(true);
      setModel("");
    } else {
      setOtherModel(false);
      setModel(value);
    }
  };
  const canSubmit = apiKey.trim().length > 0 && effectiveModel.length > 0;

  const current = (): StoredLLMConfig => ({
    provider,
    model: effectiveModel,
    apiKey: apiKey.trim(),
    remember,
  });

  const changeProvider = (next: LLMProviderId) => {
    setProvider(next);
    setModel(getProviderInfo(next)?.defaultModel ?? "");
    setOtherModel(false);
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
    setModel(info.defaultModel);
    setOtherModel(false);
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
          {LLM_PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="block text-xs font-semibold text-gray-700 mb-1">Model</span>
        <select
          value={selectedModel}
          onChange={(e) => changeModel(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-white font-mono text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          {modelOptions.map((m) => (
            <option key={m} value={m}>
              {m}
              {m === info.defaultModel ? "  (default)" : ""}
            </option>
          ))}
          <option value={OTHER_MODEL}>Other model…</option>
        </select>
        {otherModel && (
          <input
            value={model}
            onChange={(e) => {
              setModel(e.target.value);
              setTest({ kind: "idle" });
            }}
            placeholder={`Exact model id, e.g. ${info.defaultModel}`}
            autoFocus
            spellCheck={false}
            className="mt-2 w-full border border-gray-300 rounded-lg px-3 py-2 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        )}
        <span className="block text-[11px] text-gray-400 mt-1">
          {otherModel ? "Any model id your key can use — newly released models work too." : "Pick a model, or choose “Other model…” to type one."}
        </span>
      </label>


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
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [continueTo, setContinueTo] = useState<string | null>(null);
  const [serverHasModel, setServerHasModel] = useState(false);

  useEffect(() => {
    installLLMFetch();
    const show = (e: Event) => {
      const detail = (e as CustomEvent<OpenModelKeyOptions | undefined>).detail;
      setContinueTo(detail?.continueTo ?? null);
      setOpen(true);
    };
    window.addEventListener(OPEN_MODEL_KEY_EVENT, show);
    return () => window.removeEventListener(OPEN_MODEL_KEY_EVENT, show);
  }, []);

  // Only needed for the "continue with the default model" option.
  useEffect(() => {
    if (!open || !continueTo) return;
    fetch("/api/llm")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: ServerInfo | null) => setServerHasModel(Boolean(data?.serverModel)))
      .catch(() => setServerHasModel(false));
  }, [open, continueTo]);

  const close = () => {
    setOpen(false);
    setContinueTo(null);
  };

  const proceed = () => {
    const target = continueTo;
    close();
    if (target) router.push(target);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setContinueTo(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onMouseDown={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="model-key-title"
        className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6 max-h-[90vh] overflow-y-auto"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 id="model-key-title" className="text-lg font-bold text-gray-900">
            {continueTo ? "Choose a model to explore with" : "Model & API key"}
          </h2>
          <button onClick={close} className="text-gray-400 hover:text-gray-700 text-xl leading-none" aria-label="Close">
            ×
          </button>
        </div>
        {continueTo && (
          <p className="text-xs text-gray-500 mb-4">
            Add your own API key to run Explorer on your provider account{serverHasModel ? ", or continue with Atlas's default model" : ""}.
          </p>
        )}
        <ModelKeySettings onDone={continueTo ? proceed : () => setTimeout(close, 600)} />
        {continueTo && serverHasModel && (
          <button
            type="button"
            onClick={() => {
              markDefaultModelChosen();
              proceed();
            }}
            className="mt-4 w-full text-center text-xs text-gray-500 hover:text-gray-800 underline"
          >
            Continue with Atlas&apos;s default model
          </button>
        )}
      </div>
    </div>
  );
}

// SPDX-License-Identifier: AGPL-3.0-only
"use client";

import { LLM_HEADERS, type UserLLMConfig } from "./llmProviders";

/**
 * #88/V4.8.1: the browser side of bring-your-own model key.
 *
 * The key lives only in this browser: `sessionStorage` by default (gone when
 * the tab closes), `localStorage` only if the user ticks "Remember on this
 * device". It is attached as `x-atlas-llm-*` headers to same-origin `/api/*`
 * requests — never to any other origin — and the server uses it for that
 * request only (see `src/lib/llm.ts`).
 *
 * Rather than edit every `fetch("/api/…")` call in the app, `installLLMFetch`
 * wraps `window.fetch` once and adds the headers there.
 */

export interface StoredLLMConfig extends UserLLMConfig {
  remember: boolean;
}

const STORAGE_KEY = "atlas:llm-config";
export const LLM_CONFIG_CHANGED_EVENT = "atlas:llm-config-changed";
export const OPEN_MODEL_KEY_EVENT = "atlas:open-model-key";

function safeGet(storage: () => Storage): string | null {
  try {
    return storage().getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function safeRemove(storage: () => Storage) {
  try {
    storage().removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable (private mode, blocked site data) */
  }
}

export function loadLLMConfig(): StoredLLMConfig | null {
  if (typeof window === "undefined") return null;
  const raw = safeGet(() => window.sessionStorage) ?? safeGet(() => window.localStorage);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredLLMConfig>;
    if (!parsed.provider || !parsed.apiKey) return null;
    return {
      provider: parsed.provider,
      model: parsed.model ?? "",
      apiKey: parsed.apiKey,
      remember: Boolean(parsed.remember),
    };
  } catch {
    return null;
  }
}

/** Returns false if the browser refused to store it (the key then lasts only for this page). */
export function saveLLMConfig(config: StoredLLMConfig): boolean {
  clearLLMConfig({ silent: true });
  let stored = false;
  try {
    const target = config.remember ? window.localStorage : window.sessionStorage;
    target.setItem(STORAGE_KEY, JSON.stringify(config));
    stored = true;
  } catch {
    memoryFallback = config;
  }
  window.dispatchEvent(new Event(LLM_CONFIG_CHANGED_EVENT));
  return stored;
}

export function clearLLMConfig(opts: { silent?: boolean } = {}) {
  if (typeof window === "undefined") return;
  memoryFallback = null;
  safeRemove(() => window.sessionStorage);
  safeRemove(() => window.localStorage);
  if (!opts.silent) window.dispatchEvent(new Event(LLM_CONFIG_CHANGED_EVENT));
}

// Used only when storage is blocked, so the key still works until reload.
let memoryFallback: StoredLLMConfig | null = null;

function activeConfig(): StoredLLMConfig | null {
  return loadLLMConfig() ?? memoryFallback;
}

export function getActiveLLMConfig(): StoredLLMConfig | null {
  return activeConfig();
}

export interface OpenModelKeyOptions {
  /**
   * Where to go once the user has a model: after saving a key, or after
   * choosing to continue on the server's default model.
   */
  continueTo?: string;
}

/** What GET /api/llm reports (#88, #91). */
export interface ServerLLMInfo {
  serverModel: { provider: string; model: string } | null;
  edition: "hosted" | "self-hosted";
  /** Whether to actively offer "bring your own key" (Explorer gate, Model key pill, menu item). */
  offerUserKeys: boolean;
}

let serverInfoPromise: Promise<ServerLLMInfo | null> | null = null;

/** Fetched once per page load and shared by every caller. Null if the server couldn't be reached. */
export function fetchServerLLMInfo(): Promise<ServerLLMInfo | null> {
  if (!serverInfoPromise) {
    serverInfoPromise = fetch("/api/llm")
      .then((r) => (r.ok ? (r.json() as Promise<ServerLLMInfo>) : null))
      .catch(() => null)
      .then((info) => {
        if (!info) serverInfoPromise = null; // let a later caller retry
        return info;
      });
  }
  return serverInfoPromise;
}

/**
 * #88/#91: should this visitor be asked for a model key before AI work starts?
 * No if they already have one (or chose the server's default this tab).
 * Otherwise follow the server's `offerUserKeys`; if the server info can't be
 * fetched, ask — the safe default. Used when Explorer, the open-source app's
 * first page, opens (#97).
 */
export async function needsModelKeyPrompt(): Promise<boolean> {
  if (getActiveLLMConfig() || hasChosenDefaultModel()) return false;
  const info = await fetchServerLLMInfo();
  return !info || info.offerUserKeys;
}

export function openModelKeyDialog(opts: OpenModelKeyOptions = {}) {
  window.dispatchEvent(new CustomEvent<OpenModelKeyOptions>(OPEN_MODEL_KEY_EVENT, { detail: opts }));
}

const DEFAULT_MODEL_CHOSEN_KEY = "atlas:llm-default-chosen";

/** The user picked "continue with the default model" this tab — don't ask again until it closes. */
export function markDefaultModelChosen() {
  try {
    window.sessionStorage.setItem(DEFAULT_MODEL_CHOSEN_KEY, "1");
  } catch {
    /* storage blocked: they'll simply be asked again next time */
  }
}

export function hasChosenDefaultModel(): boolean {
  try {
    return window.sessionStorage.getItem(DEFAULT_MODEL_CHOSEN_KEY) === "1";
  } catch {
    return false;
  }
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/** Same-origin `/api/*`, excluding NextAuth's own endpoints. */
export function shouldAttachLLMHeaders(url: string, origin: string): boolean {
  try {
    const u = new URL(url, origin);
    return u.origin === origin && u.pathname.startsWith("/api/") && !u.pathname.startsWith("/api/auth/");
  } catch {
    return false;
  }
}

export function llmHeadersFor(config: UserLLMConfig): Record<string, string> {
  const h: Record<string, string> = {
    [LLM_HEADERS.provider]: config.provider,
    [LLM_HEADERS.key]: config.apiKey,
  };
  if (config.model) h[LLM_HEADERS.model] = config.model;
  return h;
}

const PATCHED = Symbol.for("atlas.llmFetchPatched");

export function installLLMFetch() {
  if (typeof window === "undefined") return;
  const w = window as typeof window & { [PATCHED]?: boolean };
  if (w[PATCHED]) return;
  w[PATCHED] = true;

  const original = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const config = activeConfig();
    if (!config || !shouldAttachLLMHeaders(requestUrl(input), window.location.origin)) {
      return original(input, init);
    }
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    for (const [k, v] of Object.entries(llmHeadersFor(config))) headers.set(k, v);
    if (input instanceof Request && !init) return original(new Request(input, { headers }));
    return original(input, { ...init, headers });
  };
}

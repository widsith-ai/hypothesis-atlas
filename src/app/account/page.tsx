// SPDX-License-Identifier: AGPL-3.0-only
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import ModelKeySettings from "@/components/ModelKeySettings";

interface Account {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  planTier: string;
  createdAt: string;
  usage: { jobs: number; boldIdeas: number };
}

type Tab = "profile" | "billing" | "settings";

/** #43/V3.2: the real account settings page replacing AuthModal's fake stub — profile, billing & usage (read from the User row, not fabricated — see planTier's schema comment), and settings (name + password). */
export default function AccountPage() {
  const { status } = useSession();
  const [account, setAccount] = useState<Account | null>(null);
  const [tab, setTab] = useState<Tab>("profile");
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("tab");
    if (requested === "profile" || requested === "billing" || requested === "settings") {
      setTab(requested);
    }
  }, []);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/account")
      .then((r) => {
        if (!r.ok) throw new Error("failed");
        return r.json();
      })
      .then(setAccount)
      .catch(() => setNotFound(true));
  }, [status]);

  if (status === "loading") {
    return <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">Loading…</div>;
  }

  if (status === "unauthenticated") {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 text-center">
        <div>
          <p className="text-lg font-semibold text-gray-800">Sign in to view your account</p>
          <p className="text-sm text-gray-500 mt-2">
            Use the "Sign in" button in the top-right corner, then come back to this page.
          </p>
          <Link href="/" className="inline-block mt-4 text-sm text-indigo-600 hover:text-indigo-800 font-medium">
            ← Back home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen ink-paper">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">My Account</h1>
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-800">
            ← Back home
          </Link>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="flex gap-1 mb-6 border-b border-gray-200">
          {([
            ["profile", "Profile"],
            ["billing", "Billing & Usage"],
            ["settings", "Settings"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
                tab === key
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-gray-500 hover:text-gray-800"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {notFound ? (
          <p className="text-sm text-rose-500">Could not load your account. Try reloading the page.</p>
        ) : !account ? (
          <p className="text-sm text-gray-400">Loading your account…</p>
        ) : tab === "profile" ? (
          <ProfileTab account={account} />
        ) : tab === "billing" ? (
          <BillingTab account={account} />
        ) : (
          <SettingsTab account={account} onUpdated={setAccount} />
        )}
      </div>
    </div>
  );
}

function initials(name: string | null, email: string | null): string {
  const source = name?.trim() || email || "?";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

function ProfileTab({ account }: { account: Account }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6">
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xl font-bold flex-shrink-0">
          {initials(account.name, account.email)}
        </div>
        <div>
          <p className="text-lg font-bold text-gray-900">{account.name || "Unnamed"}</p>
          <p className="text-sm text-gray-500">{account.email}</p>
        </div>
      </div>
      <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-gray-400">Member since</dt>
          <dd className="text-gray-800 font-medium mt-0.5">
            {new Date(account.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
          </dd>
        </div>
        <div>
          <dt className="text-gray-400">Plan</dt>
          <dd className="text-gray-800 font-medium mt-0.5 capitalize">{account.planTier}</dd>
        </div>
        <div>
          <dt className="text-gray-400">Research jobs</dt>
          <dd className="text-gray-800 font-medium mt-0.5">{account.usage.jobs}</dd>
        </div>
        <div>
          <dt className="text-gray-400">Bold ideas</dt>
          <dd className="text-gray-800 font-medium mt-0.5">{account.usage.boldIdeas}</dd>
        </div>
      </dl>
    </div>
  );
}

function BillingTab({ account }: { account: Account }) {
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="text-sm font-bold text-gray-900 mb-3">Plan</h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-lg font-semibold text-gray-900 capitalize">{account.planTier}</p>
            <p className="text-xs text-gray-400 mt-1">
              {account.planTier === "free"
                ? "No hosted billing is live yet — paid plans aren't available to purchase from this page."
                : "Managed externally."}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="text-sm font-bold text-gray-900 mb-3">Usage</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-2xl font-bold text-gray-900">{account.usage.jobs}</p>
            <p className="text-xs text-gray-500 mt-1">Research jobs created</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-2xl font-bold text-gray-900">{account.usage.boldIdeas}</p>
            <p className="text-xs text-gray-500 mt-1">Bold ideas explored</p>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-4">
          Counts are of research this account owns — self-hosted/anonymous usage isn't attributed to any account.
        </p>
      </div>
    </div>
  );
}

function SettingsTab({ account, onUpdated }: { account: Account; onUpdated: (a: Account) => void }) {
  const [name, setName] = useState(account.name ?? "");
  const [savingName, setSavingName] = useState(false);
  const [nameMessage, setNameMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingName(true);
    setNameMessage(null);
    try {
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNameMessage({ type: "error", text: data.error ?? "Could not update your name." });
        return;
      }
      onUpdated({ ...account, name: data.name });
      setNameMessage({ type: "ok", text: "Saved." });
    } catch {
      setNameMessage({ type: "error", text: "Could not reach the server." });
    } finally {
      setSavingName(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setChangingPassword(true);
    setPasswordMessage(null);
    try {
      const res = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPasswordMessage({ type: "error", text: data.error ?? "Could not change your password." });
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setPasswordMessage({ type: "ok", text: "Password changed." });
    } catch {
      setPasswordMessage({ type: "error", text: "Could not reach the server." });
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <div className="space-y-4">
      <form onSubmit={handleSaveName} className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="text-sm font-bold text-gray-900 mb-3">Display name</h2>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <button
            type="submit"
            disabled={savingName || !name.trim()}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {savingName ? "Saving…" : "Save"}
          </button>
        </div>
        {nameMessage && (
          <p className={`text-xs mt-2 ${nameMessage.type === "ok" ? "text-emerald-600" : "text-rose-500"}`}>
            {nameMessage.text}
          </p>
        )}
      </form>

      <form onSubmit={handleChangePassword} className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="text-sm font-bold text-gray-900 mb-3">Change password</h2>
        <div className="space-y-3">
          <input
            type="password"
            placeholder="Current password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <input
            type="password"
            placeholder="New password (min. 8 characters)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
          <button
            type="submit"
            disabled={changingPassword || !currentPassword || newPassword.length < 8}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {changingPassword ? "Changing…" : "Change password"}
          </button>
        </div>
        {passwordMessage && (
          <p className={`text-xs mt-2 ${passwordMessage.type === "ok" ? "text-emerald-600" : "text-rose-500"}`}>
            {passwordMessage.text}
          </p>
        )}
      </form>

      {/* #88/V4.8.1: bring your own model key. Browser-held, not saved to the account. */}
      <section className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="text-sm font-bold text-gray-900 mb-1">Model &amp; API key</h2>
        <p className="text-xs text-gray-500 mb-4">Run Atlas&apos;s AI features on your own provider account instead of the server&apos;s.</p>
        <ModelKeySettings />
      </section>
    </div>
  );
}

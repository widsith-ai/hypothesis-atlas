// SPDX-License-Identifier: AGPL-3.0-only
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

const MIN_PASSWORD_LENGTH = 8;

/**
 * Landing page for the emailed reset link (/reset-password?token=…). Sets the
 * new password, then signs the user straight in with it.
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get("token") ?? "");
  }, []);

  const openSignIn = () => {
    router.push("/");
    setTimeout(() => window.dispatchEvent(new Event("atlas:open-signin")), 300);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Couldn't reset your password. Please try again.");
        return;
      }
      setDone(true);
      const result = await signIn("credentials", { email: data.email, password, redirect: false });
      if (!result?.error) router.push("/");
    } catch {
      setError("Couldn't reach the server. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen ink-paper flex items-center justify-center px-6">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
        <h1 className="text-xl font-bold text-gray-900">Choose a new password</h1>

        {token === null ? null : !token ? (
          <div className="mt-4 text-sm text-gray-600">
            <p>This page needs the link from your reset email.</p>
            <button onClick={openSignIn} className="mt-4 text-indigo-600 hover:text-indigo-800 font-medium">
              Request a new link →
            </button>
          </div>
        ) : done ? (
          <div className="mt-4 text-sm text-gray-600">
            <p className="text-emerald-700 font-medium">Your password has been changed.</p>
            <p className="mt-2">Signing you in…</p>
            <button onClick={openSignIn} className="mt-4 text-indigo-600 hover:text-indigo-800 font-medium">
              Sign in manually
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-5 space-y-3">
            <input
              type="password"
              placeholder={`New password (min. ${MIN_PASSWORD_LENGTH} characters)`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <input
              type="password"
              placeholder="Confirm new password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            {error && (
              <p className="text-xs text-rose-600">
                {error}
                {error.includes("expired") && (
                  <button type="button" onClick={openSignIn} className="ml-1 underline font-medium">
                    Request a new link
                  </button>
                )}
              </p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {loading ? "Saving…" : "Set new password"}
            </button>
          </form>
        )}

        <Link href="/" className="block mt-6 text-xs text-gray-400 hover:text-gray-700">
          ← Back home
        </Link>
      </div>
    </div>
  );
}

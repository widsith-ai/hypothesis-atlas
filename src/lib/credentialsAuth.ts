// SPDX-License-Identifier: AGPL-3.0-only
"use client";

import { signIn } from "next-auth/react";

/**
 * The email + password account flows, shared by the sign-in modal
 * (AuthModal), so every sign-in path calls the same endpoints and shows the
 * same messages.
 */
export type AuthResult = { ok: true; message?: string } | { ok: false; error: string };

const UNREACHABLE = "Could not reach the server — please try again.";

export async function signInWithPassword(email: string, password: string): Promise<AuthResult> {
  try {
    const result = await signIn("credentials", { email, password, redirect: false });
    return result?.error ? { ok: false, error: "Incorrect email or password." } : { ok: true };
  } catch {
    return { ok: false, error: UNREACHABLE };
  }
}

/** Creates the account, then signs straight in with it. */
export async function signUpAndSignIn(name: string, email: string, password: string): Promise<AuthResult> {
  try {
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error ?? "Could not create your account." };
  } catch {
    return { ok: false, error: UNREACHABLE };
  }
  const signedIn = await signInWithPassword(email, password);
  return signedIn.ok ? signedIn : { ok: false, error: "Account created, but sign-in failed — try signing in." };
}

/** Emails a one-time reset link. The server answers the same whether or not the account exists. */
export async function requestPasswordReset(email: string): Promise<AuthResult> {
  try {
    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: data.error ?? "Couldn't send a reset link. Please try again." };
    return { ok: true, message: data.message ?? "If an account exists for that email, we've sent a reset link." };
  } catch {
    return { ok: false, error: UNREACHABLE };
  }
}

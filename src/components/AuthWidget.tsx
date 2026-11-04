// SPDX-License-Identifier: AGPL-3.0-only
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import AuthModal from "./AuthModal";
import { useActiveLLMConfig, describeLLMConfig } from "./ModelKeySettings";
import { openModelKeyDialog } from "@/lib/llmClientConfig";

/**
 * The one global, reachable entry point into real accounts (phase 1 of
 * #36/V3.6) — every other page in this app rolls its own bespoke header, so
 * rather than redesign each one (out of scope for "make login/signup
 * real"), this is a small fixed corner widget available everywhere via
 * RootLayout. Anonymous usage is completely unaffected: nothing here gates
 * any page, it only adds a way to sign in if you want to.
 *
 * #43/V3.2: the signed-in pill is now a dropdown (Profile / Billing & Usage
 * / Settings / Sign out) instead of just a name + sign-out button — "click
 * the icon top-right to check your own profile."
 */
function accountInitials(name: string | null | undefined, email: string | null | undefined): string {
  const source = name?.trim() || email || "?";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

export default function AuthWidget() {
  const { data: session, status } = useSession();
  const [modalOpen, setModalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const llmConfig = useActiveLLMConfig();

  // Lets any page open the sign-in modal without owning its state — the
  // landing page uses this to gate "Try Explorer" behind an account.
  useEffect(() => {
    const openSignIn = () => setModalOpen(true);
    window.addEventListener("atlas:open-signin", openSignIn);
    return () => window.removeEventListener("atlas:open-signin", openSignIn);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  if (status === "loading") return null;

  return (
    <>
      <div className="fixed top-4 right-4 z-40" ref={menuRef}>
        {session?.user ? (
          <div className="relative">
            <button
              onClick={() => setMenuOpen((open) => !open)}
              className="flex items-center gap-2 bg-white/90 backdrop-blur-sm border border-gray-200 rounded-full pl-3 pr-2 py-1 shadow-sm text-xs hover:bg-white transition-colors"
            >
              {/* Full name on wider screens; a compact initials badge on phones so the pill can't run into the nav's theme switcher. */}
              <span className="hidden sm:inline text-gray-700 font-medium max-w-[100px] truncate">
                {session.user.name ?? session.user.email}
              </span>
              <span className="sm:hidden w-6 h-6 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">
                {accountInitials(session.user.name, session.user.email)}
              </span>
              <svg
                className={`w-3 h-3 text-gray-400 transition-transform ${menuOpen ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {menuOpen && (
              <div className="absolute top-full right-0 mt-1.5 w-48 bg-white border border-gray-200 rounded-xl shadow-lg py-1.5 text-sm">
                <Link
                  href="/account?tab=profile"
                  onClick={() => setMenuOpen(false)}
                  className="block px-4 py-2 text-gray-700 hover:bg-gray-50"
                >
                  Profile
                </Link>
                <Link
                  href="/account?tab=billing"
                  onClick={() => setMenuOpen(false)}
                  className="block px-4 py-2 text-gray-700 hover:bg-gray-50"
                >
                  Billing &amp; Usage
                </Link>
                <Link
                  href="/account?tab=settings"
                  onClick={() => setMenuOpen(false)}
                  className="block px-4 py-2 text-gray-700 hover:bg-gray-50"
                >
                  Settings
                </Link>
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    openModelKeyDialog();
                  }}
                  title={describeLLMConfig(llmConfig)}
                  className="w-full text-left px-4 py-2 text-gray-700 hover:bg-gray-50 flex items-center justify-between"
                >
                  Model &amp; API key
                  {llmConfig && <span className="w-2 h-2 rounded-full bg-emerald-500" aria-label="Using your own key" />}
                </button>
                <div className="my-1 border-t border-gray-100" />
                <button
                  onClick={() => signOut()}
                  className="w-full text-left px-4 py-2 text-red-500 hover:bg-red-50"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            {/* #88: anonymous / self-hosted users can bring a key without an account. */}
            <button
              onClick={() => openModelKeyDialog()}
              title={describeLLMConfig(llmConfig)}
              className="bg-white/90 backdrop-blur-sm border border-gray-200 rounded-full px-3 py-1.5 shadow-sm text-xs font-medium text-gray-600 hover:bg-white transition-colors flex items-center gap-1.5"
            >
              {llmConfig && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
              Model key
            </button>
            <button
              onClick={() => setModalOpen(true)}
              className="bg-white/90 backdrop-blur-sm border border-gray-200 rounded-full px-3 py-1.5 shadow-sm text-xs font-semibold text-gray-700 hover:bg-white transition-colors"
            >
              Sign in
            </button>
          </div>
        )}
      </div>

      <AuthModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}

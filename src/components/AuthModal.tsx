"use client";

import { useState } from "react";
import { requestPasswordReset, signInWithPassword, signUpAndSignIn } from "@/lib/credentialsAuth";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: "login" | "signup" | "forgot";
  onAuthSuccess?: (user: { name: string; email: string }) => void;
}

export default function AuthModal({
  isOpen,
  onClose,
  initialMode = "login",
  onAuthSuccess,
}: AuthModalProps) {
  const [mode, setMode] = useState<"login" | "signup" | "forgot">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const switchMode = (next: "login" | "signup" | "forgot") => {
    setMode(next);
    setError("");
    setMessage("");
  };

  const reset = () => {
    setEmail("");
    setPassword("");
    setName("");
    setMessage("");
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    setError("");

    try {
      if (mode === "forgot") {
        const reset = await requestPasswordReset(email);
        if (reset.ok) setMessage(reset.message ?? "");
        else setError(reset.error);
        return;
      }

      const result = mode === "signup" ? await signUpAndSignIn(name, email, password) : await signInWithPassword(email, password);
      if (!result.ok) {
        setError(result.error);
        return;
      }

      setMessage(mode === "login" ? "Signed in!" : "Account created!");
      onAuthSuccess?.({ name: mode === "signup" ? name : email.split("@")[0], email });
      setTimeout(() => {
        onClose();
        reset();
      }, 800);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      {/*
        Structural fix, not just "add scrolling": the submit button and the
        mode-switch links live in a footer OUTSIDE the scrollable area, so
        they're always on screen no matter the viewport height, zoom level,
        or how many fields are showing — not reliant on anyone noticing a
        scrollbar. The footer's button targets the form by id (the `form`
        attribute) since it's no longer a DOM descendant of the <form>.
      */}
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md relative animate-fade-in flex flex-col max-h-[calc(100vh-2rem)]">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors z-10"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        <div className="overflow-y-auto px-8 pt-8 flex-1 min-h-0">
          <div className="mb-6">
            <h2 className="text-3xl font-bold text-gray-900 mb-2">
              {mode === "login" && "Welcome Back"}
              {mode === "signup" && "Create Account"}
              {mode === "forgot" && "Reset Password"}
            </h2>
            <p className="text-gray-600">
              {mode === "login" && "Sign in to access your research"}
              {mode === "signup" && "Start mapping evidence today"}
              {mode === "forgot" && "We'll send you a reset link"}
            </p>
          </div>

          <form id="auth-modal-form" onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="John Doe"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email Address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="you@example.com"
              />
            </div>

            {mode !== "forgot" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="••••••••"
                />
              </div>
            )}

          </form>
        </div>

        {/* Error/success feedback lives here, not inside the scrollable area above — it needs to appear right next to the button the user just pressed, not somewhere they'd have to scroll back up to see. */}
        <div className="flex-shrink-0 px-8 pb-8 pt-4">
          {error && (
            <div className="p-3 mb-4 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
              {error}
            </div>
          )}

          {message && (
            <div className="p-3 mb-4 bg-green-50 border border-green-200 rounded-lg text-green-800 text-sm">
              {message}
            </div>
          )}

          {/*
            A solid color, not a gradient: this is the same bg-indigo-600
            every other primary button in the app uses (AuthWidget's
            dropdown, the Account page's Save/Change-password buttons,
            etc.) — besides the consistency, a plain background-color is
            far less likely to render wrong (invisible/washed-out) under a
            browser dark-mode/forced-colors extension than a gradient, and
            there's no ambiguity about whether the white text is readable
            against it.
          */}
          <button
            form="auth-modal-form"
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Processing...
              </span>
            ) : (
              <>
                {mode === "login" && "Sign In"}
                {mode === "signup" && "Create Account"}
                {mode === "forgot" && "Send Reset Link"}
              </>
            )}
          </button>

          <div className="mt-6 text-center text-sm">
            {mode === "login" && (
              <>
                <button
                  onClick={() => switchMode("forgot")}
                  className="text-blue-600 hover:text-blue-700 font-medium"
                >
                  Forgot password?
                </button>
                <p className="mt-2 text-gray-600">
                  Don't have an account?{" "}
                  <button
                    onClick={() => switchMode("signup")}
                    className="text-blue-600 hover:text-blue-700 font-medium"
                  >
                    Sign up
                  </button>
                </p>
              </>
            )}

            {mode === "signup" && (
              <p className="text-gray-600">
                Already have an account?{" "}
                <button
                  onClick={() => switchMode("login")}
                  className="text-blue-600 hover:text-blue-700 font-medium"
                >
                  Sign in
                </button>
              </p>
            )}

            {mode === "forgot" && (
              <p className="text-gray-600">
                Remember your password?{" "}
                <button
                  onClick={() => switchMode("login")}
                  className="text-blue-600 hover:text-blue-700 font-medium"
                >
                  Sign in
                </button>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

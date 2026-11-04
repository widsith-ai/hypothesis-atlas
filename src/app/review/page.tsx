"use client";

import Link from "next/link";
import PaperReviewPanel from "@/components/PaperReviewPanel";
import AccountSlot from "@/components/AccountSlot";

export default function PeerReviewPage() {
  return (
    <main className="min-h-screen ink-paper text-gray-900">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <header className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: "linear-gradient(135deg, #44664b, #44664b)" }}
            >
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold">Peer Review</h1>
              <p className="text-sm text-gray-500">
                A committee of reviewer agents grades your paper against a publisher&apos;s real criteria.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/explore"
              className="px-4 py-2 rounded-lg font-semibold text-sm border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Explore
            </Link>
            <Link
              href="/jobs"
              className="px-4 py-2 rounded-lg font-semibold text-sm border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
            >
              My Research
            </Link>
            <AccountSlot />
          </div>
        </header>

        <PaperReviewPanel />
      </div>
    </main>
  );
}

// SPDX-License-Identifier: AGPL-3.0-only
"use client";

/**
 * Starts an evidence-mapping run for a topic (POST /api/jobs) and remembers it
 * as the last run. Used by the Explore word cloud.
 */
export type StartRunResult = { ok: true; jobId: string } | { ok: false; error: string };

export async function startResearchRun(topicQuery: string): Promise<StartRunResult> {
  try {
    const response = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topicQuery }),
    });
    const data = await response.json().catch(() => ({}));
    if (data.jobId) {
      try {
        localStorage.setItem("lastJobId", data.jobId);
      } catch {
        /* storage blocked — the run still started */
      }
      return { ok: true, jobId: data.jobId };
    }
    return { ok: false, error: data.error ?? "Couldn't start the run — please try again." };
  } catch {
    return { ok: false, error: "Couldn't reach the server — please try again." };
  }
}

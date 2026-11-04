// SPDX-License-Identifier: AGPL-3.0-only
import { redirect } from "next/navigation";
import { sameSiteCallbackPath } from "@/lib/edition";

// The open-source app opens on Explorer, the word cloud, for everyone (#97).
// The marketing landing page and the signed-out entrance (#96) belong to the
// hosted product and live in the private repo. A same-site ?callbackUrl= (from
// a sign-in return) is honoured; anything else is ignored (no open redirect).
export const dynamic = "force-dynamic";

export default function Home({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  redirect(sameSiteCallbackPath(searchParams.callbackUrl, process.env.NEXTAUTH_URL) ?? "/explore");
}

// SPDX-License-Identifier: AGPL-3.0-only

/**
 * #91: which edition of Atlas this deployment is.
 *
 * - `hosted`: our deployment. AI runs on our server key by default, and
 *   users may bring their own key (#88).
 * - `self-hosted`: the open-source edition. Whoever runs it puts their own
 *   keys in the server's `.env`, so users shouldn't be asked for one again.
 *
 * Set explicitly with `ATLAS_EDITION=hosted|self-hosted`. Unset, it follows
 * `REQUIRE_AUTH` (the existing hosted-deployment flag, see authConfig.ts):
 * `true` → hosted, otherwise self-hosted. So the open-source default needs no
 * configuration. Server-side only.
 */

export type Edition = 'hosted' | 'self-hosted'

export function resolveEdition(env: { ATLAS_EDITION?: string; REQUIRE_AUTH?: string }): Edition {
  const explicit = env.ATLAS_EDITION?.trim().toLowerCase()
  if (explicit === 'hosted' || explicit === 'self-hosted') return explicit
  return env.REQUIRE_AUTH === 'true' ? 'hosted' : 'self-hosted'
}

export function getEdition(): Edition {
  return resolveEdition({ ATLAS_EDITION: process.env.ATLAS_EDITION, REQUIRE_AUTH: process.env.REQUIRE_AUTH })
}

/**
 * Whether the UI should actively offer "bring your own model key" (the
 * Explorer gate, the top-right Model key pill, the account-menu item).
 * Hosted: always. Self-hosted: only when the backend has no model key of its
 * own — otherwise the person running it has already configured one.
 * The setting itself stays reachable under Account → Settings either way.
 */
export function shouldOfferUserKeys(edition: Edition, serverHasModel: boolean): boolean {
  return edition === 'hosted' || !serverHasModel
}

/**
 * #96: a signed-in visitor sent to `/?callbackUrl=…` by NextAuth should land
 * there, not on Explorer. Only a path on this site is honoured: a relative
 * path, or an absolute URL on the app's own origin (`appUrl`, NEXTAUTH_URL).
 * Anything else — another host, `//evil.example`, `javascript:` — is ignored,
 * so this can never become an open redirect.
 */
export function sameSiteCallbackPath(raw: string | string[] | undefined, appUrl?: string): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw
  if (!value) return null
  const base = 'http://atlas.invalid'
  let url: URL
  try {
    url = new URL(value, base)
  } catch {
    return null
  }
  let ownOrigin: string | null = null
  try {
    ownOrigin = appUrl ? new URL(appUrl).origin : null
  } catch {
    ownOrigin = null
  }
  const relative = url.origin === base && value.startsWith('/') && !value.startsWith('//')
  if (!relative && url.origin !== ownOrigin) return null
  const path = url.pathname + url.search + url.hash
  return path === '/' ? null : path
}

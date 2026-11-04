// SPDX-License-Identifier: AGPL-3.0-only
import { createHash, randomBytes } from 'crypto'
import { prisma } from '@/lib/prisma'

/**
 * Password-reset tokens, stored in NextAuth's existing `VerificationToken`
 * table (no schema change). Only a SHA-256 hash of the token is stored, so a
 * leaked database row can't be used to reset anyone's password; the raw
 * token exists only in the emailed link.
 *
 * Rows are namespaced by `identifier = "password-reset:<email>"` so they never
 * collide with NextAuth's own email-verification tokens.
 */

export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000 // 1 hour
/** One reset email per address per minute, so the form can't be used to spam someone's inbox. */
export const RESET_REQUEST_COOLDOWN_MS = 60 * 1000

const PREFIX = 'password-reset:'

/**
 * The forgot-password response, the same whether or not an account exists,
 * so the form can't be used to find out who has an account.
 */
export const FORGOT_PASSWORD_MESSAGE =
  "If an account exists for that email, we've sent a link to reset your password. It expires in 1 hour."

export function resetIdentifier(email: string): string {
  return `${PREFIX}${email.trim().toLowerCase()}`
}

export function hashResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export type CreateResetTokenResult = { ok: true; token: string } | { ok: false; reason: 'cooldown' }

/** Issues a new token for `email`, replacing any earlier one. */
export async function createPasswordResetToken(email: string, now = Date.now()): Promise<CreateResetTokenResult> {
  const identifier = resetIdentifier(email)

  // VerificationToken has no createdAt; a token's issue time is expires − TTL.
  const latest = await prisma.verificationToken.findFirst({ where: { identifier }, orderBy: { expires: 'desc' } })
  if (latest && latest.expires.getTime() - RESET_TOKEN_TTL_MS > now - RESET_REQUEST_COOLDOWN_MS) {
    return { ok: false, reason: 'cooldown' }
  }

  const token = randomBytes(32).toString('hex')
  await prisma.verificationToken.deleteMany({ where: { identifier } })
  await prisma.verificationToken.create({
    data: { identifier, token: hashResetToken(token), expires: new Date(now + RESET_TOKEN_TTL_MS) },
  })
  return { ok: true, token }
}

/**
 * Checks a token and, if valid, deletes it (single use) and returns the
 * email it was issued for. Expired or unknown tokens return null.
 */
export async function consumePasswordResetToken(token: string, now = Date.now()): Promise<string | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null
  const row = await prisma.verificationToken.findUnique({ where: { token: hashResetToken(token) } })
  if (!row || !row.identifier.startsWith(PREFIX)) return null

  // Single use either way: an expired token is removed too.
  await prisma.verificationToken.deleteMany({ where: { identifier: row.identifier } })
  if (row.expires.getTime() <= now) return null
  return row.identifier.slice(PREFIX.length)
}

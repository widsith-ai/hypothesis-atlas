// SPDX-License-Identifier: AGPL-3.0-only
import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { prisma } from '@/lib/prisma'
import { FORGOT_PASSWORD_MESSAGE, createPasswordResetToken } from '@/lib/passwordReset'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * The link's origin comes from configuration, never from the request: the
 * Host header is attacker-controlled, and trusting it would let someone
 * trigger a genuine reset email whose link points at their own site.
 * The request origin is allowed only in local development.
 */
function appUrl(request: NextRequest): string | null {
  const configured = process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXTAUTH_URL
  if (configured) return configured.replace(/\/$/, '')
  return process.env.NODE_ENV === 'production' ? null : request.nextUrl.origin
}

function resetEmailHtml(link: string): string {
  return `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;color:#1f2937">
  <h2 style="font-size:18px">Reset your Hypothesis Atlas password</h2>
  <p style="font-size:14px;line-height:1.5">Someone asked to reset the password for this account. If that was you, choose a new password below. This link works once and expires in 1 hour.</p>
  <p style="margin:24px 0"><a href="${link}" style="background:#4f46e5;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">Choose a new password</a></p>
  <p style="font-size:12px;color:#6b7280">If you didn't ask for this, you can ignore this email — your password won't change.</p>
</div>`
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
  }

  try {
    const user = await prisma.user.findUnique({ where: { email }, select: { passwordHash: true } })
    // OAuth-only accounts have no password to reset; say nothing different.
    if (!user?.passwordHash) return NextResponse.json({ ok: true, message: FORGOT_PASSWORD_MESSAGE })

    const issued = await createPasswordResetToken(email)
    if (!issued.ok) return NextResponse.json({ ok: true, message: FORGOT_PASSWORD_MESSAGE })

    const base = appUrl(request)
    if (!base) {
      console.error('[forgot-password] NEXT_PUBLIC_APP_URL / NEXTAUTH_URL not set — cannot build a reset link')
      return NextResponse.json({ ok: true, message: FORGOT_PASSWORD_MESSAGE })
    }
    const link = `${base}/reset-password?token=${issued.token}`
    const resendKey = process.env.RESEND_API_KEY

    if (!resendKey) {
      if (process.env.NODE_ENV !== 'production') {
        // Local dev without email: print the link so the flow is still testable.
        console.info(`[forgot-password] RESEND_API_KEY not set — reset link for ${email}: ${link}`)
      } else {
        console.error('[forgot-password] RESEND_API_KEY not set — cannot send reset email')
      }
      return NextResponse.json({ ok: true, message: FORGOT_PASSWORD_MESSAGE })
    }

    const result = await new Resend(resendKey).emails.send({
      from: process.env.EMAIL_FROM ?? 'Hypothesis Atlas <onboarding@resend.dev>',
      to: email,
      subject: 'Reset your Hypothesis Atlas password',
      html: resetEmailHtml(link),
    })
    if (result.error) console.error('[forgot-password] Resend error:', result.error)

    return NextResponse.json({ ok: true, message: FORGOT_PASSWORD_MESSAGE })
  } catch (error) {
    console.error('[forgot-password] failed:', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Couldn't send a reset link right now. Please try again shortly." }, { status: 503 })
  }
}

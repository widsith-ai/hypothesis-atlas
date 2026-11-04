// SPDX-License-Identifier: AGPL-3.0-only
import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { MIN_PASSWORD_LENGTH } from '@/lib/authValidation'
import { consumePasswordResetToken } from '@/lib/passwordReset'

const BCRYPT_ROUNDS = 12

/** Sets a new password from an emailed reset link (see /api/auth/forgot-password). */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const token = typeof body.token === 'string' ? body.token : ''
  const password = typeof body.password === 'string' ? body.password : ''

  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` }, { status: 400 })
  }

  try {
    const email = await consumePasswordResetToken(token)
    if (!email) {
      return NextResponse.json(
        { error: 'This reset link is invalid or has expired. Request a new one from the sign-in window.' },
        { status: 400 }
      )
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS)
    const updated = await prisma.user.updateMany({ where: { email }, data: { passwordHash } })
    if (updated.count === 0) {
      return NextResponse.json({ error: 'This reset link is invalid or has expired.' }, { status: 400 })
    }

    return NextResponse.json({ ok: true, email })
  } catch (error) {
    console.error('[reset-password] failed:', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: "Couldn't reset your password right now. Please try again shortly." }, { status: 503 })
  }
}

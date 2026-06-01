import { NextResponse } from 'next/server'
import { getConnectedEmail, getStoredTokens } from '@/lib/gmail'

export async function GET() {
  try {
    const tokens = await getStoredTokens()
    if (!tokens) {
      return NextResponse.json({ connected: false, email: null })
    }

    const email = await getConnectedEmail()
    return NextResponse.json({ connected: !!email, email })
  } catch (error) {
    console.error('GET /api/auth/google/status error:', error)
    return NextResponse.json({ connected: false, email: null })
  }
}

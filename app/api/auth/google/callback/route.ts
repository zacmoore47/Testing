import { NextRequest, NextResponse } from 'next/server'
import { getTokensFromCode, storeTokens } from '@/lib/gmail'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')

  if (error) {
    return NextResponse.redirect(
      new URL('/settings?error=auth_failed', request.url)
    )
  }

  if (!code) {
    return NextResponse.redirect(
      new URL('/settings?error=no_code', request.url)
    )
  }

  try {
    const tokens = await getTokensFromCode(code)
    await storeTokens(tokens)
    return NextResponse.redirect(new URL('/settings?success=gmail_connected', request.url))
  } catch (err) {
    console.error('OAuth callback error:', err)
    return NextResponse.redirect(
      new URL('/settings?error=token_exchange_failed', request.url)
    )
  }
}

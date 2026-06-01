import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const settings = await prisma.settings.findMany()
    const result: Record<string, string> = {}
    for (const s of settings) {
      // Don't expose google tokens
      if (s.key === 'google_tokens') continue
      result[s.key] = s.value
    }
    return NextResponse.json(result)
  } catch (error) {
    console.error('GET /api/settings error:', error)
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    for (const [key, value] of Object.entries(body)) {
      if (key === 'google_tokens') continue // Protected key
      await prisma.settings.upsert({
        where: { key },
        update: { value: String(value) },
        create: { key, value: String(value) },
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('POST /api/settings error:', error)
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const key = searchParams.get('key')

  if (!key) {
    return NextResponse.json({ error: 'key is required' }, { status: 400 })
  }

  try {
    await prisma.settings.deleteMany({ where: { key } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/settings error:', error)
    return NextResponse.json({ error: 'Failed to delete setting' }, { status: 500 })
  }
}

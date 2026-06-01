import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')

    const where = status ? { status } : {}

    const prospects = await prisma.prospect.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(prospects)
  } catch (error) {
    console.error('GET /api/prospects error:', error)
    return NextResponse.json({ error: 'Failed to fetch prospects' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { companyName, websiteUrl, contactName, contactEmail, sector, notes } = body

    if (!companyName || !websiteUrl) {
      return NextResponse.json(
        { error: 'companyName and websiteUrl are required' },
        { status: 400 }
      )
    }

    const prospect = await prisma.prospect.create({
      data: {
        companyName,
        websiteUrl,
        contactName: contactName || null,
        contactEmail: contactEmail || null,
        sector: sector || null,
        notes: notes || null,
      },
    })

    return NextResponse.json(prospect, { status: 201 })
  } catch (error) {
    console.error('POST /api/prospects error:', error)
    return NextResponse.json({ error: 'Failed to create prospect' }, { status: 500 })
  }
}

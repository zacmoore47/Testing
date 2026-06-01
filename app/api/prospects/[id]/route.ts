import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id, 10)
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })
    }

    const prospect = await prisma.prospect.findUnique({ where: { id } })
    if (!prospect) {
      return NextResponse.json({ error: 'Prospect not found' }, { status: 404 })
    }

    return NextResponse.json(prospect)
  } catch (error) {
    console.error('GET /api/prospects/[id] error:', error)
    return NextResponse.json({ error: 'Failed to fetch prospect' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id, 10)
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })
    }

    const body = await request.json()
    const {
      companyName,
      websiteUrl,
      contactName,
      contactEmail,
      sector,
      status,
      notes,
      generatedSubject,
      generatedBody,
      followUpDate,
      sentAt,
      repliedAt,
      bookedAt,
      scrapedData,
    } = body

    const updateData: Record<string, unknown> = {}

    if (companyName !== undefined) updateData.companyName = companyName
    if (websiteUrl !== undefined) updateData.websiteUrl = websiteUrl
    if (contactName !== undefined) updateData.contactName = contactName
    if (contactEmail !== undefined) updateData.contactEmail = contactEmail
    if (sector !== undefined) updateData.sector = sector
    if (status !== undefined) updateData.status = status
    if (notes !== undefined) updateData.notes = notes
    if (generatedSubject !== undefined) updateData.generatedSubject = generatedSubject
    if (generatedBody !== undefined) updateData.generatedBody = generatedBody
    if (followUpDate !== undefined) updateData.followUpDate = followUpDate ? new Date(followUpDate) : null
    if (sentAt !== undefined) updateData.sentAt = sentAt ? new Date(sentAt) : null
    if (repliedAt !== undefined) updateData.repliedAt = repliedAt ? new Date(repliedAt) : null
    if (bookedAt !== undefined) updateData.bookedAt = bookedAt ? new Date(bookedAt) : null
    if (scrapedData !== undefined) updateData.scrapedData = scrapedData

    const prospect = await prisma.prospect.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json(prospect)
  } catch (error) {
    console.error('PATCH /api/prospects/[id] error:', error)
    return NextResponse.json({ error: 'Failed to update prospect' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const id = parseInt(params.id, 10)
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })
    }

    await prisma.prospect.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/prospects/[id] error:', error)
    return NextResponse.json({ error: 'Failed to delete prospect' }, { status: 500 })
  }
}

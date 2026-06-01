import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { scrapeWebsite, formatScrapedSummary } from '@/lib/scraper'
import { generateEmail } from '@/lib/claude'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { prospectId } = body

    if (!prospectId) {
      return NextResponse.json({ error: 'prospectId is required' }, { status: 400 })
    }

    const prospect = await prisma.prospect.findUnique({
      where: { id: prospectId },
    })

    if (!prospect) {
      return NextResponse.json({ error: 'Prospect not found' }, { status: 404 })
    }

    // Scrape website
    let scrapedData
    try {
      scrapedData = await scrapeWebsite(prospect.websiteUrl)
    } catch (scrapeError) {
      console.error('Scraping failed:', scrapeError)
      scrapedData = {
        businessName: prospect.companyName,
        description: '',
        products: [],
        teamMembers: [],
        location: '',
        chatbotDetected: false,
        chatbotType: null,
        rawText: '',
      }
    }

    // If chatbot detected, return early
    if (scrapedData.chatbotDetected) {
      await prisma.prospect.update({
        where: { id: prospectId },
        data: {
          scrapedData: JSON.stringify(scrapedData),
        },
      })

      return NextResponse.json({
        chatbotDetected: true,
        chatbotType: scrapedData.chatbotType,
      })
    }

    // Generate email via Claude
    const scrapedSummary = formatScrapedSummary(scrapedData)

    const senderSetting = await prisma.settings.findUnique({ where: { key: 'sender_name' } })
    const senderName = senderSetting?.value || undefined

    const emailResult = await generateEmail({
      contactName: prospect.contactName || 'there',
      companyName: prospect.companyName,
      sector: prospect.sector || 'Unknown',
      scrapedSummary,
      products: scrapedData.products.join(', ') || 'Not specified',
      teamMembers: scrapedData.teamMembers.join(', ') || 'Not found',
      location: scrapedData.location || 'Unknown',
      chatbotDetected: scrapedData.chatbotDetected,
      senderName,
    })

    // Save to prospect
    await prisma.prospect.update({
      where: { id: prospectId },
      data: {
        generatedSubject: emailResult.subject,
        generatedBody: emailResult.body,
        scrapedData: JSON.stringify(scrapedData),
        status: 'Email Draft',
      },
    })

    return NextResponse.json({
      subject: emailResult.subject,
      body: emailResult.body,
      chatbotDetected: false,
      scrapedData,
    })
  } catch (error) {
    console.error('POST /api/generate error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate email' },
      { status: 500 }
    )
  }
}

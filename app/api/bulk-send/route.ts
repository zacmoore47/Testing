import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { scrapeWebsite, formatScrapedSummary } from '@/lib/scraper'
import { generateEmail } from '@/lib/claude'
import { sendEmail, getStoredTokens } from '@/lib/gmail'

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { prospectIds } = body as { prospectIds: number[] }

    if (!prospectIds || prospectIds.length === 0) {
      return NextResponse.json({ error: 'No prospect IDs provided' }, { status: 400 })
    }

    const tokens = await getStoredTokens()
    if (!tokens) {
      return NextResponse.json(
        { error: 'Gmail not connected. Please go to Settings and connect your Gmail account.' },
        { status: 401 }
      )
    }

    const senderSetting = await prisma.settings.findUnique({ where: { key: 'sender_name' } })
    const senderName = senderSetting?.value || undefined

    const results: { id: number; status: 'sent' | 'skipped' | 'error'; reason?: string }[] = []

    for (const id of prospectIds) {
      try {
        const prospect = await prisma.prospect.findUnique({ where: { id } })
        if (!prospect) {
          results.push({ id, status: 'error', reason: 'Prospect not found' })
          continue
        }

        if (!prospect.contactEmail) {
          results.push({ id, status: 'skipped', reason: 'No contact email' })
          continue
        }

        if (prospect.status === 'Sent' || prospect.status === 'Replied' || prospect.status === 'Booked') {
          results.push({ id, status: 'skipped', reason: `Already ${prospect.status}` })
          continue
        }

        // Scrape if we don't have data yet
        let subject = prospect.generatedSubject
        let emailBody = prospect.generatedBody

        if (!subject || !emailBody) {
          let scrapedData
          try {
            scrapedData = await scrapeWebsite(prospect.websiteUrl)
          } catch {
            scrapedData = {
              businessName: prospect.companyName,
              description: '',
              products: [] as string[],
              teamMembers: [] as string[],
              location: '',
              chatbotDetected: false,
              chatbotType: null,
              rawText: '',
            }
          }

          if (scrapedData.chatbotDetected) {
            await prisma.prospect.update({
              where: { id },
              data: { scrapedData: JSON.stringify(scrapedData) },
            })
            results.push({ id, status: 'skipped', reason: 'Chatbot already detected on site' })
            await sleep(500)
            continue
          }

          const emailResult = await generateEmail({
            contactName: prospect.contactName || 'there',
            companyName: prospect.companyName,
            sector: prospect.sector || 'Unknown',
            scrapedSummary: formatScrapedSummary(scrapedData),
            products: scrapedData.products.join(', ') || 'Not specified',
            teamMembers: scrapedData.teamMembers.join(', ') || 'Not found',
            location: scrapedData.location || 'Unknown',
            chatbotDetected: false,
            senderName,
          })

          subject = emailResult.subject
          emailBody = emailResult.body

          await prisma.prospect.update({
            where: { id },
            data: {
              generatedSubject: subject,
              generatedBody: emailBody,
              scrapedData: JSON.stringify(scrapedData),
              status: 'Email Draft',
            },
          })
        }

        await sendEmail(prospect.contactEmail, subject!, emailBody!, tokens)

        await prisma.prospect.update({
          where: { id },
          data: {
            status: 'Sent',
            sentAt: new Date(),
          },
        })

        results.push({ id, status: 'sent' })

        // Rate limit: 1.5s between sends
        await sleep(1500)
      } catch (err) {
        results.push({
          id,
          status: 'error',
          reason: err instanceof Error ? err.message : 'Unknown error',
        })
      }
    }

    const sent = results.filter((r) => r.status === 'sent').length
    const skipped = results.filter((r) => r.status === 'skipped').length
    const errors = results.filter((r) => r.status === 'error').length

    return NextResponse.json({ results, summary: { sent, skipped, errors } })
  } catch (error) {
    console.error('POST /api/bulk-send error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Bulk send failed' },
      { status: 500 }
    )
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendEmail, getStoredTokens, getConnectedEmail } from '@/lib/gmail'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      prospectId,
      to,
      subject,
      body: emailBody,
      testMode,
    } = body as {
      prospectId: number
      to?: string
      subject: string
      body: string
      testMode?: boolean
    }

    if (!prospectId) {
      return NextResponse.json({ error: 'prospectId is required' }, { status: 400 })
    }

    if (!subject || !emailBody) {
      return NextResponse.json({ error: 'Subject and body are required' }, { status: 400 })
    }

    const tokens = await getStoredTokens()
    if (!tokens) {
      return NextResponse.json(
        { error: 'Gmail not connected. Please go to Settings and connect your Gmail account.' },
        { status: 401 }
      )
    }

    // For test mode, send to the connected email
    let recipientEmail = to
    if (testMode) {
      const connectedEmail = await getConnectedEmail()
      if (!connectedEmail) {
        return NextResponse.json({ error: 'Could not determine connected email' }, { status: 400 })
      }
      recipientEmail = connectedEmail
    }

    if (!recipientEmail) {
      return NextResponse.json({ error: 'No recipient email address' }, { status: 400 })
    }

    await sendEmail(recipientEmail, subject, emailBody, tokens)

    if (!testMode) {
      // Update prospect status
      await prisma.prospect.update({
        where: { id: prospectId },
        data: {
          status: 'Sent',
          sentAt: new Date(),
          generatedSubject: subject,
          generatedBody: emailBody,
        },
      })
    }

    return NextResponse.json({ success: true, sentTo: recipientEmail })
  } catch (error) {
    console.error('POST /api/send error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send email' },
      { status: 500 }
    )
  }
}

import Anthropic from '@anthropic-ai/sdk'

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set')
  }
  return new Anthropic({ apiKey })
}

export interface EmailResult {
  subject: string
  body: string
}

export interface ProspectEmailData {
  contactName: string
  companyName: string
  sector: string
  scrapedSummary: string
  products: string
  teamMembers: string
  location: string
  chatbotDetected: boolean
}

const SYSTEM_PROMPT = `You are an expert cold email copywriter helping a founder sell an AI customer service chatbot to small UK businesses.

The product: an AI chatbot that embeds into any website via a simple script tag. It answers common customer questions 24/7, captures leads, and escalates unanswered queries to the owner by email. Setup takes 15 minutes. Pricing starts at £49/month with a free 14-day trial, no credit card required.

Your job: write a short, personalised cold outreach email to the business owner. The email must:
- Open with a genuine, specific compliment about their business (use the scraped details — name a real product, brand, feature or detail you found)
- Identify a specific pain point they likely have based on their sector and what you found on their site (e.g. repetitive support queries, after-hours enquiries, product questions killing conversions)
- Briefly explain how the chatbot solves that specific pain point
- End with a single low-friction CTA: offer a free 2-week trial, no commitment
- Be under 200 words
- Sound human, warm, and conversational — not like a template
- Never use hollow phrases like "I hope this email finds you well" or "I wanted to reach out"
- Address the contact by first name

Subject line: use "A quick question about your website" unless you can think of something more specific and compelling based on what you found.

Return ONLY valid JSON in this exact format, nothing else:
{
  "subject": "...",
  "body": "..."
}`

export async function generateEmail(data: ProspectEmailData): Promise<EmailResult> {
  const client = getClient()

  const userMessage = `Contact name: ${data.contactName || 'there'}
Company: ${data.companyName}
Sector: ${data.sector || 'Unknown'}
Website content summary: ${data.scrapedSummary || 'Not available'}
Products/services found: ${data.products || 'Not specified'}
Team members found: ${data.teamMembers || 'Not found'}
Location: ${data.location || 'Unknown'}
Chatbot already present: ${data.chatbotDetected ? 'Yes' : 'No'}`

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: userMessage,
      },
    ],
  })

  const content = message.content[0]
  if (content.type !== 'text') {
    throw new Error('Unexpected response type from Claude')
  }

  // Parse JSON response
  let result: EmailResult
  try {
    // Strip any markdown code blocks if present
    const jsonText = content.text.replace(/```json\n?|\n?```/g, '').trim()
    result = JSON.parse(jsonText)
  } catch {
    throw new Error(`Failed to parse Claude response as JSON: ${content.text}`)
  }

  if (!result.subject || !result.body) {
    throw new Error('Claude response missing subject or body fields')
  }

  return result
}

export async function generateFollowUp(
  originalEmail: string,
  prospectName: string,
  companyName: string
): Promise<EmailResult> {
  const client = getClient()

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: `You are an expert cold email copywriter. Write a brief, friendly follow-up email to a prospect who hasn't responded to the original outreach.

The follow-up should:
- Be very short (under 100 words)
- Reference the original email without copying it
- Add a tiny bit of new value or urgency
- Have a simple CTA
- Sound human and not pushy
- Address the contact by first name

Return ONLY valid JSON in this exact format, nothing else:
{
  "subject": "...",
  "body": "..."
}`,
    messages: [
      {
        role: 'user',
        content: `Original email sent to ${prospectName || 'the prospect'} at ${companyName}:

${originalEmail}

Write a follow-up email for this prospect.`,
      },
    ],
  })

  const content = message.content[0]
  if (content.type !== 'text') {
    throw new Error('Unexpected response type from Claude')
  }

  let result: EmailResult
  try {
    const jsonText = content.text.replace(/```json\n?|\n?```/g, '').trim()
    result = JSON.parse(jsonText)
  } catch {
    throw new Error(`Failed to parse Claude response as JSON: ${content.text}`)
  }

  return result
}

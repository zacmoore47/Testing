import { google } from 'googleapis'
import { prisma } from './prisma'

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
]

function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/google/callback'
  )
}

export function getAuthUrl(): string {
  const oauth2Client = getOAuth2Client()
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  })
}

export async function getTokensFromCode(code: string) {
  const oauth2Client = getOAuth2Client()
  const { tokens } = await oauth2Client.getToken(code)
  return tokens
}

export async function storeTokens(tokens: object) {
  await prisma.settings.upsert({
    where: { key: 'google_tokens' },
    update: { value: JSON.stringify(tokens) },
    create: { key: 'google_tokens', value: JSON.stringify(tokens) },
  })
}

export async function getStoredTokens() {
  const setting = await prisma.settings.findUnique({
    where: { key: 'google_tokens' },
  })
  if (!setting) return null
  try {
    return JSON.parse(setting.value)
  } catch {
    return null
  }
}

export async function getConnectedEmail(): Promise<string | null> {
  const tokens = await getStoredTokens()
  if (!tokens) return null

  try {
    const oauth2Client = getOAuth2Client()
    oauth2Client.setCredentials(tokens)
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client })
    const { data } = await oauth2.userinfo.get()
    return data.email || null
  } catch {
    return null
  }
}

export async function disconnectGmail() {
  await prisma.settings.deleteMany({
    where: { key: 'google_tokens' },
  })
}

function bodyToHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')
}

function makeEmail(to: string, subject: string, body: string, fromName?: string): string {
  const fromHeader = fromName ? `${fromName} <me>` : 'me'
  const htmlBody = bodyToHtml(body)

  const emailLines = [
    `From: ${fromHeader}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: multipart/alternative; boundary="boundary"',
    '',
    '--boundary',
    'Content-Type: text/plain; charset=UTF-8',
    '',
    body,
    '',
    '--boundary',
    'Content-Type: text/html; charset=UTF-8',
    '',
    `<html><body>${htmlBody}</body></html>`,
    '',
    '--boundary--',
  ]

  return emailLines.join('\r\n')
}

export async function sendEmail(
  to: string,
  subject: string,
  body: string,
  tokens?: object
): Promise<{ messageId: string }> {
  const storedTokens = tokens || (await getStoredTokens())
  if (!storedTokens) {
    throw new Error('Gmail not connected. Please authenticate first.')
  }

  const oauth2Client = getOAuth2Client()
  oauth2Client.setCredentials(storedTokens as Parameters<typeof oauth2Client.setCredentials>[0])

  // Refresh token if needed
  const tokenInfo = storedTokens as { expiry_date?: number; refresh_token?: string }
  if (tokenInfo.expiry_date && tokenInfo.expiry_date < Date.now() && tokenInfo.refresh_token) {
    const { credentials } = await oauth2Client.refreshAccessToken()
    await storeTokens(credentials)
    oauth2Client.setCredentials(credentials)
  }

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

  const senderName = process.env.SENDER_NAME
  const rawEmail = makeEmail(to, subject, body, senderName)
  const encodedEmail = Buffer.from(rawEmail)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  const response = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: encodedEmail,
    },
  })

  return { messageId: response.data.id || '' }
}

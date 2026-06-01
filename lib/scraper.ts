import axios from 'axios'
import * as cheerio from 'cheerio'

export interface ScrapedData {
  businessName: string
  description: string
  products: string[]
  teamMembers: string[]
  location: string
  chatbotDetected: boolean
  chatbotType: string | null
  rawText: string
}

const CHATBOT_SIGNATURES = [
  { pattern: /intercom/i, name: 'Intercom' },
  { pattern: /tidio/i, name: 'Tidio' },
  { pattern: /drift/i, name: 'Drift' },
  { pattern: /tawk/i, name: 'Tawk.to' },
  { pattern: /zopim|zendesk/i, name: 'Zendesk Chat' },
  { pattern: /crisp/i, name: 'Crisp' },
  { pattern: /hubspot.*chat|hschat/i, name: 'HubSpot Chat' },
  { pattern: /freshchat/i, name: 'Freshchat' },
  { pattern: /livechat/i, name: 'LiveChat' },
  { pattern: /olark/i, name: 'Olark' },
]

export async function scrapeWebsite(url: string): Promise<ScrapedData> {
  const result: ScrapedData = {
    businessName: '',
    description: '',
    products: [],
    teamMembers: [],
    location: '',
    chatbotDetected: false,
    chatbotType: null,
    rawText: '',
  }

  try {
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-GB,en;q=0.5',
      },
    })

    const html = response.data as string
    const $ = cheerio.load(html)

    // Detect chatbots in script tags and divs
    const scriptContent = $('script').map((_, el) => $(el).html() || '').get().join(' ')
    const scriptSrcs = $('script[src]').map((_, el) => $(el).attr('src') || '').get().join(' ')
    const allContent = html + scriptContent + scriptSrcs

    for (const sig of CHATBOT_SIGNATURES) {
      if (sig.pattern.test(allContent)) {
        result.chatbotDetected = true
        result.chatbotType = sig.name
        break
      }
    }

    // Extract business name from title or og:title
    const ogTitle = $('meta[property="og:title"]').attr('content')
    const title = $('title').text().trim()
    result.businessName = ogTitle || title.split(/[-|]/)[0].trim() || ''

    // Extract description
    const ogDesc = $('meta[property="og:description"]').attr('content')
    const metaDesc = $('meta[name="description"]').attr('content')
    result.description = ogDesc || metaDesc || ''

    // Remove non-content elements
    $('script, style, nav, footer, header, .cookie-banner, #cookie, [class*="cookie"]').remove()

    // Extract raw text
    const bodyText = $('body').text().replace(/\s+/g, ' ').trim()
    result.rawText = bodyText.substring(0, 3000)

    // Extract products/services - look for common patterns
    const products: string[] = []
    $('h1, h2, h3').each((_, el) => {
      const text = $(el).text().trim()
      if (
        text.length > 3 &&
        text.length < 100 &&
        /product|service|offer|solution|package|plan|feature/i.test(
          $(el).closest('section, div').text()
        )
      ) {
        products.push(text)
      }
    })

    // Also check list items in potential product/service sections
    $('[class*="product"], [class*="service"], [class*="offer"], [id*="product"], [id*="service"]').each(
      (_, el) => {
        $(el).find('h2, h3, h4, li').each((_, item) => {
          const text = $(item).text().trim()
          if (text.length > 3 && text.length < 100) {
            products.push(text)
          }
        })
      }
    )

    result.products = Array.from(new Set(products)).slice(0, 10)

    // Extract team members - look for common patterns
    const teamMembers: string[] = []
    $('[class*="team"], [class*="staff"], [class*="people"], [id*="team"]').each((_, el) => {
      $(el).find('h2, h3, h4, p, span').each((_, item) => {
        const text = $(item).text().trim()
        // Look for names (2-3 words, each capitalised)
        if (/^[A-Z][a-z]+ [A-Z][a-z]+/.test(text) && text.split(' ').length <= 4) {
          teamMembers.push(text)
        }
      })
    })

    result.teamMembers = Array.from(new Set(teamMembers)).slice(0, 5)

    // Extract location
    const addressSelectors = [
      '[class*="address"]',
      '[itemtype*="PostalAddress"]',
      'address',
      '[class*="location"]',
      '[class*="contact"]',
    ]

    for (const sel of addressSelectors) {
      const text = $(sel).first().text().replace(/\s+/g, ' ').trim()
      if (text && text.length > 5 && text.length < 200) {
        result.location = text
        break
      }
    }

    // Fallback: look for UK postcodes
    if (!result.location) {
      const postcodeMatch = bodyText.match(
        /[A-Z]{1,2}[0-9][0-9A-Z]?\s*[0-9][A-Z]{2}/i
      )
      if (postcodeMatch) {
        const idx = bodyText.indexOf(postcodeMatch[0])
        result.location = bodyText.substring(Math.max(0, idx - 50), idx + 20).trim()
      }
    }
  } catch (error) {
    // Return what we have on error - the page may be JS-rendered
    console.error('Scraper error:', error instanceof Error ? error.message : error)
  }

  return result
}

export function formatScrapedSummary(data: ScrapedData): string {
  const parts: string[] = []

  if (data.businessName) parts.push(`Business: ${data.businessName}`)
  if (data.description) parts.push(`Description: ${data.description}`)
  if (data.products.length > 0) parts.push(`Products/services: ${data.products.slice(0, 5).join(', ')}`)
  if (data.teamMembers.length > 0) parts.push(`Team: ${data.teamMembers.join(', ')}`)
  if (data.location) parts.push(`Location: ${data.location}`)
  if (data.chatbotDetected) parts.push(`Chatbot detected: ${data.chatbotType}`)

  if (parts.length === 0 && data.rawText) {
    parts.push(`Website content: ${data.rawText.substring(0, 500)}`)
  }

  return parts.join('\n')
}

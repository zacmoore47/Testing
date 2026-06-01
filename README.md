# AI Cold Outreach Tool

A full-stack Next.js 14 application for AI-powered cold email outreach. Maintains a CRM prospect list, scrapes company websites, generates personalised cold emails via Claude, and sends them via Gmail.

## Features

- **CRM Dashboard** — manage prospects with statuses, follow-up dates, and analytics
- **Website Scraping** — automatically scrapes company websites to extract business info, products, team members, and location using Cheerio
- **Chatbot Detection** — skips prospects already using Intercom, Drift, Tidio, Tawk.to, Zendesk, Crisp, or HubSpot Chat
- **AI Email Generation** — creates highly personalised cold emails using Claude (`claude-sonnet-4-20250514`)
- **Gmail Integration** — sends emails via Gmail OAuth2
- **CSV Import** — bulk import prospects from CSV
- **Analytics** — tracks sent, replies, booked meetings, and conversion rate

## Tech Stack

- **Next.js 14** App Router + TypeScript
- **Tailwind CSS** + custom shadcn/ui components
- **SQLite** via Prisma 7 + libsql adapter
- **Anthropic Claude API**
- **Gmail API** via OAuth2
- **Cheerio** for website scraping

## Setup

### 1. Clone and install dependencies

```bash
git clone <repo>
cd <repo>
npm install
```

### 2. Configure environment variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

```env
ANTHROPIC_API_KEY=sk-ant-...          # From console.anthropic.com
GOOGLE_CLIENT_ID=...                   # From Google Cloud Console
GOOGLE_CLIENT_SECRET=...               # From Google Cloud Console
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
DATABASE_URL=file:./outreach.db
SENDER_NAME=Your Name
SENDER_WEBSITE=https://yoursite.com
SENDER_PHONE=+44 7700 900000
```

### 3. Set up Google OAuth2

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project (or use an existing one)
3. Enable the **Gmail API**
4. Go to **APIs & Services > Credentials**
5. Create an **OAuth 2.0 Client ID** (Web application type)
6. Add `http://localhost:3000/api/auth/google/callback` as an Authorised redirect URI
7. Copy the Client ID and Secret into your `.env`

### 4. Set up the database

```bash
npx prisma migrate dev --name init
```

### 5. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 6. Connect Gmail

1. Go to the **Settings** page at `/settings`
2. Click **Connect Gmail Account**
3. Authorise the app in Google's OAuth flow
4. You'll be redirected back to Settings with a success message

## Usage

### Adding Prospects

**Manually:**
1. Click **Add Prospect** on the dashboard
2. Fill in the company name, website URL, contact details, and sector

**Via CSV import:**
1. Prepare a CSV with columns: `company_name`, `website_url`, `contact_name`, `contact_email`, `sector`, `notes`
2. Click **Import CSV** and select your file

### Generating Emails

1. Click the lightning bolt icon next to any prospect, or
2. Open the prospect detail page and click **Generate**

The tool will:
- Scrape the company website
- Check for existing chatbots (if detected, you'll be warned)
- Call Claude to write a personalised email
- Save the draft to the prospect

### Sending Emails

1. Open the prospect detail page
2. Review and edit the generated subject and body
3. Click **Send to Prospect** to send to the contact's email, or
4. Click **Send Test to Me** to send a test to your own Gmail address

### Follow-ups

- Set a **Follow-up Date** on any prospect
- Rows with overdue follow-ups (status not Replied/Booked) are highlighted in orange on the dashboard

## Project Structure

```
app/
  page.tsx                        Dashboard
  prospect/[id]/page.tsx          Prospect detail + email editor
  settings/page.tsx               Settings
  api/
    prospects/route.ts            CRUD for prospects list
    prospects/[id]/route.ts       Single prospect CRUD
    generate/route.ts             Scrape + Claude generation
    send/route.ts                 Gmail send
    auth/google/route.ts          OAuth initiation
    auth/google/callback/route.ts OAuth callback
    auth/google/status/route.ts   Gmail connection status
    settings/route.ts             Settings CRUD
components/
  ProspectTable.tsx               Main data table
  AddProspectModal.tsx            Add prospect modal
  EmailEditor.tsx                 Email draft + send UI
  StatusBadge.tsx                 Color-coded status badges
  AnalyticsBar.tsx                Top-level analytics cards
  CSVImport.tsx                   CSV file import
  ui/                             shadcn/ui-style components
lib/
  prisma.ts                       Prisma client singleton
  claude.ts                       Anthropic API wrapper
  gmail.ts                        Gmail OAuth2 wrapper
  scraper.ts                      Cheerio website scraper
prisma/
  schema.prisma                   Database schema
```

## CSV Format

```csv
company_name,website_url,contact_name,contact_email,sector,notes
Acme Ltd,https://acme.co.uk,Jane Smith,jane@acme.co.uk,Retail,Found via LinkedIn
```

## Development Notes

- The Prisma client uses the `@prisma/adapter-libsql` driver adapter (required for Prisma 7)
- Gmail tokens are stored in the `Settings` table under key `google_tokens`
- All other settings (API keys, sender details) are also stored in the `Settings` table
- The scraper sets a browser-like `User-Agent` and has a 10-second timeout
- Chatbot detection checks for: Intercom, Tidio, Drift, Tawk.to, Zendesk Chat, Crisp, HubSpot Chat, Freshchat, LiveChat, Olark

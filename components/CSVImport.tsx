'use client'

import { useRef, useState } from 'react'
import Papa from 'papaparse'
import { Button } from '@/components/ui/button'
import { Upload } from 'lucide-react'

interface CSVImportProps {
  onImported: () => void
}

interface CSVRow {
  company_name?: string
  website_url?: string
  contact_name?: string
  contact_email?: string
  sector?: string
  notes?: string
}

export function CSVImport({ onImported }: CSVImportProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setImporting(true)
    setResult(null)

    Papa.parse<CSVRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const rows = results.data

        if (rows.length === 0) {
          setResult('No rows found in CSV')
          setImporting(false)
          return
        }

        let success = 0
        let failed = 0

        for (const row of rows) {
          if (!row.company_name || !row.website_url) {
            failed++
            continue
          }

          try {
            const res = await fetch('/api/prospects', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                companyName: row.company_name,
                websiteUrl: row.website_url,
                contactName: row.contact_name || null,
                contactEmail: row.contact_email || null,
                sector: row.sector || null,
                notes: row.notes || null,
              }),
            })

            if (res.ok) {
              success++
            } else {
              failed++
            }

            // Rate limit: small delay between requests
            await new Promise((r) => setTimeout(r, 100))
          } catch {
            failed++
          }
        }

        setResult(`Imported ${success} prospects. ${failed > 0 ? `${failed} failed.` : ''}`)
        setImporting(false)
        onImported()

        // Reset file input
        if (fileRef.current) fileRef.current.value = ''
      },
      error: (err) => {
        setResult(`CSV parse error: ${err.message}`)
        setImporting(false)
      },
    })
  }

  return (
    <div className="flex items-center gap-2">
      <input
        ref={fileRef}
        type="file"
        accept=".csv"
        onChange={handleFile}
        className="hidden"
        id="csv-upload"
      />
      <label htmlFor="csv-upload">
        <Button
          variant="outline"
          size="sm"
          disabled={importing}
          onClick={() => fileRef.current?.click()}
          type="button"
        >
          <Upload className="mr-2 h-4 w-4" />
          {importing ? 'Importing...' : 'Import CSV'}
        </Button>
      </label>
      {result && (
        <span className="text-xs text-muted-foreground">{result}</span>
      )}
    </div>
  )
}

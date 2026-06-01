'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { EmailEditor } from '@/components/EmailEditor'
import { StatusBadge } from '@/components/StatusBadge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft, ExternalLink, RefreshCw } from 'lucide-react'
import { format } from 'date-fns'

interface Prospect {
  id: number
  companyName: string
  websiteUrl: string
  contactName: string | null
  contactEmail: string | null
  sector: string | null
  status: string
  notes: string | null
  generatedSubject: string | null
  generatedBody: string | null
  sentAt: string | null
  followUpDate: string | null
  scrapedData: string | null
  createdAt: string
  updatedAt: string
}

export default function ProspectDetailPage() {
  const params = useParams()
  const [prospect, setProspect] = useState<Prospect | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function fetchProspect() {
    try {
      const res = await fetch(`/api/prospects/${params.id}`)
      if (!res.ok) {
        if (res.status === 404) {
          setError('Prospect not found')
        } else {
          throw new Error('Failed to fetch')
        }
        return
      }
      const data = await res.json()
      setProspect(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load prospect')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProspect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id])

  function handleUpdate(updates: Partial<Prospect>) {
    setProspect((prev) => prev ? { ...prev, ...updates } : prev)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
        Loading prospect...
      </div>
    )
  }

  if (error || !prospect) {
    return (
      <div className="space-y-4">
        <Link href="/">
          <Button variant="outline" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Button>
        </Link>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error || 'Prospect not found'}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button variant="outline" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900">{prospect.companyName}</h1>
              <StatusBadge status={prospect.status} />
            </div>
            <a
              href={prospect.websiteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
            >
              {prospect.websiteUrl}
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_350px]">
        <EmailEditor prospect={prospect} onUpdate={handleUpdate} />

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Contact Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Name</span>
                <span>{prospect.contactName || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Email</span>
                <span className="text-right">{prospect.contactEmail || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Sector</span>
                <span>{prospect.sector || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Added</span>
                <span>{format(new Date(prospect.createdAt), 'dd MMM yyyy')}</span>
              </div>
              {prospect.sentAt && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Sent</span>
                  <span>{format(new Date(prospect.sentAt), 'dd MMM yyyy')}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {prospect.scrapedData && (() => {
            try {
              const data = JSON.parse(prospect.scrapedData)
              return (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Scraped Data</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-xs">
                    {data.description && (
                      <div>
                        <p className="font-medium text-muted-foreground mb-1">Description</p>
                        <p className="text-gray-700 line-clamp-3">{data.description}</p>
                      </div>
                    )}
                    {data.products && data.products.length > 0 && (
                      <div>
                        <p className="font-medium text-muted-foreground mb-1">Products/Services</p>
                        <ul className="list-disc list-inside space-y-0.5 text-gray-700">
                          {data.products.slice(0, 5).map((p: string, i: number) => (
                            <li key={i}>{p}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {data.location && (
                      <div>
                        <p className="font-medium text-muted-foreground mb-1">Location</p>
                        <p className="text-gray-700">{data.location}</p>
                      </div>
                    )}
                    {data.chatbotDetected && (
                      <div className="rounded-md bg-orange-50 border border-orange-200 p-2 text-orange-700">
                        Chatbot detected: {data.chatbotType}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            } catch {
              return null
            }
          })()}
        </div>
      </div>
    </div>
  )
}

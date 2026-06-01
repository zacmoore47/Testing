'use client'

import { useState, useEffect, useCallback } from 'react'
import { AnalyticsBar } from '@/components/AnalyticsBar'
import { ProspectTable } from '@/components/ProspectTable'
import { AddProspectModal } from '@/components/AddProspectModal'
import { CSVImport } from '@/components/CSVImport'
import { Button } from '@/components/ui/button'
import { Plus, RefreshCw, SendHorizonal } from 'lucide-react'

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
  createdAt: string
}

export default function DashboardPage() {
  const [prospects, setProspects] = useState<Prospect[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [bulkSending, setBulkSending] = useState(false)

  const fetchProspects = useCallback(async () => {
    try {
      const url = filterStatus
        ? `/api/prospects?status=${encodeURIComponent(filterStatus)}`
        : '/api/prospects'
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        setProspects(data)
      }
    } catch (err) {
      console.error('Failed to fetch prospects:', err)
    } finally {
      setLoading(false)
    }
  }, [filterStatus])

  useEffect(() => {
    fetchProspects()
  }, [fetchProspects])

  const analytics = {
    total: prospects.length,
    sent: prospects.filter((p) => ['Sent', 'Replied', 'Booked'].includes(p.status)).length,
    replies: prospects.filter((p) => ['Replied', 'Booked'].includes(p.status)).length,
    booked: prospects.filter((p) => p.status === 'Booked').length,
  }

  const STATUS_FILTERS = ['', 'New', 'Email Draft', 'Sent', 'Replied', 'Booked', 'Not Interested']

  async function handleBulkSend() {
    const eligible = prospects.filter(
      (p) => p.contactEmail && !['Sent', 'Replied', 'Booked'].includes(p.status)
    )
    if (eligible.length === 0) {
      alert('No eligible prospects to send to (need contact email, not already sent).')
      return
    }
    if (!confirm(`Generate and send emails to ${eligible.length} prospects? This cannot be undone.`)) return

    setBulkSending(true)
    try {
      const res = await fetch('/api/bulk-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospectIds: eligible.map((p) => p.id) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Bulk send failed')
      const { summary } = data
      alert(`Done! Sent: ${summary.sent} | Skipped: ${summary.skipped} | Errors: ${summary.errors}`)
      fetchProspects()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Bulk send failed')
    } finally {
      setBulkSending(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Manage your cold outreach prospects</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchProspects}
            disabled={loading}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <CSVImport onImported={fetchProspects} />
          <Button
            size="sm"
            variant="outline"
            onClick={handleBulkSend}
            disabled={bulkSending}
            className="text-blue-600 border-blue-300 hover:bg-blue-50"
          >
            <SendHorizonal className={`mr-2 h-4 w-4 ${bulkSending ? 'animate-pulse' : ''}`} />
            {bulkSending ? 'Sending...' : 'Generate & Send All'}
          </Button>
          <Button size="sm" onClick={() => setShowAddModal(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Prospect
          </Button>
        </div>
      </div>

      <AnalyticsBar
        total={analytics.total}
        sent={analytics.sent}
        replies={analytics.replies}
        booked={analytics.booked}
      />

      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Filter by status:</span>
        {STATUS_FILTERS.map((s) => (
          <button
            key={s || 'all'}
            onClick={() => setFilterStatus(s)}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              filterStatus === s
                ? 'bg-primary text-primary-foreground'
                : 'bg-white text-gray-600 border hover:bg-gray-50'
            }`}
          >
            {s || 'All'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
          Loading prospects...
        </div>
      ) : (
        <ProspectTable prospects={prospects} onRefresh={fetchProspects} />
      )}

      <AddProspectModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onCreated={fetchProspects}
      />
    </div>
  )
}

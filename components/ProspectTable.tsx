'use client'

import { useState } from 'react'
import Link from 'next/link'
import { format, isPast } from 'date-fns'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { StatusBadge } from './StatusBadge'
import { Eye, Trash2, Zap, Send, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'

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

interface ProspectTableProps {
  prospects: Prospect[]
  onRefresh: () => void
}

export function ProspectTable({ prospects, onRefresh }: ProspectTableProps) {
  const [generatingId, setGeneratingId] = useState<number | null>(null)
  const [sendingId, setSendingId] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  async function handleGenerate(id: number) {
    setGeneratingId(id)
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospectId: id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to generate')
      if (data.chatbotDetected) {
        alert('Chatbot already detected on this website — skipping.')
      } else {
        alert('Email generated successfully!')
      }
      onRefresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to generate email')
    } finally {
      setGeneratingId(null)
    }
  }

  async function handleSend(prospect: Prospect) {
    if (!prospect.generatedBody || !prospect.generatedSubject) {
      alert('Please generate an email first')
      return
    }
    if (!prospect.contactEmail) {
      alert('No contact email set')
      return
    }

    if (!confirm(`Send email to ${prospect.contactEmail}?`)) return

    setSendingId(prospect.id)
    try {
      const res = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prospectId: prospect.id,
          to: prospect.contactEmail,
          subject: prospect.generatedSubject,
          body: prospect.generatedBody,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to send')
      alert('Email sent successfully!')
      onRefresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to send email')
    } finally {
      setSendingId(null)
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this prospect?')) return
    setDeletingId(id)
    try {
      const res = await fetch(`/api/prospects/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete')
      onRefresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setDeletingId(null)
    }
  }

  if (prospects.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        No prospects yet. Add your first prospect or import a CSV.
      </div>
    )
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Company</TableHead>
            <TableHead>Contact</TableHead>
            <TableHead>Sector</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Added</TableHead>
            <TableHead>Sent</TableHead>
            <TableHead>Follow-up</TableHead>
            <TableHead>Notes</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {prospects.map((p) => {
            const followUpPast =
              p.followUpDate &&
              isPast(new Date(p.followUpDate)) &&
              p.status !== 'Replied' &&
              p.status !== 'Booked'

            return (
              <TableRow
                key={p.id}
                className={cn(followUpPast && 'bg-orange-50 hover:bg-orange-100')}
              >
                <TableCell>
                  <div className="font-medium">{p.companyName}</div>
                  <a
                    href={p.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
                  >
                    {p.websiteUrl.replace(/^https?:\/\//, '').slice(0, 30)}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </TableCell>
                <TableCell>
                  <div className="text-sm">{p.contactName || '—'}</div>
                  <div className="text-xs text-muted-foreground">{p.contactEmail || '—'}</div>
                </TableCell>
                <TableCell>
                  <span className="text-sm">{p.sector || '—'}</span>
                </TableCell>
                <TableCell>
                  <StatusBadge status={p.status} />
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {format(new Date(p.createdAt), 'dd MMM yy')}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {p.sentAt ? format(new Date(p.sentAt), 'dd MMM yy') : '—'}
                </TableCell>
                <TableCell className="text-xs">
                  {p.followUpDate ? (
                    <span className={cn(followUpPast && 'font-medium text-orange-600')}>
                      {format(new Date(p.followUpDate), 'dd MMM yy')}
                    </span>
                  ) : (
                    '—'
                  )}
                </TableCell>
                <TableCell className="max-w-[150px]">
                  <p className="truncate text-xs text-muted-foreground">{p.notes || '—'}</p>
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs"
                      onClick={() => handleGenerate(p.id)}
                      disabled={generatingId === p.id}
                      title="Generate email"
                    >
                      <Zap className="h-3 w-3" />
                    </Button>
                    <Link href={`/prospect/${p.id}`}>
                      <Button size="sm" variant="outline" className="h-7 px-2 text-xs" title="View/Edit">
                        <Eye className="h-3 w-3" />
                      </Button>
                    </Link>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs"
                      onClick={() => handleSend(p)}
                      disabled={sendingId === p.id || !p.generatedBody}
                      title="Send email"
                    >
                      <Send className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs text-red-500 hover:text-red-600"
                      onClick={() => handleDelete(p.id)}
                      disabled={deletingId === p.id}
                      title="Delete"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

interface AddProspectModalProps {
  open: boolean
  onClose: () => void
  onCreated: () => void
}

const SECTOR_OPTIONS = [
  'Retail',
  'Restaurant / Food',
  'Healthcare',
  'Legal',
  'Accountancy',
  'Real Estate',
  'Fitness / Wellness',
  'Beauty / Hair',
  'Automotive',
  'Education',
  'Construction / Trades',
  'Technology',
  'Hospitality',
  'Professional Services',
  'Other',
]

export function AddProspectModal({ open, onClose, onCreated }: AddProspectModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    companyName: '',
    websiteUrl: '',
    contactName: '',
    contactEmail: '',
    sector: '',
    notes: '',
  })

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!form.companyName || !form.websiteUrl) {
      setError('Company name and website URL are required')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/prospects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create prospect')
      }

      setForm({
        companyName: '',
        websiteUrl: '',
        contactName: '',
        contactEmail: '',
        sector: '',
        notes: '',
      })
      onCreated()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create prospect')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Prospect</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1">
              <Label htmlFor="companyName">Company Name *</Label>
              <Input
                id="companyName"
                name="companyName"
                value={form.companyName}
                onChange={handleChange}
                placeholder="Acme Ltd"
                required
              />
            </div>
            <div className="col-span-2 space-y-1">
              <Label htmlFor="websiteUrl">Website URL *</Label>
              <Input
                id="websiteUrl"
                name="websiteUrl"
                value={form.websiteUrl}
                onChange={handleChange}
                placeholder="https://example.com"
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="contactName">Contact Name</Label>
              <Input
                id="contactName"
                name="contactName"
                value={form.contactName}
                onChange={handleChange}
                placeholder="John Smith"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="contactEmail">Contact Email</Label>
              <Input
                id="contactEmail"
                name="contactEmail"
                type="email"
                value={form.contactEmail}
                onChange={handleChange}
                placeholder="john@example.com"
              />
            </div>
            <div className="col-span-2 space-y-1">
              <Label htmlFor="sector">Sector</Label>
              <select
                id="sector"
                name="sector"
                value={form.sector}
                onChange={handleChange}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Select sector...</option>
                {SECTOR_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-2 space-y-1">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                name="notes"
                value={form.notes}
                onChange={handleChange}
                placeholder="Any additional notes..."
                rows={3}
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Adding...' : 'Add Prospect'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

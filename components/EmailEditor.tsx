'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { STATUS_OPTIONS } from './StatusBadge'
import { useToast } from '@/components/ui/toast'
import { Zap, Send, RefreshCw, AlertTriangle, TestTube } from 'lucide-react'

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
}

interface EmailEditorProps {
  prospect: Prospect
  onUpdate: (updates: Partial<Prospect>) => void
}

export function EmailEditor({ prospect, onUpdate }: EmailEditorProps) {
  const [subject, setSubject] = useState(prospect.generatedSubject || '')
  const [body, setBody] = useState(prospect.generatedBody || '')
  const [status, setStatus] = useState(prospect.status)
  const [notes, setNotes] = useState(prospect.notes || '')
  const [followUpDate, setFollowUpDate] = useState(
    prospect.followUpDate ? prospect.followUpDate.split('T')[0] : ''
  )
  const [generating, setGenerating] = useState(false)
  const [sending, setSending] = useState(false)
  const [chatbotDetected, setChatbotDetected] = useState(false)
  const [saving, setSaving] = useState(false)
  const { toast, ToastContainer } = useToast()

  const wordCount = body.trim() ? body.trim().split(/\s+/).length : 0

  async function handleGenerate() {
    setGenerating(true)
    setChatbotDetected(false)
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prospectId: prospect.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to generate')

      if (data.chatbotDetected) {
        setChatbotDetected(true)
        toast({ message: 'Chatbot already detected on their website', type: 'info' })
      } else {
        setSubject(data.subject || '')
        setBody(data.body || '')
        onUpdate({ generatedSubject: data.subject, generatedBody: data.body, status: 'Email Draft' })
        setStatus('Email Draft')
        toast({ message: 'Email generated successfully!', type: 'success' })
      }
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : 'Failed to generate', type: 'error' })
    } finally {
      setGenerating(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch(`/api/prospects/${prospect.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          generatedSubject: subject,
          generatedBody: body,
          status,
          notes,
          followUpDate: followUpDate ? new Date(followUpDate).toISOString() : null,
        }),
      })
      if (!res.ok) throw new Error('Failed to save')
      onUpdate({ generatedSubject: subject, generatedBody: body, status, notes })
      toast({ message: 'Saved!', type: 'success' })
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : 'Failed to save', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  async function handleSend(testMode = false) {
    const to = testMode ? null : prospect.contactEmail
    if (!testMode && !to) {
      toast({ message: 'No contact email set', type: 'error' })
      return
    }

    setSending(true)
    try {
      const res = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prospectId: prospect.id,
          to: to,
          subject,
          body,
          testMode,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to send')

      if (!testMode) {
        setStatus('Sent')
        onUpdate({ status: 'Sent', sentAt: new Date().toISOString() })
      }
      toast({ message: testMode ? 'Test email sent to yourself!' : 'Email sent!', type: 'success' })
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : 'Failed to send', type: 'error' })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-4">
      <ToastContainer />

      {chatbotDetected && (
        <div className="flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-700">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span>A chatbot was detected on this website. They may already have a solution.</span>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Email Draft</CardTitle>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleGenerate}
                disabled={generating}
              >
                {prospect.generatedBody ? (
                  <>
                    <RefreshCw className={`mr-2 h-3 w-3 ${generating ? 'animate-spin' : ''}`} />
                    Regenerate
                  </>
                ) : (
                  <>
                    <Zap className="mr-2 h-3 w-3" />
                    {generating ? 'Generating...' : 'Generate'}
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Email subject line..."
            />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label htmlFor="body">Body</Label>
              <span className={`text-xs ${wordCount > 200 ? 'text-red-500' : 'text-muted-foreground'}`}>
                {wordCount} words {wordCount > 200 && '(over 200!)'}
              </span>
            </div>
            <Textarea
              id="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Email body..."
              rows={12}
              className="font-mono text-sm"
            />
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Button
              size="sm"
              onClick={() => handleSend(false)}
              disabled={sending || !body || !prospect.contactEmail}
            >
              <Send className="mr-2 h-3 w-3" />
              {sending ? 'Sending...' : 'Send to Prospect'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleSend(true)}
              disabled={sending || !body}
            >
              <TestTube className="mr-2 h-3 w-3" />
              Send Test to Me
            </Button>
            <Button size="sm" variant="secondary" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save Draft'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Prospect Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Status</Label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="followUpDate">Follow-up Date</Label>
              <Input
                id="followUpDate"
                type="date"
                value={followUpDate}
                onChange={(e) => setFollowUpDate(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Internal notes..."
              rows={3}
            />
          </div>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

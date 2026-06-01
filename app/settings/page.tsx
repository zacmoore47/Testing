'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { useToast } from '@/components/ui/toast'
import { CheckCircle, XCircle, ExternalLink } from 'lucide-react'

interface Settings {
  anthropic_api_key?: string
  sender_name?: string
  sender_website?: string
  sender_phone?: string
  default_signature?: string
}

function SettingsContent() {
  const searchParams = useSearchParams()
  const [settings, setSettings] = useState<Settings>({})
  const [connectedEmail, setConnectedEmail] = useState<string | null>(null)
  const [checkingEmail, setCheckingEmail] = useState(true)
  const [saving, setSaving] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const { toast, ToastContainer } = useToast()

  async function fetchSettings() {
    try {
      const res = await fetch('/api/settings')
      if (res.ok) {
        const data = await res.json()
        setSettings(data)
      }
    } catch (err) {
      console.error('Failed to fetch settings:', err)
    }
  }

  async function checkGmailStatus() {
    setCheckingEmail(true)
    try {
      const res = await fetch('/api/auth/google/status')
      if (res.ok) {
        const data = await res.json()
        setConnectedEmail(data.email || null)
      }
    } catch {
      setConnectedEmail(null)
    } finally {
      setCheckingEmail(false)
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    fetchSettings()
    checkGmailStatus()

    const success = searchParams.get('success')
    const error = searchParams.get('error')

    if (success === 'gmail_connected') {
      toast({ message: 'Gmail connected successfully!', type: 'success' })
      checkGmailStatus()
    } else if (error) {
      const errorMessages: Record<string, string> = {
        auth_failed: 'Authentication failed. Please try again.',
        no_code: 'No authorization code received.',
        token_exchange_failed: 'Failed to exchange tokens. Please try again.',
      }
      toast({ message: errorMessages[error] || 'Authentication error', type: 'error' })
    }
  }, [])

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (!res.ok) throw new Error('Failed to save')
      toast({ message: 'Settings saved!', type: 'success' })
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : 'Failed to save', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  async function handleDisconnectGmail() {
    if (!confirm('Disconnect Gmail account?')) return
    setDisconnecting(true)
    try {
      const res = await fetch('/api/settings?key=google_tokens', { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to disconnect')
      setConnectedEmail(null)
      toast({ message: 'Gmail disconnected', type: 'info' })
    } catch (err) {
      toast({ message: err instanceof Error ? err.message : 'Failed to disconnect', type: 'error' })
    } finally {
      setDisconnecting(false)
    }
  }

  function handleChange(key: keyof Settings, value: string) {
    setSettings((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="max-w-2xl space-y-6">
      <ToastContainer />

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-muted-foreground">Configure your outreach tool</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Gmail Integration</CardTitle>
          <CardDescription>Connect your Gmail account to send emails</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {checkingEmail ? (
            <p className="text-sm text-muted-foreground">Checking connection status...</p>
          ) : connectedEmail ? (
            <div className="flex items-center justify-between rounded-lg border border-green-200 bg-green-50 p-3">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <div>
                  <p className="text-sm font-medium text-green-900">Connected</p>
                  <p className="text-xs text-green-700">{connectedEmail}</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDisconnectGmail}
                disabled={disconnecting}
                className="border-red-200 text-red-600 hover:bg-red-50"
              >
                {disconnecting ? 'Disconnecting...' : 'Disconnect'}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
                <XCircle className="h-4 w-4 text-gray-400" />
                <p className="text-sm text-gray-600">Not connected</p>
              </div>
              <a href="/api/auth/google">
                <Button>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Connect Gmail Account
                </Button>
              </a>
              <p className="text-xs text-muted-foreground">
                You&apos;ll be redirected to Google to authorise access to send emails on your behalf.
                Only the Send permission is requested.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>API Keys</CardTitle>
          <CardDescription>Configure your API credentials</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="anthropic_api_key">Anthropic API Key</Label>
            <Input
              id="anthropic_api_key"
              type="password"
              value={settings.anthropic_api_key || ''}
              onChange={(e) => handleChange('anthropic_api_key', e.target.value)}
              placeholder="sk-ant-..."
            />
            <p className="text-xs text-muted-foreground">
              Used to generate personalised email copy via Claude. Get yours at{' '}
              <a
                href="https://console.anthropic.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                console.anthropic.com
              </a>
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sender Details</CardTitle>
          <CardDescription>Your details used when generating emails</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="sender_name">Your Name</Label>
            <Input
              id="sender_name"
              value={settings.sender_name || ''}
              onChange={(e) => handleChange('sender_name', e.target.value)}
              placeholder="Jane Smith"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sender_website">Your Website</Label>
            <Input
              id="sender_website"
              value={settings.sender_website || ''}
              onChange={(e) => handleChange('sender_website', e.target.value)}
              placeholder="https://yoursite.com"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sender_phone">Your Phone</Label>
            <Input
              id="sender_phone"
              value={settings.sender_phone || ''}
              onChange={(e) => handleChange('sender_phone', e.target.value)}
              placeholder="+44 7700 900000"
            />
          </div>

          <Separator />

          <div className="space-y-1">
            <Label htmlFor="default_signature">Default Email Signature</Label>
            <Textarea
              id="default_signature"
              value={settings.default_signature || ''}
              onChange={(e) => handleChange('default_signature', e.target.value)}
              placeholder="Best regards,&#10;Jane Smith&#10;yoursite.com"
              rows={4}
            />
            <p className="text-xs text-muted-foreground">
              Appended to all generated emails. Leave blank to let Claude write the sign-off.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>
    </div>
  )
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-muted-foreground">Loading settings...</div>}>
      <SettingsContent />
    </Suspense>
  )
}

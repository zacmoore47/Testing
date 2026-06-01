'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Users, Send, MessageSquare, Calendar, TrendingUp } from 'lucide-react'

interface AnalyticsBarProps {
  total: number
  sent: number
  replies: number
  booked: number
}

export function AnalyticsBar({ total, sent, replies, booked }: AnalyticsBarProps) {
  const conversionRate = sent > 0 ? Math.round((booked / sent) * 100) : 0

  const stats = [
    {
      label: 'Total Prospects',
      value: total,
      icon: Users,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      label: 'Emails Sent',
      value: sent,
      icon: Send,
      color: 'text-yellow-600',
      bg: 'bg-yellow-50',
    },
    {
      label: 'Replies',
      value: replies,
      icon: MessageSquare,
      color: 'text-green-600',
      bg: 'bg-green-50',
    },
    {
      label: 'Meetings Booked',
      value: booked,
      icon: Calendar,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
    {
      label: 'Conversion Rate',
      value: `${conversionRate}%`,
      icon: TrendingUp,
      color: 'text-purple-600',
      bg: 'bg-purple-50',
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {stats.map((stat) => (
        <Card key={stat.label} className="border shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className={`rounded-lg p-2 ${stat.bg}`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
                <p className="text-xl font-bold">{stat.value}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

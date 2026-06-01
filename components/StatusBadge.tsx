'use client'

import { cn } from '@/lib/utils'

const statusConfig: Record<string, { label: string; className: string }> = {
  New: {
    label: 'New',
    className: 'bg-gray-100 text-gray-700 border-gray-200',
  },
  'Email Draft': {
    label: 'Email Draft',
    className: 'bg-blue-100 text-blue-700 border-blue-200',
  },
  Sent: {
    label: 'Sent',
    className: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  },
  Replied: {
    label: 'Replied',
    className: 'bg-green-100 text-green-700 border-green-200',
  },
  Booked: {
    label: 'Booked',
    className: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  },
  'Not Interested': {
    label: 'Not Interested',
    className: 'bg-red-100 text-red-700 border-red-200',
  },
}

interface StatusBadgeProps {
  status: string
  className?: string
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status] || {
    label: status,
    className: 'bg-gray-100 text-gray-700 border-gray-200',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium',
        config.className,
        className
      )}
    >
      {config.label}
    </span>
  )
}

export const STATUS_OPTIONS = Object.keys(statusConfig)

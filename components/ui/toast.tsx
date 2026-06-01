'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

interface ToastProps {
  message: string
  type?: 'success' | 'error' | 'info'
  onClose: () => void
}

export function Toast({ message, type = 'info', onClose }: ToastProps) {
  React.useEffect(() => {
    const timer = setTimeout(onClose, 4000)
    return () => clearTimeout(timer)
  }, [onClose])

  return (
    <div
      className={cn(
        'fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium shadow-lg transition-all',
        type === 'success' && 'bg-green-600 text-white',
        type === 'error' && 'bg-red-600 text-white',
        type === 'info' && 'bg-zinc-900 text-white'
      )}
    >
      {message}
      <button onClick={onClose} className="ml-2 opacity-70 hover:opacity-100">
        ×
      </button>
    </div>
  )
}

interface ToastState {
  message: string
  type: 'success' | 'error' | 'info'
  id: number
}

export function useToast() {
  const [toasts, setToasts] = React.useState<ToastState[]>([])

  const toast = React.useCallback(
    ({ message, type = 'info' }: { message: string; type?: 'success' | 'error' | 'info' }) => {
      const id = Date.now()
      setToasts((prev) => [...prev, { message, type, id }])
    },
    []
  )

  const removeToast = React.useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const ToastContainer = React.useCallback(
    () => (
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <Toast key={t.id} message={t.message} type={t.type} onClose={() => removeToast(t.id)} />
        ))}
      </div>
    ),
    [toasts, removeToast]
  )

  return { toast, ToastContainer }
}

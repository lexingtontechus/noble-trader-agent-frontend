'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { subscribe, dismiss } from '@/lib/notifications'

const TYPE_CONFIG = {
  success: { icon: '✅', alertClass: 'alert-success' },
  error:   { icon: '❌', alertClass: 'alert-error' },
  warning: { icon: '⚠️', alertClass: 'alert-warning' },
  info:    { icon: 'ℹ️', alertClass: 'alert-info' },
}

function ToastItem({ notification, onDismiss }) {
  const { id, type, message, duration, title, action } = notification
  const config = TYPE_CONFIG[type] || TYPE_CONFIG.info
  const [visible, setVisible] = useState(false)
  const [exiting, setExiting] = useState(false)
  const [progress, setProgress] = useState(100)
  const rafRef = useRef(null)
  const startTimeRef = useRef(null)

  // Enter animation on mount
  useEffect(() => {
    const t = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(t)
  }, [])

  // Progress bar animation
  useEffect(() => {
    if (!duration || duration <= 0) return // persistent notifications

    startTimeRef.current = Date.now()

    const animate = () => {
      const elapsed = Date.now() - startTimeRef.current
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100)
      setProgress(remaining)

      if (remaining > 0) {
        rafRef.current = requestAnimationFrame(animate)
      }
    }

    rafRef.current = requestAnimationFrame(animate)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [duration])

  const handleDismiss = useCallback(() => {
    setExiting(true)
    // Wait for exit animation, then dismiss
    setTimeout(() => {
      onDismiss(id)
    }, 300)
  }, [id, onDismiss])

  const alertClass = config.alertClass
  const isPersistent = !duration || duration <= 0

  return (
    <div
      className={`
        toast-item
        transition-all duration-300 ease-out
        ${visible && !exiting
          ? 'opacity-100 translate-x-0'
          : 'opacity-0 translate-x-8'
        }
      `}
    >
      <div className={`alert ${alertClass} shadow-lg relative overflow-hidden py-2 px-3 min-w-0`}>
        {/* Progress bar */}
        {!isPersistent && (
          <div
            className="absolute bottom-0 left-0 h-0.5 bg-current opacity-30 transition-none"
            style={{ width: `${progress}%` }}
          />
        )}
        <span className="text-base shrink-0">{config.icon}</span>
        <div className="flex-1 min-w-0">
          {title && <div className="text-sm font-bold break-words">{title}</div>}
          <div className={`text-sm font-medium break-words ${title ? 'text-xs opacity-80' : ''}`}>{message}</div>
          {action && (
            <button
              className="btn btn-xs btn-ghost mt-1 p-0 h-auto min-h-0 text-primary hover:underline"
              onClick={action.onClick}
            >
              {action.label}
            </button>
          )}
        </div>
        <button
          className="btn btn-ghost btn-xs shrink-0 ml-1"
          onClick={handleDismiss}
          aria-label="Dismiss notification"
        >
          ✕
        </button>
      </div>
    </div>
  )
}

export default function NotificationToast() {
  const [notifications, setNotifications] = useState([])

  useEffect(() => {
    const unsubscribe = subscribe((updated) => {
      setNotifications(updated)
    })
    return unsubscribe
  }, [])

  const handleDismiss = useCallback((id) => {
    dismiss(id)
  }, [])

  if (notifications.length === 0) return null

  return (
    <div
      className="fixed bottom-20 sm:bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none sm:w-96 w-[calc(100%-2rem)]"
      aria-live="polite"
      aria-label="Notifications"
    >
      {notifications.map((n) => (
        <div key={n.id} className="pointer-events-auto">
          <ToastItem notification={n} onDismiss={handleDismiss} />
        </div>
      ))}
    </div>
  )
}

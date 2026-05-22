'use client'

import { useState, useCallback } from 'react'
import { useUser } from '@clerk/nextjs'

function StatusBadge({ status }) {
  if (status === 'loading') return <span className="loading loading-spinner loading-xs" />
  if (status === 'success') return <span className="badge badge-success badge-sm">✓ OK</span>
  if (status === 'error') return <span className="badge badge-error badge-sm">✗ Fail</span>
  return <span className="badge badge-ghost badge-sm">—</span>
}

function KeyValueRow({ label, value, mono = false }) {
  if (value === null || value === undefined) return null
  return (
    <div className="flex justify-between items-center py-1 border-b border-base-300/30 last:border-0">
      <span className="text-xs text-base-content/50">{label}</span>
      <span className={`text-xs ${mono ? 'font-mono' : ''} text-base-content/80 max-w-[60%] truncate`} title={String(value)}>
        {String(value)}
      </span>
    </div>
  )
}

export default function ClerkAuthPanel() {
  const { isSignedIn, isLoaded, user } = useUser()
  const [results, setResults] = useState({})
  const [loading, setLoading] = useState({})
  const [running, setRunning] = useState(false)

  const fetchEndpoint = useCallback(async (key, url, method = 'GET') => {
    setLoading(prev => ({ ...prev, [key]: true }))
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await res.json()
      setResults(prev => ({ ...prev, [key]: { data, status: res.status } }))
    } catch (err) {
      setResults(prev => ({ ...prev, [key]: { error: err.message, status: 0 } }))
    } finally {
      setLoading(prev => ({ ...prev, [key]: false }))
    }
  }, [])

  const runAllTests = useCallback(async () => {
    if (!isSignedIn) return
    setRunning(true)
    await Promise.all([
      fetchEndpoint('config', '/api/auth/clerk-config'),
      fetchEndpoint('me', '/api/auth/clerk-me'),
      fetchEndpoint('verify', '/api/auth/clerk-verify', 'POST'),
      fetchEndpoint('token', '/api/auth/clerk-token'),
    ])
    setRunning(false)
  }, [isSignedIn, fetchEndpoint])

  const runSingle = useCallback(async (key) => {
    const urlMap = {
      config: '/api/auth/clerk-config',
      me: '/api/auth/clerk-me',
      verify: '/api/auth/clerk-verify',
      token: '/api/auth/clerk-token',
    }
    const methodMap = { verify: 'POST' }
    await fetchEndpoint(key, urlMap[key], methodMap[key] || 'GET')
  }, [fetchEndpoint])

  const getStatus = (key) => {
    if (loading[key]) return 'loading'
    const r = results[key]
    if (!r) return 'idle'
    if (r.status === 200) return 'success'
    if (r.status === 401) return 'success' // Expected when not signed in
    if (r.error) return 'error'
    return 'idle'
  }

  if (!isLoaded) {
    return (
      <div className="card bg-base-100 shadow-xl">
        <div className="card-body">
          <h3 className="card-title text-sm">Clerk ↔ FastAPI Auth</h3>
          <span className="loading loading-spinner loading-md" />
        </div>
      </div>
    )
  }

  if (!isSignedIn) {
    return (
      <div className="card bg-base-100 shadow-xl">
        <div className="card-body">
          <h3 className="card-title text-sm">Clerk ↔ FastAPI Auth</h3>
          <div className="alert alert-warning">
            <span className="text-xs">Sign in via Clerk to test FastAPI auth integration</span>
          </div>
        </div>
      </div>
    )
  }

  const configData = results.config?.data
  const meData = results.me?.data
  const verifyData = results.verify?.data
  const tokenData = results.token?.data

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-bold text-primary">Clerk ↔ FastAPI Auth</h3>
          <span className="badge badge-primary badge-sm">Live</span>
        </div>
        <button
          className={`btn btn-primary min-h-[44px] sm:min-h-0 sm:btn-sm ${running ? 'btn-disabled' : ''}`}
          onClick={runAllTests}
          disabled={running}
        >
          {running ? <span className="loading loading-spinner loading-xs" /> : '▶'}
          Run All Tests
        </button>
      </div>

      <div className="text-xs text-base-content/50 mb-2">
        Signed in as: <span className="font-mono text-base-content/80">{user?.primaryEmailAddress?.emailAddress || user?.id}</span>
      </div>

      {/* Grid of test cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Config Card */}
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body p-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold">/auth/clerk/config</h4>
              <div className="flex items-center gap-2">
                <StatusBadge status={getStatus('config')} />
                <button className="btn min-h-[44px] sm:min-h-0 sm:btn-xs btn-ghost" onClick={() => runSingle('config')}>↻</button>
              </div>
            </div>
            {loading.config && <span className="loading loading-dots loading-sm" />}
            {configData && (
              <div className="space-y-0">
                <KeyValueRow label="clerk_auth_enabled" value={String(configData.clerk_auth_enabled)} />
                <KeyValueRow label="publishable_key" value={configData.publishable_key} mono />
                <KeyValueRow label="jwt_algorithm" value={configData.jwt_algorithm} />
                <KeyValueRow label="jwks_endpoint" value={configData.jwks_endpoint} mono />
              </div>
            )}
            {results.config?.error && (
              <div className="alert alert-error alert-sm py-1">
                <span className="text-xs">{results.config.error}</span>
              </div>
            )}
          </div>
        </div>

        {/* Clerk Me Card */}
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body p-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold">/auth/clerk/me</h4>
              <div className="flex items-center gap-2">
                <StatusBadge status={getStatus('me')} />
                <button className="btn min-h-[44px] sm:min-h-0 sm:btn-xs btn-ghost" onClick={() => runSingle('me')}>↻</button>
              </div>
            </div>
            {loading.me && <span className="loading loading-dots loading-sm" />}
            {meData && !meData.error && (
              <div className="space-y-0">
                <KeyValueRow label="sub" value={meData.sub} mono />
                <KeyValueRow label="role" value={meData.role} />
                <KeyValueRow label="email" value={meData.email} />
                <KeyValueRow label="first_name" value={meData.first_name} />
                <KeyValueRow label="last_name" value={meData.last_name} />
                <KeyValueRow label="clerk_auth_enabled" value={String(meData.clerk_auth_enabled)} />
              </div>
            )}
            {meData?.error && (
              <div className="alert alert-warning alert-sm py-1">
                <span className="text-xs">{meData.error}</span>
              </div>
            )}
          </div>
        </div>

        {/* Clerk Verify Card */}
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body p-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold">/auth/clerk/verify</h4>
              <div className="flex items-center gap-2">
                <StatusBadge status={getStatus('verify')} />
                <button className="btn min-h-[44px] sm:min-h-0 sm:btn-xs btn-ghost" onClick={() => runSingle('verify')}>↻</button>
              </div>
            </div>
            {loading.verify && <span className="loading loading-dots loading-sm" />}
            {verifyData && (
              <div className="space-y-0">
                <div className="flex justify-between items-center py-1 border-b border-base-300/30">
                  <span className="text-xs text-base-content/50">valid</span>
                  <span className={`badge badge-sm ${verifyData.valid ? 'badge-success' : 'badge-error'}`}>
                    {String(verifyData.valid)}
                  </span>
                </div>
                {verifyData.user && (
                  <>
                    <KeyValueRow label="sub" value={verifyData.user.sub} mono />
                    <KeyValueRow label="role" value={verifyData.user.role} />
                    <KeyValueRow label="email" value={verifyData.user.email} />
                  </>
                )}
                {verifyData.error && (
                  <KeyValueRow label="error" value={verifyData.error} />
                )}
              </div>
            )}
            {results.verify?.error && (
              <div className="alert alert-error alert-sm py-1">
                <span className="text-xs">{results.verify.error}</span>
              </div>
            )}
          </div>
        </div>

        {/* Raw JWT Card */}
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body p-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold">Clerk JWT Token</h4>
              <div className="flex items-center gap-2">
                <StatusBadge status={getStatus('token')} />
                <button className="btn min-h-[44px] sm:min-h-0 sm:btn-xs btn-ghost" onClick={() => runSingle('token')}>↻</button>
              </div>
            </div>
            {loading.token && <span className="loading loading-dots loading-sm" />}
            {tokenData && !tokenData.error && (
              <div className="space-y-0">
                <div className="py-1 border-b border-base-300/30">
                  <span className="text-xs text-base-content/50">token</span>
                  <div className="flex items-center gap-1 mt-1">
                    <code className="text-[10px] font-mono text-base-content/60 break-all line-clamp-2">
                      {tokenData.token_preview}
                    </code>
                    <button
                      className="btn min-h-[44px] sm:min-h-0 sm:btn-xs btn-ghost btn-circle shrink-0"
                      onClick={() => navigator.clipboard?.writeText(tokenData.token)}
                      title="Copy full JWT"
                    >
                      📋
                    </button>
                  </div>
                </div>
                <KeyValueRow label="issuer" value={tokenData.issuer} mono />
                <KeyValueRow label="subject" value={tokenData.subject} mono />
                <KeyValueRow label="issued_at" value={tokenData.issued_at} />
                <KeyValueRow label="expires_at" value={tokenData.expires_at} />
              </div>
            )}
            {tokenData?.error && (
              <div className="alert alert-warning alert-sm py-1">
                <span className="text-xs">{tokenData.error}</span>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}

import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'
import { get } from '../lib/api.js'

export default function Login() {
  const { login, setup, authenticated } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [isFirstRun, setIsFirstRun] = useState(false)
  const [checkingStatus, setCheckingStatus] = useState(true)

  useEffect(() => {
    if (authenticated) {
      navigate('/', { replace: true })
      return
    }
    get('/api/auth/status').then(s => {
      setIsFirstRun(s.firstRun)
    }).catch(() => {}).finally(() => {
      setCheckingStatus(false)
    })
  }, [authenticated, navigate])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (isFirstRun) {
        await setup(username, password)
      } else {
        await login(username, password)
      }
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message || 'Authentication failed')
    } finally {
      setLoading(false)
    }
  }

  if (checkingStatus) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-slate-500 text-sm">Loading...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo / Wordmark */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">⚓</div>
          <h1 className="text-3xl font-bold text-slate-100 tracking-tight">Bosun</h1>
          <p className="text-slate-400 mt-1 text-sm">Docker container management</p>
        </div>

        {/* Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl">
          <h2 className="text-lg font-semibold text-slate-100 mb-1">
            {isFirstRun ? 'Create Admin Account' : 'Sign in'}
          </h2>
          <p className="text-slate-500 text-sm mb-6">
            {isFirstRun
              ? 'Set up your Bosun administrator account to get started.'
              : 'Enter your credentials to access Bosun.'}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="input-field"
                placeholder="admin"
                autoComplete="username"
                required
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="input-field"
                placeholder={isFirstRun ? 'At least 8 characters' : '••••••••'}
                autoComplete={isFirstRun ? 'new-password' : 'current-password'}
                required
              />
            </div>

            {error && (
              <div className="bg-red-950/50 border border-red-800 rounded-lg px-3 py-2 text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full btn-primary py-2.5 disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              {loading
                ? (isFirstRun ? 'Creating account...' : 'Signing in...')
                : (isFirstRun ? 'Create Account' : 'Sign In')}
            </button>
          </form>
        </div>

        <p className="text-center text-slate-600 text-xs mt-6">
          Bosun v1.0.0 · Self-hosted Docker Management
        </p>
      </div>
    </div>
  )
}

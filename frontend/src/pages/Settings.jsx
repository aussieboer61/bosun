import React, { useState, useEffect } from 'react'
import Nav from '../components/Nav.jsx'
import { useAuth } from '../hooks/useAuth.jsx'
import { get, put, post, del } from '../lib/api.js'

function Section({ title, description, children }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-slate-100">{title}</h2>
        {description && <p className="text-sm text-slate-500 mt-0.5">{description}</p>}
      </div>
      {children}
    </div>
  )
}

export default function Settings() {
  const { username } = useAuth()
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Exclusion input
  const [newExclusion, setNewExclusion] = useState('')

  // Alias input
  const [newAliasName, setNewAliasName] = useState('')
  const [newAliasPath, setNewAliasPath] = useState('')

  // Password form
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwError, setPwError] = useState('')
  const [pwSuccess, setPwSuccess] = useState('')
  const [changingPw, setChangingPw] = useState(false)

  useEffect(() => {
    loadSettings()
  }, [])

  async function loadSettings() {
    setLoading(true)
    try {
      const data = await get('/api/settings')
      setSettings(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function saveSettings(updates) {
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const updated = await put('/api/settings', { ...settings, ...updates })
      setSettings(updated)
      setSuccess('Settings saved')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function addExclusion() {
    if (!newExclusion.trim()) return
    try {
      await post('/api/settings/exclusions', { name: newExclusion.trim() })
      setNewExclusion('')
      await loadSettings()
    } catch (err) {
      setError(err.message)
    }
  }

  async function removeExclusion(name) {
    try {
      await del(`/api/settings/exclusions/${encodeURIComponent(name)}`)
      await loadSettings()
    } catch (err) {
      setError(err.message)
    }
  }

  function addAlias() {
    if (!newAliasName.trim() || !newAliasPath.trim()) return
    const aliases = [...(settings.aliases || []), { name: newAliasName.trim(), path: newAliasPath.trim() }]
    setNewAliasName('')
    setNewAliasPath('')
    saveSettings({ aliases })
  }

  function removeAlias(idx) {
    const aliases = settings.aliases.filter((_, i) => i !== idx)
    saveSettings({ aliases })
  }

  async function changePassword(e) {
    e.preventDefault()
    setPwError('')
    setPwSuccess('')
    if (newPw !== confirmPw) {
      setPwError('Passwords do not match')
      return
    }
    setChangingPw(true)
    try {
      await post('/api/auth/change-password', { currentPassword: currentPw, newPassword: newPw })
      setPwSuccess('Password changed successfully')
      setCurrentPw('')
      setNewPw('')
      setConfirmPw('')
    } catch (err) {
      setPwError(err.message)
    } finally {
      setChangingPw(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950">
        <Nav />
        <div className="flex items-center justify-center py-20">
          <div className="text-slate-500 text-sm">Loading settings...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <Nav />
      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Settings</h1>
          <p className="text-slate-500 text-sm mt-0.5">Configure Bosun behaviour and preferences</p>
        </div>

        {error && (
          <div className="bg-red-950/50 border border-red-800 rounded-lg px-4 py-3 text-red-400 text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-green-950/50 border border-green-800 rounded-lg px-4 py-3 text-green-400 text-sm">
            {success}
          </div>
        )}

        {/* Exclusions */}
        <Section
          title="Container Exclusions"
          description="Containers whose names contain any of these strings will be hidden from the dashboard."
        >
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={newExclusion}
              onChange={e => setNewExclusion(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addExclusion()}
              className="input-field"
              placeholder="e.g. postgres, redis"
            />
            <button onClick={addExclusion} className="btn-secondary whitespace-nowrap">
              Add
            </button>
          </div>
          <div className="space-y-2">
            {(settings?.exclusions || []).length === 0 ? (
              <p className="text-slate-600 text-sm">No custom exclusions. Default exclusions (bosun, caddy, authentik) always apply.</p>
            ) : (
              (settings.exclusions || []).map(ex => (
                <div key={ex} className="flex items-center justify-between bg-slate-800 rounded-lg px-3 py-2">
                  <span className="text-slate-300 text-sm font-mono">{ex}</span>
                  <button
                    onClick={() => removeExclusion(ex)}
                    className="text-red-500 hover:text-red-400 text-sm transition-colors"
                  >
                    Remove
                  </button>
                </div>
              ))
            )}
          </div>
        </Section>

        {/* Aliases */}
        <Section
          title="Host Path Aliases"
          description="Friendly names for host paths shown in volume mappings."
        >
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={newAliasName}
              onChange={e => setNewAliasName(e.target.value)}
              className="input-field"
              placeholder="Name (e.g. pump)"
            />
            <input
              type="text"
              value={newAliasPath}
              onChange={e => setNewAliasPath(e.target.value)}
              className="input-field"
              placeholder="Path (e.g. /mnt/pump)"
            />
            <button onClick={addAlias} className="btn-secondary whitespace-nowrap">
              Add
            </button>
          </div>
          <div className="space-y-2">
            {(settings?.aliases || []).length === 0 ? (
              <p className="text-slate-600 text-sm">No aliases configured.</p>
            ) : (
              settings.aliases.map((alias, i) => (
                <div key={i} className="flex items-center justify-between bg-slate-800 rounded-lg px-3 py-2">
                  <span className="text-slate-300 text-sm">
                    <span className="text-blue-400 font-mono">{alias.name}</span>
                    <span className="text-slate-500 mx-2">→</span>
                    <span className="font-mono">{alias.path}</span>
                  </span>
                  <button
                    onClick={() => removeAlias(i)}
                    className="text-red-500 hover:text-red-400 text-sm transition-colors"
                  >
                    Remove
                  </button>
                </div>
              ))
            )}
          </div>
        </Section>

        {/* Auto-update */}
        <Section
          title="Auto-Update"
          description="Automatically pull and redeploy containers on a schedule."
        >
          <div className="space-y-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <div
                onClick={() => saveSettings({ autoUpdateEnabled: !settings.autoUpdateEnabled })}
                className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${
                  settings?.autoUpdateEnabled ? 'bg-blue-600' : 'bg-slate-700'
                }`}
              >
                <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                  settings?.autoUpdateEnabled ? 'translate-x-5' : 'translate-x-0'
                }`} />
              </div>
              <span className="text-slate-300 text-sm">Enable auto-updates globally</span>
            </label>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Default Schedule (cron expression)
              </label>
              <input
                type="text"
                value={settings?.defaultSchedule || ''}
                onChange={e => setSettings(s => ({ ...s, defaultSchedule: e.target.value }))}
                onBlur={() => saveSettings({ defaultSchedule: settings.defaultSchedule })}
                className="input-field max-w-xs"
                placeholder="0 3 * * *"
              />
              <p className="text-slate-600 text-xs mt-1">Default: <code>0 3 * * *</code> (3 AM daily)</p>
            </div>
          </div>
        </Section>

        {/* Change Password */}
        <Section
          title="Change Password"
          description="Update the password for your account."
        >
          <form onSubmit={changePassword} className="space-y-3 max-w-sm">
            <div>
              <label className="block text-sm text-slate-300 mb-1.5">Current Password</label>
              <input
                type="password"
                value={currentPw}
                onChange={e => setCurrentPw(e.target.value)}
                className="input-field"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-1.5">New Password</label>
              <input
                type="password"
                value={newPw}
                onChange={e => setNewPw(e.target.value)}
                className="input-field"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-1.5">Confirm New Password</label>
              <input
                type="password"
                value={confirmPw}
                onChange={e => setConfirmPw(e.target.value)}
                className="input-field"
                required
              />
            </div>
            {pwError && (
              <div className="text-red-400 text-sm">{pwError}</div>
            )}
            {pwSuccess && (
              <div className="text-green-400 text-sm">{pwSuccess}</div>
            )}
            <button type="submit" disabled={changingPw} className="btn-primary disabled:opacity-50">
              {changingPw ? 'Changing...' : 'Change Password'}
            </button>
          </form>
        </Section>

        {/* About */}
        <Section title="About">
          <div className="space-y-2 text-sm">
            <div className="flex gap-4">
              <span className="text-slate-500 w-32">Application</span>
              <span className="text-slate-300">Bosun v1.0.0</span>
            </div>
            <div className="flex gap-4">
              <span className="text-slate-500 w-32">Logged in as</span>
              <span className="text-slate-300">{username}</span>
            </div>
            <div className="flex gap-4">
              <span className="text-slate-500 w-32">Data directory</span>
              <span className="text-slate-300 font-mono text-xs">/home/bosun</span>
            </div>
          </div>
        </Section>
      </main>
    </div>
  )
}

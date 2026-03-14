import React, { useState, useEffect, useRef } from 'react'
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

function BackupSection() {
  const [restoring, setRestoring] = useState(false)
  const [restoreMsg, setRestoreMsg] = useState('')
  const fileRef = React.useRef()

  function downloadBackup() {
    const a = document.createElement('a')
    a.href = '/api/backup'
    const headers = { 'Authorization': `Bearer ${localStorage.getItem('bosun_token')}` }
    fetch('/api/backup', { headers })
      .then(r => r.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob)
        a.href = url
        a.download = `bosun-backup-${new Date().toISOString().slice(0, 10)}.json`
        a.click()
        URL.revokeObjectURL(url)
      })
      .catch(err => alert('Export failed: ' + err.message))
  }

  function handleRestore(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (ev) => {
      try {
        const payload = JSON.parse(ev.target.result)
        if (!payload.configs) throw new Error('Invalid backup file')
        const overwrite = window.confirm(
          `Restore ${payload.configs.length} configs?\n\nClick OK to overwrite existing, Cancel to skip existing.`
        )
        setRestoring(true)
        const res = await fetch('/api/backup/restore', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('bosun_token')}`
          },
          body: JSON.stringify({ configs: payload.configs, overwrite })
        })
        const result = await res.json()
        setRestoreMsg(`Imported ${result.imported?.length || 0}, skipped ${result.skipped?.length || 0}, errors ${result.errors?.length || 0}`)
        setTimeout(() => setRestoreMsg(''), 6000)
      } catch (err) {
        setRestoreMsg('Restore failed: ' + err.message)
        setTimeout(() => setRestoreMsg(''), 6000)
      } finally {
        setRestoring(false)
        if (fileRef.current) fileRef.current.value = ''
      }
    }
    reader.readAsText(file)
  }

  return (
    <Section title="Backup & Restore" description="Export all container configs to a JSON file, or restore from a previous backup.">
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={downloadBackup} className="btn-secondary">
          ↓ Export Configs
        </button>
        <button onClick={() => fileRef.current?.click()} disabled={restoring} className="btn-secondary disabled:opacity-50">
          {restoring ? 'Restoring…' : '↑ Import Backup'}
        </button>
        <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleRestore} />
        {restoreMsg && <span className="text-sm text-slate-400">{restoreMsg}</span>}
      </div>
    </Section>
  )
}

function AutoUpdateSection({ settings, saveSettings, setSettings }) {
  const [checkingUpdates, setCheckingUpdates] = useState(false)
  const [runningUpdates, setRunningUpdates] = useState(false)
  const [updateMsg, setUpdateMsg] = useState('')
  const [log, setLog] = useState([])
  const [logLoading, setLogLoading] = useState(false)
  const [showLog, setShowLog] = useState(false)

  async function checkUpdates() {
    setCheckingUpdates(true)
    setUpdateMsg('')
    try {
      const res = await post('/api/containers/check-updates', {})
      setUpdateMsg(`Checking updates for ${res.count} containers — badges will update on next refresh`)
      setTimeout(() => setUpdateMsg(''), 8000)
    } catch (err) {
      setUpdateMsg('Check failed: ' + err.message)
    } finally {
      setCheckingUpdates(false)
    }
  }

  async function runUpdates() {
    if (!window.confirm('Pull and redeploy all managed containers now?\n\nContainers will restart one at a time.')) return
    setRunningUpdates(true)
    setUpdateMsg('')
    try {
      await post('/api/containers/update-all', {})
      setUpdateMsg('Updates started — check the log below for progress')
      setTimeout(() => setUpdateMsg(''), 8000)
    } catch (err) {
      setUpdateMsg('Failed: ' + err.message)
    } finally {
      setRunningUpdates(false)
    }
  }

  async function loadLog() {
    setLogLoading(true)
    try {
      const data = await get('/api/settings/updates/log')
      setLog(data.lines || [])
    } catch {
      setLog(['Failed to load log'])
    } finally {
      setLogLoading(false)
    }
  }

  function toggleLog() {
    if (!showLog) loadLog()
    setShowLog(v => !v)
  }

  return (
    <Section
      title="Auto-Update"
      description="Automatically pull and redeploy containers on a schedule. Replaces Watchtower."
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
          <span className="text-slate-300 text-sm">Enable auto-updates globally (all managed containers)</span>
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
          <p className="text-slate-600 text-xs mt-1">Default: <code>0 3 * * *</code> (3 AM daily). Per-container schedule in container settings overrides this.</p>
        </div>

        <div className="flex items-center gap-3 pt-1 flex-wrap">
          <button onClick={checkUpdates} disabled={checkingUpdates} className="btn-secondary disabled:opacity-50 text-sm">
            {checkingUpdates ? 'Checking…' : 'Check for Updates'}
          </button>
          <button onClick={runUpdates} disabled={runningUpdates} className="btn-secondary disabled:opacity-50 text-sm">
            {runningUpdates ? 'Starting…' : 'Run Updates Now'}
          </button>
          <button onClick={toggleLog} className="text-slate-500 hover:text-slate-300 text-sm transition-colors">
            {showLog ? 'Hide Log ▲' : 'Show Log ▼'}
          </button>
          {updateMsg && <span className="text-sm text-slate-400">{updateMsg}</span>}
        </div>

        {showLog && (
          <div className="mt-2">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-slate-500">Recent update activity (newest first)</span>
              <button onClick={loadLog} disabled={logLoading} className="text-xs text-slate-600 hover:text-slate-400 transition-colors">
                {logLoading ? 'Loading…' : '↻ Refresh'}
              </button>
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 max-h-64 overflow-y-auto font-mono text-xs space-y-0.5">
              {log.length === 0 ? (
                <span className="text-slate-600">No update activity yet</span>
              ) : log.map((line, i) => (
                <div
                  key={i}
                  className={`${
                    line.includes('ERROR') ? 'text-red-400' :
                    line.includes('complete') || line.includes('Complete') ? 'text-green-400' :
                    line.includes('pulled') || line.includes('Pulled') ? 'text-blue-400' :
                    'text-slate-400'
                  }`}
                >
                  {line}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Section>
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
        <AutoUpdateSection settings={settings} saveSettings={saveSettings} setSettings={setSettings} />

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

        {/* Backup & Restore */}
        <BackupSection />

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

import React, { useState, useEffect, useCallback } from 'react'
import Nav from '../components/Nav.jsx'
import { get, del, post } from '../lib/api.js'

function CreateNetworkModal({ onClose, onCreated }) {
  const [name, setName] = useState('')
  const [driver, setDriver] = useState('bridge')
  const [internal, setInternal] = useState(false)
  const [subnet, setSubnet] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleCreate() {
    if (!name.trim()) { setError('Name is required'); return }
    setSaving(true)
    setError('')
    try {
      await post('/api/networks', { name: name.trim(), driver, internal, subnet: subnet.trim() || undefined })
      onCreated()
      onClose()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-slate-100 mb-4">Create Network</h2>
        {error && <div className="mb-4 text-red-400 text-sm bg-red-950/50 border border-red-800 rounded-lg px-3 py-2">{error}</div>}
        <div className="space-y-4">
          <div>
            <label className="block text-slate-400 text-xs mb-1">Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              className="input-field w-full"
              placeholder="my-network"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-slate-400 text-xs mb-1">Driver</label>
            <select value={driver} onChange={e => setDriver(e.target.value)} className="input-field w-full">
              <option value="bridge">bridge</option>
              <option value="overlay">overlay</option>
              <option value="macvlan">macvlan</option>
            </select>
          </div>
          <div>
            <label className="block text-slate-400 text-xs mb-1">Subnet (optional)</label>
            <input
              value={subnet}
              onChange={e => setSubnet(e.target.value)}
              className="input-field w-full"
              placeholder="172.20.0.0/16"
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={internal} onChange={e => setInternal(e.target.checked)} className="rounded" />
            <span className="text-slate-400 text-sm">Internal (no external access)</span>
          </label>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={handleCreate} disabled={saving} className="btn-primary">
            {saving ? 'Creating…' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function NetworksPage() {
  const [networks, setNetworks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionMsg, setActionMsg] = useState('')
  const [creating, setCreating] = useState(false)
  const [expanded, setExpanded] = useState(null)

  const fetchNetworks = useCallback(async () => {
    try {
      setLoading(true)
      const data = await get('/api/networks')
      setNetworks(data)
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchNetworks() }, [fetchNetworks])

  async function removeNetwork(id, name) {
    if (!window.confirm(`Remove network "${name}"?`)) return
    try {
      await del(`/api/networks/${id}`)
      setActionMsg(`Removed network "${name}"`)
      setTimeout(() => setActionMsg(''), 3000)
      fetchNetworks()
    } catch (err) {
      setActionMsg(`Error: ${err.message}`)
      setTimeout(() => setActionMsg(''), 5000)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <Nav />
      <main className="max-w-screen-2xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-slate-100">Networks</h1>
            <p className="text-slate-500 text-sm mt-0.5">{networks.length} network{networks.length !== 1 ? 's' : ''}</p>
          </div>
          <div className="flex items-center gap-2">
            {actionMsg && <span className="text-sm text-slate-400">{actionMsg}</span>}
            <button onClick={() => setCreating(true)} className="btn-primary text-sm">
              ＋ Create Network
            </button>
            <button onClick={fetchNetworks} className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm px-3 py-1.5 rounded-lg transition-colors">
              ↺ Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 bg-red-950/50 border border-red-800 rounded-lg px-4 py-3 text-red-400 text-sm">{error}</div>
        )}

        <div className="space-y-2">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl p-4 animate-pulse">
                <div className="h-4 bg-slate-800 rounded w-1/4 mb-2" />
                <div className="h-3 bg-slate-800 rounded w-1/3" />
              </div>
            ))
          ) : networks.length === 0 ? (
            <div className="text-center py-16 text-slate-600">No networks found</div>
          ) : (
            networks.map(net => (
              <div key={net.id} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                <div
                  className="flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-slate-800/30 transition-colors"
                  onClick={() => setExpanded(expanded === net.id ? null : net.id)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-100 font-medium text-sm">{net.name}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-400">{net.driver}</span>
                      {net.internal && <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">internal</span>}
                    </div>
                    <div className="text-slate-600 text-xs mt-0.5">
                      {net.shortId} · {net.containers.length} container{net.containers.length !== 1 ? 's' : ''}
                      {net.ipam?.Config?.[0]?.Subnet && ` · ${net.ipam.Config[0].Subnet}`}
                    </div>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); removeNetwork(net.id, net.name) }}
                    disabled={net.containers.length > 0}
                    title={net.containers.length > 0 ? 'Network has connected containers' : 'Remove network'}
                    className="text-slate-600 hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xs px-2 py-1 rounded flex-shrink-0"
                  >
                    ✕ Remove
                  </button>
                  <span className="text-slate-600 text-xs">{expanded === net.id ? '▲' : '▼'}</span>
                </div>
                {expanded === net.id && net.containers.length > 0 && (
                  <div className="border-t border-slate-800 px-4 py-3">
                    <p className="text-slate-500 text-xs mb-2">Connected containers:</p>
                    <div className="space-y-1">
                      {net.containers.map(c => (
                        <div key={c.id} className="flex items-center gap-3 text-xs">
                          <span className="text-slate-300 font-medium w-40 truncate">{c.name}</span>
                          <span className="font-mono text-slate-500">{c.ipv4}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </main>

      {creating && (
        <CreateNetworkModal onClose={() => setCreating(false)} onCreated={fetchNetworks} />
      )}
    </div>
  )
}

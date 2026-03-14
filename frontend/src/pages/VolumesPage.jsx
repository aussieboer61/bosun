import React, { useState, useEffect, useCallback } from 'react'
import Nav from '../components/Nav.jsx'
import { get, del, post } from '../lib/api.js'

export default function VolumesPage() {
  const [volumes, setVolumes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionMsg, setActionMsg] = useState('')

  const fetchVolumes = useCallback(async () => {
    try {
      setLoading(true)
      const data = await get('/api/volumes')
      setVolumes(data)
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchVolumes() }, [fetchVolumes])

  async function removeVolume(name) {
    if (!window.confirm(`Remove volume "${name}"? This will permanently delete all data stored in it.`)) return
    try {
      await del(`/api/volumes/${encodeURIComponent(name)}`)
      setActionMsg(`Removed volume "${name}"`)
      setTimeout(() => setActionMsg(''), 3000)
      fetchVolumes()
    } catch (err) {
      setActionMsg(`Error: ${err.message}`)
      setTimeout(() => setActionMsg(''), 5000)
    }
  }

  async function pruneVolumes() {
    if (!window.confirm('Remove all unused volumes? This will permanently delete their data.')) return
    try {
      const result = await post('/api/volumes/prune')
      const count = result.VolumesDeleted?.length || 0
      setActionMsg(`Pruned ${count} unused volume${count !== 1 ? 's' : ''}`)
      setTimeout(() => setActionMsg(''), 4000)
      fetchVolumes()
    } catch (err) {
      setActionMsg(`Prune error: ${err.message}`)
      setTimeout(() => setActionMsg(''), 5000)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <Nav />
      <main className="max-w-screen-2xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-slate-100">Volumes</h1>
            <p className="text-slate-500 text-sm mt-0.5">{volumes.length} volume{volumes.length !== 1 ? 's' : ''}</p>
          </div>
          <div className="flex items-center gap-2">
            {actionMsg && <span className="text-sm text-slate-400">{actionMsg}</span>}
            <button
              onClick={pruneVolumes}
              className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm px-3 py-1.5 rounded-lg transition-colors"
            >
              🗑 Prune unused
            </button>
            <button onClick={fetchVolumes} className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm px-3 py-1.5 rounded-lg transition-colors">
              ↺ Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 bg-red-950/50 border border-red-800 rounded-lg px-4 py-3 text-red-400 text-sm">{error}</div>
        )}

        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-left">
                <th className="px-4 py-3 text-slate-500 font-medium">Name</th>
                <th className="px-4 py-3 text-slate-500 font-medium">Driver</th>
                <th className="px-4 py-3 text-slate-500 font-medium">Mount Point</th>
                <th className="px-4 py-3 text-slate-500 font-medium">Used By</th>
                <th className="px-4 py-3 text-slate-500 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-800/50">
                    {Array.from({ length: 5 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-800 rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              ) : volumes.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-slate-600">No volumes found</td>
                </tr>
              ) : (
                volumes.map(vol => (
                  <tr key={vol.name} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3 font-mono text-slate-300 text-xs max-w-xs truncate" title={vol.name}>{vol.name}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{vol.driver}</td>
                    <td className="px-4 py-3 font-mono text-slate-600 text-xs max-w-xs truncate" title={vol.mountpoint}>{vol.mountpoint}</td>
                    <td className="px-4 py-3 text-xs">
                      {vol.usedBy.length > 0 ? (
                        <span className="text-green-400">{vol.usedBy.join(', ')}</span>
                      ) : (
                        <span className="text-slate-600">unused</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => removeVolume(vol.name)}
                        disabled={vol.usedBy.length > 0}
                        title={vol.usedBy.length > 0 ? 'Volume is in use' : 'Remove volume'}
                        className="text-slate-600 hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-xs px-2 py-1 rounded"
                      >
                        ✕ Remove
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  )
}

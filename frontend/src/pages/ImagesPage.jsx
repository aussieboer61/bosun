import React, { useState, useEffect, useCallback } from 'react'
import Nav from '../components/Nav.jsx'
import { get, del, post } from '../lib/api.js'

function formatSize(bytes) {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}

function timeAgo(ts) {
  const seconds = Math.floor(Date.now() / 1000 - ts)
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

export default function ImagesPage() {
  const [images, setImages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pruning, setPruning] = useState(false)
  const [actionMsg, setActionMsg] = useState('')

  const fetch = useCallback(async () => {
    try {
      setLoading(true)
      const data = await get('/api/images')
      setImages(data)
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetch() }, [fetch])

  async function removeImage(id, tag) {
    if (!window.confirm(`Remove image ${tag}?`)) return
    try {
      await del(`/api/images/${encodeURIComponent(id)}`)
      setActionMsg(`Removed ${tag}`)
      setTimeout(() => setActionMsg(''), 3000)
      fetch()
    } catch (err) {
      setActionMsg(`Error: ${err.message}`)
      setTimeout(() => setActionMsg(''), 5000)
    }
  }

  async function pruneImages() {
    if (!window.confirm('Remove all unused (dangling) images?')) return
    setPruning(true)
    try {
      const result = await post('/api/images/prune')
      const freed = result.SpaceReclaimed ? ` (freed ${formatSize(result.SpaceReclaimed)})` : ''
      setActionMsg(`Pruned ${result.ImagesDeleted?.length || 0} images${freed}`)
      setTimeout(() => setActionMsg(''), 5000)
      fetch()
    } catch (err) {
      setActionMsg(`Prune error: ${err.message}`)
      setTimeout(() => setActionMsg(''), 5000)
    } finally {
      setPruning(false)
    }
  }

  const totalSize = images.reduce((sum, img) => sum + (img.size || 0), 0)

  return (
    <div className="min-h-screen bg-slate-950">
      <Nav />
      <main className="max-w-screen-2xl mx-auto px-6 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-slate-100">Images</h1>
            <p className="text-slate-500 text-sm mt-0.5">
              {images.length} images · {formatSize(totalSize)} total
            </p>
          </div>
          <div className="flex items-center gap-2">
            {actionMsg && <span className="text-sm text-slate-400">{actionMsg}</span>}
            <button
              onClick={pruneImages}
              disabled={pruning}
              className="bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 text-sm px-3 py-1.5 rounded-lg transition-colors"
            >
              {pruning ? 'Pruning…' : '🗑 Prune unused'}
            </button>
            <button onClick={fetch} className="bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm px-3 py-1.5 rounded-lg transition-colors">
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
                <th className="px-4 py-3 text-slate-500 font-medium">Repository</th>
                <th className="px-4 py-3 text-slate-500 font-medium">ID</th>
                <th className="px-4 py-3 text-slate-500 font-medium">Size</th>
                <th className="px-4 py-3 text-slate-500 font-medium">Created</th>
                <th className="px-4 py-3 text-slate-500 font-medium">Status</th>
                <th className="px-4 py-3 text-slate-500 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-800/50">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-slate-800 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : images.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-600">No images found</td>
                </tr>
              ) : (
                images.map(img => {
                  const tag = img.tags?.[0] || '<none>'
                  return (
                    <tr key={img.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3 font-mono text-slate-300 text-xs">
                        {img.tags && img.tags.length > 0 ? (
                          <div>
                            <span>{img.tags[0]}</span>
                            {img.tags.length > 1 && (
                              <span className="text-slate-600 ml-2">+{img.tags.length - 1} more</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-600">&lt;none&gt;</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-500 text-xs">{img.shortId}</td>
                      <td className="px-4 py-3 text-slate-400 text-xs">{formatSize(img.size)}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{timeAgo(img.created)}</td>
                      <td className="px-4 py-3">
                        {img.inUse ? (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 border border-green-500/30">in use</span>
                        ) : (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-500">unused</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => removeImage(img.id, tag)}
                          className="text-slate-600 hover:text-red-400 transition-colors text-xs px-2 py-1 rounded"
                          disabled={img.inUse}
                          title={img.inUse ? 'Cannot remove — image is in use' : 'Remove image'}
                        >
                          ✕ Remove
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  )
}

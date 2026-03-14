import React, { useState, useEffect, useRef } from 'react'
import { io } from 'socket.io-client'
import Nav from '../components/Nav.jsx'
import ContainerCard from '../components/ContainerCard.jsx'
import ContainerEditor from '../components/ContainerEditor.jsx'
import PullProgressModal from '../components/PullProgressModal.jsx'
import { useContainers } from '../hooks/useContainers.js'
import { post, del } from '../lib/api.js'
import { get } from '../lib/api.js'

function SkeletonCard() {
  return (
    <div className="bg-slate-800 rounded-xl p-4 animate-pulse">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 bg-slate-700 rounded-lg flex-shrink-0" />
        <div className="flex-1">
          <div className="h-4 bg-slate-700 rounded w-2/3 mb-2" />
          <div className="h-3 bg-slate-700 rounded w-1/2" />
        </div>
      </div>
      <div className="h-6 bg-slate-700 rounded-full w-24 mb-3" />
      <div className="flex gap-2">
        <div className="h-8 bg-slate-700 rounded-lg w-16" />
        <div className="h-8 bg-slate-700 rounded-lg w-16" />
        <div className="h-8 bg-slate-700 rounded-lg w-16" />
      </div>
    </div>
  )
}

function CrashToast({ toasts, onDismiss }) {
  if (toasts.length === 0) return null
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map(t => (
        <div key={t.id} className="bg-red-950 border border-red-700 rounded-xl px-4 py-3 shadow-2xl flex items-start gap-3">
          <span className="text-red-400 text-lg leading-none mt-0.5">⚠</span>
          <div className="flex-1 min-w-0">
            <p className="text-red-300 text-sm font-semibold">{t.name}</p>
            <p className="text-red-400 text-xs mt-0.5">{t.message}</p>
          </div>
          <button onClick={() => onDismiss(t.id)} className="text-red-600 hover:text-red-400 text-lg leading-none">✕</button>
        </div>
      ))}
    </div>
  )
}

export default function Dashboard() {
  const { containers, hostInfo, loading, error, refresh } = useContainers()
  const [editingContainer, setEditingContainer] = useState(null)
  const [deployingContainer, setDeployingContainer] = useState(null)
  const [actionError, setActionError] = useState('')
  const [groupByStack, setGroupByStack] = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [bulkMode, setBulkMode] = useState(false)
  const [crashToasts, setCrashToasts] = useState([])
  const toastIdRef = useRef(0)
  const [checkingUpdates, setCheckingUpdates] = useState(false)

  async function checkForUpdates() {
    setCheckingUpdates(true)
    try {
      await post('/api/containers/check-updates', {})
      setTimeout(() => { refresh(); setCheckingUpdates(false) }, 3000)
    } catch {
      setCheckingUpdates(false)
    }
  }

  // Docker events — watch for container crashes
  useEffect(() => {
    async function connect() {
      let token = null
      try {
        const res = await fetch('/api/auth/socket-token', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('bosun_token')}` }
        })
        if (res.ok) token = (await res.json()).token
      } catch {}

      const socket = io('/events', {
        auth: { token },
        transports: ['websocket', 'polling']
      })

      socket.on('event', (evt) => {
        if (evt.Type === 'container' && (evt.Action === 'die' || evt.Action === 'oom')) {
          const name = evt.Actor?.Attributes?.name || evt.Actor?.ID?.slice(0, 12) || 'unknown'
          const exitCode = evt.Actor?.Attributes?.exitCode
          const message = evt.Action === 'oom'
            ? 'Container was killed (OOM)'
            : `Container exited${exitCode !== undefined ? ` (code ${exitCode})` : ''}`
          const id = ++toastIdRef.current
          setCrashToasts(prev => [...prev.slice(-4), { id, name, message }])
          setTimeout(() => setCrashToasts(prev => prev.filter(t => t.id !== id)), 8000)
          refresh()
        }
        if (evt.Type === 'container' && ['start', 'stop', 'destroy'].includes(evt.Action)) {
          refresh()
        }
      })

      return () => socket.disconnect()
    }
    const cleanup = connect()
    return () => { cleanup.then(fn => fn && fn()) }
  }, [refresh])

  async function handleAction(action, container) {
    setActionError('')
    try {
      switch (action) {
        case 'start':
          await post(`/api/containers/${container.id}/start`)
          await refresh()
          break
        case 'stop':
          await post(`/api/containers/${container.id}/stop`)
          await refresh()
          break
        case 'restart':
          await post(`/api/containers/${container.id}/restart`)
          await refresh()
          break
        case 'delete':
          if (!window.confirm(`Remove container "${container.name}"? This cannot be undone.`)) return
          await del(`/api/containers/${container.id}`)
          await refresh()
          break
        case 'edit':
          setEditingContainer(container)
          break
        case 'deploy':
          setDeployingContainer(container)
          await post(`/api/containers/${container.name}/deploy`)
          break
        default:
          break
      }
    } catch (err) {
      setActionError(`${action} failed: ${err.message}`)
      setTimeout(() => setActionError(''), 5000)
    }
  }

  async function handleBulkAction(action) {
    if (selectedIds.size === 0) return
    try {
      await post('/api/containers/bulk', { action, ids: Array.from(selectedIds) })
      setSelectedIds(new Set())
      setBulkMode(false)
      await refresh()
    } catch (err) {
      setActionError(`Bulk ${action} failed: ${err.message}`)
      setTimeout(() => setActionError(''), 5000)
    }
  }

  function toggleSelect(id) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function selectAll() {
    setSelectedIds(new Set(containers.map(c => c.id)))
  }

  function handleEditorSave(config, andDeploy) {
    setEditingContainer(null)
    if (andDeploy) {
      const container = containers.find(c => c.name === config.name) || { name: config.name }
      setDeployingContainer(container)
      post(`/api/containers/${config.name}/deploy`).catch(() => {})
    }
    refresh()
  }

  // Group containers by compose project label
  function groupContainers(list) {
    if (!groupByStack) return { '': list }
    const groups = {}
    for (const c of list) {
      const project = c.labels?.['com.docker.compose.project'] || ''
      if (!groups[project]) groups[project] = []
      groups[project].push(c)
    }
    return groups
  }

  const running = containers.filter(c => c.state === 'running').length
  const groups = groupContainers(containers)

  return (
    <div className="min-h-screen bg-slate-950">
      <Nav hostInfo={hostInfo} runningCount={running} totalCount={containers.length} />

      {/* Host stats bar */}
      {hostInfo && (
        <div className="bg-slate-900 border-b border-slate-800 px-6 py-2">
          <div className="max-w-screen-2xl mx-auto flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-slate-400">
            <span>Docker <span className="text-slate-300">{hostInfo.dockerVersion}</span></span>
            <span>OS <span className="text-slate-300">{hostInfo.os}</span></span>
            <span>CPU <span className="text-slate-300">{hostInfo.cpuCount} cores</span></span>
            <span>RAM <span className="text-slate-300">{hostInfo.memTotal ? Math.round(hostInfo.memTotal / 1024 / 1024 / 1024) + ' GB' : 'N/A'}</span></span>
            <span>
              Containers{' '}
              <span className="text-green-400">{running} running</span>
              <span className="text-slate-500"> / </span>
              <span className="text-slate-300">{hostInfo.totalContainers} total</span>
            </span>
          </div>
        </div>
      )}

      <main className="max-w-screen-2xl mx-auto px-6 py-6">
        {actionError && (
          <div className="mb-4 bg-red-950/50 border border-red-800 rounded-lg px-4 py-3 text-red-400 text-sm flex items-center justify-between">
            <span>{actionError}</span>
            <button onClick={() => setActionError('')} className="text-red-500 hover:text-red-400 ml-4">✕</button>
          </div>
        )}
        {error && (
          <div className="mb-4 bg-red-950/50 border border-red-800 rounded-lg px-4 py-3 text-red-400 text-sm">
            Failed to load containers: {error}
          </div>
        )}

        {/* Header row */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-semibold text-slate-100">Containers</h1>
            <p className="text-slate-500 text-sm mt-0.5">
              {loading ? 'Loading...' : `${containers.length} container${containers.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Check for updates */}
            <button
              onClick={checkForUpdates}
              disabled={checkingUpdates}
              className="px-3 py-1.5 rounded-lg text-sm transition-colors bg-slate-800 text-slate-400 hover:text-slate-100 disabled:opacity-50"
              title="Check all containers for image updates"
            >
              {checkingUpdates ? '⟳ Checking…' : '⟳ Updates'}
            </button>
            {/* Group by stack toggle */}
            <button
              onClick={() => setGroupByStack(g => !g)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                groupByStack ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-100'
              }`}
              title="Group by compose stack"
            >
              ⊞ Stacks
            </button>
            {/* Bulk select toggle */}
            <button
              onClick={() => { setBulkMode(m => !m); setSelectedIds(new Set()) }}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                bulkMode ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-100'
              }`}
            >
              ☑ Select
            </button>
            <button
              onClick={() => setEditingContainer({ __new: true })}
              className="btn-primary flex items-center gap-2"
            >
              <span>＋</span> New Container
            </button>
          </div>
        </div>

        {/* Bulk action toolbar */}
        {bulkMode && (
          <div className="mb-4 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap">
            <span className="text-slate-400 text-sm">{selectedIds.size} selected</span>
            <button onClick={selectAll} className="text-slate-400 hover:text-slate-200 text-sm underline">Select all</button>
            <button onClick={() => setSelectedIds(new Set())} className="text-slate-400 hover:text-slate-200 text-sm underline">Clear</button>
            <div className="flex-1" />
            <button
              onClick={() => handleBulkAction('start')}
              disabled={selectedIds.size === 0}
              className="bg-green-700 hover:bg-green-600 disabled:opacity-40 text-white text-sm px-3 py-1.5 rounded-lg transition-colors"
            >
              ▶ Start
            </button>
            <button
              onClick={() => handleBulkAction('stop')}
              disabled={selectedIds.size === 0}
              className="bg-red-700 hover:bg-red-600 disabled:opacity-40 text-white text-sm px-3 py-1.5 rounded-lg transition-colors"
            >
              ⏹ Stop
            </button>
            <button
              onClick={() => handleBulkAction('restart')}
              disabled={selectedIds.size === 0}
              className="bg-yellow-700 hover:bg-yellow-600 disabled:opacity-40 text-white text-sm px-3 py-1.5 rounded-lg transition-colors"
            >
              ↺ Restart
            </button>
          </div>
        )}

        {/* Grid / groups */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : containers.length === 0 ? (
          <div className="text-center py-24">
            <div className="text-6xl mb-4">⚓</div>
            <h2 className="text-xl font-semibold text-slate-300 mb-2">No containers found</h2>
            <p className="text-slate-500 text-sm mb-6">
              Docker containers will appear here once they are running.
            </p>
            <button onClick={() => setEditingContainer({ __new: true })} className="btn-primary">
              Create first container
            </button>
          </div>
        ) : (
          Object.entries(groups).map(([groupName, groupContainers]) => (
            <div key={groupName} className="mb-8">
              {groupByStack && (
                <div className="flex items-center gap-3 mb-3">
                  <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
                    {groupName || 'Ungrouped'}
                  </h2>
                  <span className="text-xs text-slate-600">{groupContainers.length}</span>
                  <div className="flex-1 h-px bg-slate-800" />
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {groupContainers.map(container => (
                  <ContainerCard
                    key={container.id}
                    container={container}
                    onAction={handleAction}
                    selected={selectedIds.has(container.id)}
                    onSelect={toggleSelect}
                    selectable={bulkMode}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </main>

      {/* Modals */}
      {editingContainer && (
        <ContainerEditor
          container={editingContainer.__new ? null : editingContainer}
          onClose={() => setEditingContainer(null)}
          onSave={handleEditorSave}
        />
      )}

      {deployingContainer && (
        <PullProgressModal
          container={deployingContainer}
          onClose={() => { setDeployingContainer(null); refresh() }}
        />
      )}

      <CrashToast
        toasts={crashToasts}
        onDismiss={id => setCrashToasts(prev => prev.filter(t => t.id !== id))}
      />
    </div>
  )
}

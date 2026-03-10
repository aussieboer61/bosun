import React, { useState } from 'react'
import Nav from '../components/Nav.jsx'
import ContainerCard from '../components/ContainerCard.jsx'
import ContainerEditor from '../components/ContainerEditor.jsx'
import LogViewer from '../components/LogViewer.jsx'
import ConsoleModal from '../components/ConsoleModal.jsx'
import PullProgressModal from '../components/PullProgressModal.jsx'
import { useContainers } from '../hooks/useContainers.js'
import { post, del } from '../lib/api.js'

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

export default function Dashboard() {
  const { containers, hostInfo, loading, error, refresh } = useContainers()
  const [editingContainer, setEditingContainer] = useState(null)
  const [logsContainer, setLogsContainer] = useState(null)
  const [consoleContainer, setConsoleContainer] = useState(null)
  const [deployingContainer, setDeployingContainer] = useState(null)
  const [actionError, setActionError] = useState('')

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
        case 'logs':
          setLogsContainer(container)
          break
        case 'console':
          setConsoleContainer(container)
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

  function handleEditorSave(config, andDeploy) {
    setEditingContainer(null)
    if (andDeploy) {
      // Find the container by name
      const container = containers.find(c => c.name === config.name) || { name: config.name }
      setDeployingContainer(container)
      post(`/api/containers/${config.name}/deploy`).catch(() => {})
    }
    refresh()
  }

  const running = containers.filter(c => c.state === 'running').length

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
        {/* Error notification */}
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
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-slate-100">Containers</h1>
            <p className="text-slate-500 text-sm mt-0.5">
              {loading ? 'Loading...' : `${containers.length} container${containers.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <button
            onClick={() => setEditingContainer({ __new: true })}
            className="btn-primary flex items-center gap-2"
          >
            <span>＋</span> New Container
          </button>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : containers.length === 0 ? (
          <div className="text-center py-24">
            <div className="text-6xl mb-4">⚓</div>
            <h2 className="text-xl font-semibold text-slate-300 mb-2">No containers found</h2>
            <p className="text-slate-500 text-sm mb-6">
              Docker containers will appear here once they are running.<br />
              Excluded containers (Bosun, Caddy, Authentik) are hidden by default.
            </p>
            <button
              onClick={() => setEditingContainer({ __new: true })}
              className="btn-primary"
            >
              Create first container
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {containers.map(container => (
              <ContainerCard
                key={container.id}
                container={container}
                onAction={handleAction}
              />
            ))}
          </div>
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

      {logsContainer && (
        <LogViewer
          container={logsContainer}
          onClose={() => setLogsContainer(null)}
        />
      )}

      {consoleContainer && (
        <ConsoleModal
          container={consoleContainer}
          onClose={() => setConsoleContainer(null)}
        />
      )}

      {deployingContainer && (
        <PullProgressModal
          container={deployingContainer}
          onClose={() => {
            setDeployingContainer(null)
            refresh()
          }}
        />
      )}
    </div>
  )
}

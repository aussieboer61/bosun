import React, { useState, useRef, useEffect } from 'react'

const STATE_COLORS = {
  running: 'bg-green-500/20 text-green-400 border-green-500/30',
  exited: 'bg-red-500/20 text-red-400 border-red-500/30',
  stopped: 'bg-red-500/20 text-red-400 border-red-500/30',
  restarting: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  paused: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  created: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  dead: 'bg-red-900/20 text-red-600 border-red-900/30',
}

function formatUptime(status) {
  if (!status) return ''
  // Docker status string like "Up 2 hours" or "Exited (0) 3 days ago"
  return status
}

function IconPlaceholder({ name }) {
  const colors = [
    'bg-blue-600', 'bg-purple-600', 'bg-green-600', 'bg-orange-600',
    'bg-pink-600', 'bg-cyan-600', 'bg-indigo-600', 'bg-teal-600'
  ]
  const colorIndex = name.charCodeAt(0) % colors.length
  return (
    <div className={`w-10 h-10 ${colors[colorIndex]} rounded-lg flex items-center justify-center flex-shrink-0`}>
      <span className="text-white font-bold text-base uppercase">{name[0] || '?'}</span>
    </div>
  )
}

function Dropdown({ onClose, container, onAction }) {
  const ref = useRef()

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  return (
    <div
      ref={ref}
      className="absolute right-0 top-8 z-50 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl w-44 overflow-hidden"
    >
      <button
        onClick={() => { onClose(); onAction('edit', container) }}
        className="w-full text-left px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-700 transition-colors"
      >
        ✏️ Edit Config
      </button>
      <button
        onClick={() => {
          onClose()
          window.open(`/api/containers/${container.name}/compose`, '_blank')
        }}
        className="w-full text-left px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-700 transition-colors"
      >
        📄 View Compose
      </button>
      <button
        onClick={() => {
          onClose()
          if (window.confirm(`Import config from running container "${container.name}"?`)) {
            fetch(`/api/containers/import/${container.id}`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${localStorage.getItem('bosun_token')}`
              }
            }).then(r => r.json()).then(config => {
              onAction('edit', { ...container, config, __imported: true })
            }).catch(err => alert('Import failed: ' + err.message))
          }
        }}
        className="w-full text-left px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-700 transition-colors"
      >
        📥 Import Config
      </button>
      <div className="border-t border-slate-700" />
      <button
        onClick={() => { onClose(); onAction('delete', container) }}
        className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-red-950/50 transition-colors"
      >
        🗑️ Remove Container
      </button>
    </div>
  )
}

function IconButton({ title, onClick, children, className = '' }) {
  return (
    <button
      title={title}
      onClick={e => { e.stopPropagation(); onClick() }}
      className={`flex items-center justify-center w-8 h-8 rounded-lg transition-colors text-sm ${className}`}
    >
      {children}
    </button>
  )
}

export default function ContainerCard({ container, onAction }) {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [iconError, setIconError] = useState(false)

  const name = container.name || 'unknown'
  const state = container.state || 'unknown'
  const config = container.config || null
  const isRunning = state === 'running'
  const statusClass = STATE_COLORS[state] || 'bg-slate-500/20 text-slate-400 border-slate-500/30'
  const hasUpdate = container.updateInfo?.hasUpdate

  return (
    <div
      className="bg-slate-800 rounded-xl p-4 hover:bg-slate-800/80 transition-colors duration-150 cursor-pointer relative select-none"
      onClick={() => onAction('edit', container)}
    >
      {/* Top row: icon + name + menu */}
      <div className="flex items-start gap-3 mb-2.5">
        <div className="flex-shrink-0 mt-0.5">
          {config?.icon && !iconError ? (
            <img
              src={config.icon}
              alt={name}
              className="w-10 h-10 rounded-lg object-contain bg-slate-700"
              onError={() => setIconError(true)}
            />
          ) : (
            <IconPlaceholder name={name} />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-slate-100 text-sm leading-tight truncate">{name}</h3>
          <p className="text-slate-500 text-xs mt-0.5 truncate" title={container.image}>
            {container.image || 'unknown image'}
          </p>
        </div>

        <div className="relative flex-shrink-0">
          <button
            onClick={e => { e.stopPropagation(); setDropdownOpen(o => !o) }}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-700 transition-colors text-base"
          >
            ⋮
          </button>
          {dropdownOpen && (
            <Dropdown
              container={container}
              onAction={onAction}
              onClose={() => setDropdownOpen(false)}
            />
          )}
        </div>
      </div>

      {/* Status badges */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs border font-medium ${statusClass}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${
            isRunning ? 'bg-green-400' :
            state === 'restarting' ? 'bg-yellow-400' :
            'bg-red-400'
          }`} />
          {state}
        </span>
        {hasUpdate && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border bg-blue-500/20 text-blue-400 border-blue-500/30 font-medium">
            ↑ update
          </span>
        )}
      </div>

      {/* Uptime */}
      {container.status && (
        <p className="text-slate-500 text-xs mb-3 leading-tight">
          {formatUptime(container.status)}
        </p>
      )}

      {/* Action buttons */}
      <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
        {/* Start/Stop toggle */}
        {isRunning ? (
          <IconButton
            title="Stop"
            onClick={() => onAction('stop', container)}
            className="bg-slate-700 hover:bg-red-600 text-slate-300 hover:text-white"
          >
            ⏹
          </IconButton>
        ) : (
          <IconButton
            title="Start"
            onClick={() => onAction('start', container)}
            className="bg-slate-700 hover:bg-green-600 text-slate-300 hover:text-white"
          >
            ▶
          </IconButton>
        )}

        <IconButton
          title="Restart"
          onClick={() => onAction('restart', container)}
          className="bg-slate-700 hover:bg-yellow-600/80 text-slate-300 hover:text-white"
        >
          ↺
        </IconButton>

        {/* Update button - show if config exists */}
        {config && (
          <IconButton
            title={hasUpdate ? 'Update available — click to deploy' : 'Deploy / Update'}
            onClick={() => onAction('deploy', container)}
            className={`text-slate-300 hover:text-white ${hasUpdate ? 'bg-blue-600 hover:bg-blue-500' : 'bg-slate-700 hover:bg-blue-600'}`}
          >
            ↑
          </IconButton>
        )}

        <IconButton
          title="View Logs"
          onClick={() => onAction('logs', container)}
          className="bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white"
        >
          ≡
        </IconButton>

        <IconButton
          title="Open Console"
          onClick={() => onAction('console', container)}
          className="bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white"
        >
          ⌨
        </IconButton>

        {/* WebUI link */}
        {config?.webUI && (
          <a
            href={config.webUI}
            target="_blank"
            rel="noopener noreferrer"
            title="Open Web UI"
            onClick={e => e.stopPropagation()}
            className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white transition-colors text-sm"
          >
            ↗
          </a>
        )}
      </div>
    </div>
  )
}

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { io } from 'socket.io-client'

export default function LogViewer({ container, onClose }) {
  const [logs, setLogs] = useState([])
  const [search, setSearch] = useState('')
  const [autoScroll, setAutoScroll] = useState(true)
  const [connected, setConnected] = useState(false)
  const logRef = useRef()
  const socketRef = useRef()
  const autoScrollRef = useRef(true)

  useEffect(() => {
    autoScrollRef.current = autoScroll
  }, [autoScroll])

  useEffect(() => {
    const token = localStorage.getItem('bosun_token')
    const socket = io('/logs', {
      auth: { token },
      transports: ['websocket', 'polling']
    })
    socketRef.current = socket

    socket.on('connect', () => {
      setConnected(true)
      socket.emit('start', { containerId: container.id })
    })

    socket.on('data', (chunk) => {
      const lines = chunk.split('\n')
      setLogs(prev => {
        const newLogs = [...prev]
        for (const line of lines) {
          if (line.trim()) newLogs.push(line)
        }
        // Limit to last 5000 lines to avoid memory issues
        if (newLogs.length > 5000) {
          return newLogs.slice(newLogs.length - 5000)
        }
        return newLogs
      })
    })

    socket.on('end', () => {
      setLogs(prev => [...prev, '--- Log stream ended ---'])
    })

    socket.on('error', ({ message }) => {
      setLogs(prev => [...prev, `[error] ${message}`])
    })

    socket.on('disconnect', () => {
      setConnected(false)
    })

    return () => {
      socket.disconnect()
    }
  }, [container.id])

  // Auto-scroll
  useEffect(() => {
    if (autoScrollRef.current && logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [logs])

  function handleScroll() {
    if (!logRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = logRef.current
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50
    if (!isAtBottom && autoScrollRef.current) {
      setAutoScroll(false)
    }
  }

  function resumeScroll() {
    setAutoScroll(true)
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }

  function downloadLogs() {
    const text = logs.join('\n')
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${container.name}-logs-${new Date().toISOString().slice(0, 19)}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Filter logs by search term
  const filteredLogs = search
    ? logs.filter(line => line.toLowerCase().includes(search.toLowerCase()))
    : logs

  function highlightSearch(line) {
    if (!search) return line
    const idx = line.toLowerCase().indexOf(search.toLowerCase())
    if (idx === -1) return line
    return (
      <>
        {line.slice(0, idx)}
        <mark className="bg-yellow-400 text-slate-900 rounded px-0.5">{line.slice(idx, idx + search.length)}</mark>
        {line.slice(idx + search.length)}
      </>
    )
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-3 bg-slate-900 border-b border-slate-800 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-slate-100 font-semibold">{container.name}</span>
          <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-red-500'}`} title={connected ? 'Live' : 'Disconnected'} />
          <span className="text-slate-500 text-xs">{connected ? 'Live' : 'Disconnected'}</span>
        </div>

        <div className="flex-1 max-w-md">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search logs..."
            className="input-field text-xs py-1.5"
          />
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <span className="text-slate-500 text-xs">{filteredLogs.length} lines</span>
          <button
            onClick={downloadLogs}
            className="btn-ghost text-xs px-2 py-1.5"
            title="Download logs"
          >
            ↓ Download
          </button>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100 transition-colors p-1 ml-2">
            ✕ Close
          </button>
        </div>
      </div>

      {/* Log area */}
      <div
        ref={logRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-6 py-4 font-mono text-xs text-green-400 leading-5"
      >
        {filteredLogs.length === 0 ? (
          <div className="text-slate-600">
            {connected ? 'Waiting for logs...' : 'Connecting...'}
          </div>
        ) : (
          filteredLogs.map((line, i) => (
            <div key={i} className={`whitespace-pre-wrap break-all ${
              line.includes('ERROR') || line.includes('error') || line.includes('FATAL')
                ? 'text-red-400'
                : line.includes('WARN') || line.includes('warn')
                ? 'text-yellow-400'
                : ''
            }`}>
              {highlightSearch(line)}
            </div>
          ))
        )}
      </div>

      {/* Resume scroll button */}
      {!autoScroll && (
        <button
          onClick={resumeScroll}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 bg-blue-600 hover:bg-blue-500 text-white text-sm px-4 py-2 rounded-full shadow-lg transition-colors flex items-center gap-2"
        >
          ↓ Resume auto-scroll
        </button>
      )}
    </div>
  )
}

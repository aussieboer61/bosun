import React, { useEffect, useRef, useState } from 'react'
import { io } from 'socket.io-client'
import '@xterm/xterm/css/xterm.css'

export default function ConsoleModal({ container, onClose }) {
  const termRef = useRef()
  const xtermRef = useRef()
  const fitAddonRef = useRef()
  const socketRef = useRef()
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let socket = null
    let term = null
    let fitAddon = null

    async function init() {
      // Dynamically import xterm (avoids SSR issues and ensures DOM is ready)
      const { Terminal } = await import('@xterm/xterm')
      const { FitAddon } = await import('@xterm/addon-fit')


      if (!termRef.current) return

      term = new Terminal({
        cursorBlink: true,
        fontSize: 13,
        fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", "Courier New", monospace',
        theme: {
          background: '#0a0f1a',
          foreground: '#e2e8f0',
          cursor: '#3b82f6',
          black: '#1e293b',
          red: '#ef4444',
          green: '#22c55e',
          yellow: '#eab308',
          blue: '#3b82f6',
          magenta: '#a855f7',
          cyan: '#06b6d4',
          white: '#e2e8f0',
          brightBlack: '#475569',
          brightRed: '#f87171',
          brightGreen: '#4ade80',
          brightYellow: '#facc15',
          brightBlue: '#60a5fa',
          brightMagenta: '#c084fc',
          brightCyan: '#22d3ee',
          brightWhite: '#f8fafc',
        },
        scrollback: 2000,
        allowTransparency: false,
        convertEol: true,
      })

      fitAddon = new FitAddon()
      term.loadAddon(fitAddon)
      term.open(termRef.current)
      fitAddon.fit()

      xtermRef.current = term
      fitAddonRef.current = fitAddon

      // Socket.io connection
      const token = localStorage.getItem('bosun_token')
      socket = io('/console', {
        auth: { token },
        transports: ['websocket', 'polling']
      })
      socketRef.current = socket

      socket.on('connect', () => {
        setConnected(true)
        socket.emit('start', { containerId: container.id })
      })

      socket.on('output', (data) => {
        if (term) {
          term.write(typeof data === 'string' ? data : new Uint8Array(data))
        }
      })

      socket.on('exit', () => {
        if (term) {
          term.writeln('\r\n\r\n[Session terminated]')
        }
        setConnected(false)
      })

      socket.on('disconnect', () => {
        setConnected(false)
      })

      socket.on('connect_error', (err) => {
        setError(`Connection error: ${err.message}`)
        setConnected(false)
      })

      // Send input to socket
      term.onData((data) => {
        if (socket && socket.connected) {
          socket.emit('input', data)
        }
      })

      // Handle terminal resize
      term.onResize(({ cols, rows }) => {
        if (socket && socket.connected) {
          socket.emit('resize', { cols, rows })
        }
      })
    }

    init().catch(err => {
      setError(`Failed to initialize terminal: ${err.message}`)
    })

    // Window resize handler
    function handleResize() {
      if (fitAddonRef.current) {
        try {
          fitAddonRef.current.fit()
        } catch {}
      }
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      if (socket) socket.disconnect()
      if (term) term.dispose()
    }
  }, [container.id])

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-3 bg-slate-900 border-b border-slate-800 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-slate-100 font-semibold">{container.name}</span>
          <span className="text-slate-500 text-xs">exec: /bin/sh</span>
          <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-red-500'}`} />
          <span className={`text-xs ${connected ? 'text-green-400' : 'text-red-400'}`}>
            {connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
        <div className="ml-auto">
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-100 transition-colors px-3 py-1.5 rounded-lg text-sm"
          >
            ✕ Close
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="px-6 py-3 bg-red-950/50 border-b border-red-800 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Terminal */}
      <div className="flex-1 p-2 bg-[#0a0f1a] overflow-hidden">
        <div ref={termRef} className="w-full h-full" />
      </div>
    </div>
  )
}

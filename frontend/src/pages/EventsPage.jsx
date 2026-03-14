import React, { useState, useEffect, useRef } from 'react'
import { io } from 'socket.io-client'
import Nav from '../components/Nav.jsx'

const TYPE_COLORS = {
  container: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
  image: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
  network: 'text-green-400 bg-green-500/10 border-green-500/30',
  volume: 'text-orange-400 bg-orange-500/10 border-orange-500/30',
  plugin: 'text-slate-400 bg-slate-500/10 border-slate-500/30',
}

const ACTION_COLORS = {
  die: 'text-red-400',
  kill: 'text-red-400',
  oom: 'text-red-500 font-semibold',
  stop: 'text-yellow-400',
  start: 'text-green-400',
  create: 'text-green-300',
  destroy: 'text-red-300',
  pull: 'text-blue-300',
  push: 'text-blue-300',
}

const ALL_TYPES = ['container', 'image', 'network', 'volume']

export default function EventsPage() {
  const [events, setEvents] = useState([])
  const [connected, setConnected] = useState(false)
  const [filter, setFilter] = useState('all')
  const [paused, setPaused] = useState(false)
  const pausedRef = useRef(false)
  const listRef = useRef()
  const autoScrollRef = useRef(true)

  useEffect(() => {
    pausedRef.current = paused
  }, [paused])

  useEffect(() => {
    let socket = null

    async function connect() {
      let token = null
      try {
        const res = await fetch('/api/auth/socket-token', {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('bosun_token')}` }
        })
        if (res.ok) token = (await res.json()).token
      } catch {}

      socket = io('/events', {
        auth: { token },
        transports: ['websocket', 'polling']
      })

      socket.on('connect', () => setConnected(true))
      socket.on('disconnect', () => setConnected(false))

      socket.on('event', (evt) => {
        if (pausedRef.current) return
        setEvents(prev => {
          const next = [...prev, { ...evt, _key: Date.now() + Math.random() }]
          return next.slice(-500) // keep last 500
        })
      })
    }

    connect()
    return () => { if (socket) socket.disconnect() }
  }, [])

  // Auto-scroll
  useEffect(() => {
    if (autoScrollRef.current && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight
    }
  }, [events])

  function handleScroll() {
    if (!listRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = listRef.current
    autoScrollRef.current = scrollHeight - scrollTop - clientHeight < 40
  }

  const filtered = filter === 'all' ? events : events.filter(e => e.Type === filter)

  function formatTime(ts) {
    if (!ts) return ''
    return new Date(ts * 1000).toLocaleTimeString()
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      <Nav />
      <main className="max-w-screen-2xl mx-auto px-6 py-6 flex-1 flex flex-col w-full">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-semibold text-slate-100">Events</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-red-500'}`} />
              <span className="text-slate-500 text-sm">{connected ? 'Live' : 'Disconnected'}</span>
              <span className="text-slate-600 text-xs">· {filtered.length} events</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Type filter */}
            <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1">
              {['all', ...ALL_TYPES].map(t => (
                <button
                  key={t}
                  onClick={() => setFilter(t)}
                  className={`px-2.5 py-1 rounded text-xs capitalize transition-colors ${
                    filter === t ? 'bg-slate-700 text-slate-100' : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <button
              onClick={() => setPaused(p => !p)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                paused ? 'bg-yellow-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-100'
              }`}
            >
              {paused ? '▶ Resume' : '⏸ Pause'}
            </button>
            <button
              onClick={() => setEvents([])}
              className="bg-slate-800 hover:bg-slate-700 text-slate-400 text-sm px-3 py-1.5 rounded-lg transition-colors"
            >
              Clear
            </button>
          </div>
        </div>

        <div
          ref={listRef}
          onScroll={handleScroll}
          className="flex-1 bg-slate-900 border border-slate-800 rounded-xl overflow-y-auto font-mono text-xs"
          style={{ minHeight: 0, maxHeight: 'calc(100vh - 220px)' }}
        >
          {filtered.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-slate-600">
              {connected ? 'Waiting for events…' : 'Connecting…'}
            </div>
          ) : (
            <table className="w-full">
              <tbody>
                {filtered.map(evt => {
                  const typeColor = TYPE_COLORS[evt.Type] || 'text-slate-400 bg-slate-500/10 border-slate-500/30'
                  const actionColor = ACTION_COLORS[evt.Action] || 'text-slate-300'
                  const actorName = evt.Actor?.Attributes?.name || evt.Actor?.ID?.slice(0, 12) || ''
                  return (
                    <tr key={evt._key} className="border-b border-slate-800/40 hover:bg-slate-800/20">
                      <td className="px-3 py-1.5 text-slate-600 whitespace-nowrap w-24">{formatTime(evt.time)}</td>
                      <td className="px-3 py-1.5 w-24">
                        <span className={`px-1.5 py-0.5 rounded border text-xs ${typeColor}`}>{evt.Type}</span>
                      </td>
                      <td className={`px-3 py-1.5 w-28 ${actionColor}`}>{evt.Action}</td>
                      <td className="px-3 py-1.5 text-slate-300">{actorName}</td>
                      <td className="px-3 py-1.5 text-slate-600 text-right pr-4">
                        {evt.Actor?.Attributes?.exitCode !== undefined && (
                          <span>exit {evt.Actor.Attributes.exitCode}</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  )
}

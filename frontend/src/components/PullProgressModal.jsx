import React, { useState, useEffect, useRef } from 'react'
import { io } from 'socket.io-client'

export default function PullProgressModal({ container, onClose }) {
  const [layers, setLayers] = useState({})
  const [logs, setLogs] = useState([])
  const [currentStep, setCurrentStep] = useState('Connecting...')
  const [done, setDone] = useState(false)
  const [hasError, setHasError] = useState(false)
  const logRef = useRef()
  const socketRef = useRef()

  useEffect(() => {
    const token = localStorage.getItem('bosun_token')
    const socket = io('/pull', {
      auth: { token },
      transports: ['websocket', 'polling']
    })
    socketRef.current = socket

    socket.on('connect', () => {
      setCurrentStep('Connected — waiting for events...')
    })

    socket.on('event', (data) => {
      const name = container.name

      // Only process events for our container
      if (data.name && data.name !== name) return

      switch (data.type) {
        case 'step':
          setCurrentStep(data.message)
          setLogs(l => [...l, `[step] ${data.message}`])
          break

        case 'layer':
          if (data.id) {
            setLayers(prev => ({
              ...prev,
              [data.id]: {
                id: data.id,
                status: data.status || '',
                progress: data.progress || null
              }
            }))
          }
          break

        case 'log':
          setLogs(l => [...l, data.message])
          break

        case 'complete':
          setCurrentStep(data.message || 'Complete!')
          setLogs(l => [...l, `✓ ${data.message || 'Deployment complete'}`])
          setDone(true)
          break

        case 'error':
          setCurrentStep(`Error: ${data.message}`)
          setLogs(l => [...l, `✗ Error: ${data.message}`])
          setHasError(true)
          setDone(true)
          break

        default:
          break
      }
    })

    socket.on('disconnect', () => {
      if (!done) {
        setCurrentStep('Connection lost')
      }
    })

    socket.on('connect_error', (err) => {
      setCurrentStep(`Connection error: ${err.message}`)
      setHasError(true)
    })

    return () => {
      socket.disconnect()
    }
  }, [container.name])

  // Auto-scroll log area
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [logs])

  const layerList = Object.values(layers)
  const activeLayerCount = layerList.filter(l =>
    l.status && !['Pull complete', 'Already exists', 'Layer already exists'].includes(l.status)
  ).length

  function getLayerColor(status) {
    if (!status) return 'text-slate-500'
    if (status === 'Pull complete' || status === 'Already exists') return 'text-green-400'
    if (status.includes('Download') || status.includes('Extracting')) return 'text-blue-400'
    if (status.includes('Waiting')) return 'text-slate-500'
    return 'text-slate-300'
  }

  function getProgress(layer) {
    if (!layer.progress) return null
    const { current, total } = layer.progress
    if (!total || total === 0) return null
    return Math.round((current / total) * 100)
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-4">
      <div className={`w-full max-w-2xl bg-slate-900 rounded-2xl shadow-2xl flex flex-col max-h-[85vh] border ${
        hasError ? 'border-red-800' : done ? 'border-green-800' : 'border-slate-800'
      }`}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div>
            <h2 className="font-semibold text-slate-100">
              Deploying <span className="text-blue-400">{container.name}</span>
            </h2>
            <p className={`text-sm mt-0.5 ${
              hasError ? 'text-red-400' : done ? 'text-green-400' : 'text-slate-400'
            }`}>
              {currentStep}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!done && (
              <div className="flex items-center gap-2 text-blue-400 text-sm">
                <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                <span>{activeLayerCount > 0 ? `${activeLayerCount} active` : 'Working...'}</span>
              </div>
            )}
            <button
              onClick={onClose}
              disabled={!done}
              className="text-slate-400 hover:text-slate-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed p-1 ml-2"
              title={done ? 'Close' : 'Wait for completion to close'}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Layer progress */}
        {layerList.length > 0 && (
          <div className="px-6 py-3 border-b border-slate-800 max-h-48 overflow-y-auto">
            <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
              Image Layers ({layerList.length})
            </h3>
            <div className="space-y-1.5">
              {layerList.map(layer => {
                const pct = getProgress(layer)
                return (
                  <div key={layer.id}>
                    <div className="flex items-center justify-between text-xs mb-0.5">
                      <span className="font-mono text-slate-500">{layer.id}</span>
                      <span className={getLayerColor(layer.status)}>{layer.status}</span>
                    </div>
                    {pct !== null && (
                      <div className="h-1 bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all duration-300"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Log output */}
        <div
          ref={logRef}
          className="flex-1 overflow-y-auto px-6 py-4 font-mono text-xs text-green-400 bg-slate-950 rounded-b-2xl"
          style={{ minHeight: '200px' }}
        >
          {logs.length === 0 ? (
            <span className="text-slate-600">Waiting for output...</span>
          ) : (
            logs.map((line, i) => (
              <div
                key={i}
                className={`leading-5 ${
                  line.startsWith('✗') ? 'text-red-400' :
                  line.startsWith('✓') ? 'text-green-400' :
                  line.startsWith('[step]') ? 'text-blue-400' :
                  'text-green-400'
                }`}
              >
                {line}
              </div>
            ))
          )}
          {!done && (
            <span className="text-slate-600 animate-pulse">▋</span>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            disabled={!done}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
              hasError
                ? 'bg-red-600 hover:bg-red-500 text-white'
                : done
                ? 'bg-green-600 hover:bg-green-500 text-white'
                : 'bg-slate-700 text-slate-400'
            }`}
          >
            {done ? (hasError ? 'Close (Error)' : 'Done') : 'Please wait...'}
          </button>
        </div>
      </div>
    </div>
  )
}

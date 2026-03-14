import React, { useState, useEffect } from 'react'
import { get, post } from '../lib/api.js'

const RESTART_POLICIES = ['unless-stopped', 'always', 'on-failure', 'no']

function TableRow({ children, onDelete }) {
  return (
    <tr className="border-b border-slate-700 last:border-0">
      {children}
      <td className="px-2 py-2">
        <button
          type="button"
          onClick={onDelete}
          className="text-red-500 hover:text-red-400 transition-colors p-1"
          title="Remove"
        >
          ✕
        </button>
      </td>
    </tr>
  )
}

function TableInput({ value, onChange, placeholder, type = 'text', className = '' }) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className={`bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-slate-100 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 w-full ${className}`}
    />
  )
}

function SectionHeader({ title }) {
  return (
    <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3 mt-6 first:mt-0">{title}</h3>
  )
}

function Toggle({ value, onChange, label }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer">
      <div
        onClick={() => onChange(!value)}
        className={`relative w-10 h-5 rounded-full transition-colors duration-200 ${value ? 'bg-blue-600' : 'bg-slate-600'}`}
      >
        <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${value ? 'translate-x-5' : 'translate-x-0'}`} />
      </div>
      <span className="text-sm text-slate-300">{label}</span>
    </label>
  )
}

export default function ContainerEditor({ container, onClose, onSave }) {
  const isNew = !container || container.__new

  const [config, setConfig] = useState({
    name: '',
    repository: '',
    registry: '',
    icon: '',
    webUI: '',
    autoStart: false,
    autoUpdate: false,
    autoUpdateSchedule: '0 3 * * *',
    networks: ['bridge'],
    command: '',
    privileged: false,
    restartPolicy: 'unless-stopped',
    environment: [],
    volumes: [],
    ports: [],
    labels: [],
    sysctls: [],
    dependsOn: []
  })

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [iconError, setIconError] = useState(false)
  const [activeTab, setActiveTab] = useState('general')

  useEffect(() => {
    if (!isNew && container) {
      loadConfig()
    }
  }, [container])

  async function loadConfig() {
    setLoading(true)
    try {
      if (container.__imported && container.config) {
        setConfig(normalizeLoaded(container.config))
        return
      }
      if (container.config) {
        setConfig(normalizeLoaded(container.config))
      } else if (container.name) {
        try {
          const cfg = await get(`/api/containers/configs/${container.name}`)
          setConfig(normalizeLoaded(cfg))
        } catch {
          if (container.image) {
            setConfig(c => ({ ...c, name: container.name, repository: container.image }))
          }
        }
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // Ensure new fields have defaults when loading older configs
  function normalizeLoaded(cfg) {
    return {
      sysctls: [],
      dependsOn: [],
      ...cfg,
      volumes: (cfg.volumes || []).map(v => ({
        type: 'bind',
        volumeName: '',
        external: false,
        ...v
      })),
      ports: (cfg.ports || []).map(p => ({
        hostIP: '',
        ...p
      }))
    }
  }

  function updateConfig(key, value) {
    setConfig(c => ({ ...c, [key]: value }))
  }

  // Env vars
  function addEnv() {
    setConfig(c => ({ ...c, environment: [...c.environment, { name: '', value: '', description: '' }] }))
  }
  function updateEnv(i, key, value) {
    setConfig(c => {
      const env = [...c.environment]
      env[i] = { ...env[i], [key]: value }
      return { ...c, environment: env }
    })
  }
  function removeEnv(i) {
    setConfig(c => ({ ...c, environment: c.environment.filter((_, idx) => idx !== i) }))
  }

  // Volumes
  function addVolume() {
    setConfig(c => ({ ...c, volumes: [...c.volumes, { type: 'bind', hostPath: '', containerPath: '', mode: 'rw', description: '', volumeName: '', external: false }] }))
  }
  function updateVolume(i, key, value) {
    setConfig(c => {
      const vols = [...c.volumes]
      vols[i] = { ...vols[i], [key]: value }
      return { ...c, volumes: vols }
    })
  }
  function removeVolume(i) {
    setConfig(c => ({ ...c, volumes: c.volumes.filter((_, idx) => idx !== i) }))
  }

  // Ports
  function addPort() {
    setConfig(c => ({ ...c, ports: [...c.ports, { hostPort: '', containerPort: '', hostIP: '', protocol: 'tcp', description: '' }] }))
  }
  function updatePort(i, key, value) {
    setConfig(c => {
      const ports = [...c.ports]
      ports[i] = { ...ports[i], [key]: value }
      return { ...c, ports: ports }
    })
  }
  function removePort(i) {
    setConfig(c => ({ ...c, ports: c.ports.filter((_, idx) => idx !== i) }))
  }

  // Labels
  function addLabel() {
    setConfig(c => ({ ...c, labels: [...c.labels, { name: '', value: '' }] }))
  }
  function updateLabel(i, key, value) {
    setConfig(c => {
      const labels = [...c.labels]
      labels[i] = { ...labels[i], [key]: value }
      return { ...c, labels: labels }
    })
  }
  function removeLabel(i) {
    setConfig(c => ({ ...c, labels: c.labels.filter((_, idx) => idx !== i) }))
  }

  // Networks
  function addNetwork() {
    setConfig(c => ({ ...c, networks: [...(c.networks || []), ''] }))
  }
  function updateNetwork(i, value) {
    setConfig(c => {
      const nets = [...(c.networks || [])]
      nets[i] = value
      return { ...c, networks: nets }
    })
  }
  function removeNetwork(i) {
    setConfig(c => ({ ...c, networks: (c.networks || []).filter((_, idx) => idx !== i) }))
  }

  // Sysctls
  function addSysctl() {
    setConfig(c => ({ ...c, sysctls: [...(c.sysctls || []), { key: '', value: '' }] }))
  }
  function updateSysctl(i, key, value) {
    setConfig(c => {
      const sysctls = [...(c.sysctls || [])]
      sysctls[i] = { ...sysctls[i], [key]: value }
      return { ...c, sysctls }
    })
  }
  function removeSysctl(i) {
    setConfig(c => ({ ...c, sysctls: (c.sysctls || []).filter((_, idx) => idx !== i) }))
  }

  // DependsOn
  function addDependsOn() {
    setConfig(c => ({ ...c, dependsOn: [...(c.dependsOn || []), ''] }))
  }
  function updateDependsOn(i, value) {
    setConfig(c => {
      const deps = [...(c.dependsOn || [])]
      deps[i] = value
      return { ...c, dependsOn: deps }
    })
  }
  function removeDependsOn(i) {
    setConfig(c => ({ ...c, dependsOn: (c.dependsOn || []).filter((_, idx) => idx !== i) }))
  }

  async function handleSave(andDeploy = false) {
    setError('')
    if (!config.name) { setError('Container name is required'); return }
    if (!config.repository) { setError('Image repository is required'); return }

    // Port conflict check — compare config ports against running containers
    const configHostPorts = (config.ports || [])
      .filter(p => p.hostPort)
      .map(p => String(p.hostPort))

    if (configHostPorts.length > 0) {
      try {
        const { containers } = await get('/api/containers')
        const conflicts = []
        for (const c of containers) {
          if (c.name === config.name) continue // skip self (editing existing)
          for (const p of (c.ports || [])) {
            const pub = String(p.PublicPort || '')
            if (pub && configHostPorts.includes(pub)) {
              conflicts.push({ port: pub, container: c.name })
            }
          }
        }
        if (conflicts.length > 0) {
          const lines = conflicts.map(c => `  • Port ${c.port} is used by "${c.container}"`).join('\n')
          const ok = window.confirm(
            `Port conflict detected:\n\n${lines}\n\nDeploy anyway?`
          )
          if (!ok) return
        }
      } catch {
        // non-fatal — proceed if check fails
      }
    }

    setSaving(true)
    try {
      await post(`/api/containers/configs/${config.name}`, config)
      onSave(config, andDeploy)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const advancedCount = (config.sysctls || []).length + (config.dependsOn || []).length

  const tabs = [
    { id: 'general', label: 'General' },
    { id: 'env', label: `Env (${config.environment.length})` },
    { id: 'volumes', label: `Volumes (${config.volumes.length})` },
    { id: 'ports', label: `Ports (${config.ports.length})` },
    { id: 'labels', label: `Labels (${config.labels.length})` },
    { id: 'advanced', label: advancedCount > 0 ? `Advanced (${advancedCount})` : 'Advanced' },
    { id: 'behaviour', label: 'Behaviour' },
  ]

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-start justify-end">
      <div className="w-full max-w-3xl h-full bg-slate-900 border-l border-slate-800 flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">
              {isNew ? 'New Container' : `Edit: ${container.name}`}
            </h2>
            <p className="text-slate-500 text-sm">Configure container settings</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100 transition-colors p-1">
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-800 px-6 gap-1 flex-shrink-0 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="text-slate-500 text-sm">Loading configuration...</div>
          ) : (
            <>
              {/* General Tab */}
              {activeTab === 'general' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1.5">Container Name *</label>
                      <input
                        type="text"
                        value={config.name}
                        onChange={e => updateConfig('name', e.target.value)}
                        disabled={!isNew && !container.__imported}
                        className="input-field disabled:opacity-50 disabled:cursor-not-allowed"
                        placeholder="my-container"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1.5">Image / Repository *</label>
                      <input
                        type="text"
                        value={config.repository}
                        onChange={e => updateConfig('repository', e.target.value)}
                        className="input-field"
                        placeholder="nginx:latest"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">Registry URL</label>
                    <input
                      type="text"
                      value={config.registry}
                      onChange={e => updateConfig('registry', e.target.value)}
                      className="input-field"
                      placeholder="https://registry-1.docker.io"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">Networks</label>
                    <div className="space-y-2">
                      {(config.networks || []).map((net, i) => (
                        <div key={i} className="flex gap-2 items-center">
                          <input
                            type="text"
                            value={net}
                            onChange={e => updateNetwork(i, e.target.value)}
                            className="input-field flex-1"
                            placeholder="bridge"
                          />
                          <button
                            type="button"
                            onClick={() => removeNetwork(i)}
                            disabled={(config.networks || []).length <= 1}
                            className="text-red-500 hover:text-red-400 transition-colors p-1 disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Remove network"
                          >✕</button>
                        </div>
                      ))}
                    </div>
                    <button type="button" onClick={addNetwork} className="mt-2 btn-secondary text-sm">
                      + Add Network
                    </button>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">Command Override</label>
                    <input
                      type="text"
                      value={config.command || ''}
                      onChange={e => updateConfig('command', e.target.value)}
                      className="input-field font-mono text-xs"
                      placeholder="leave empty to use image default"
                    />
                    <p className="text-slate-600 text-xs mt-1">e.g. <code>--base-url /app</code> or <code>server</code></p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">Icon URL</label>
                    <div className="flex gap-3 items-center">
                      <input
                        type="text"
                        value={config.icon}
                        onChange={e => { updateConfig('icon', e.target.value); setIconError(false) }}
                        className="input-field"
                        placeholder="https://example.com/icon.png"
                      />
                      <div className="w-10 h-10 rounded-lg bg-slate-700 flex-shrink-0 overflow-hidden">
                        {config.icon && !iconError ? (
                          <img
                            src={config.icon}
                            alt="icon"
                            className="w-full h-full object-contain"
                            onError={() => setIconError(true)}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs">icon</div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">WebUI URL</label>
                    <input
                      type="text"
                      value={config.webUI}
                      onChange={e => updateConfig('webUI', e.target.value)}
                      className="input-field"
                      placeholder="https://myapp.example.com"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1.5">Restart Policy</label>
                      <select
                        value={config.restartPolicy}
                        onChange={e => updateConfig('restartPolicy', e.target.value)}
                        className="input-field"
                      >
                        {RESTART_POLICIES.map(p => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-end pb-2">
                      <Toggle
                        value={config.privileged}
                        onChange={v => updateConfig('privileged', v)}
                        label="Privileged mode"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Environment Variables Tab */}
              {activeTab === 'env' && (
                <div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-700">
                          <th className="text-left px-2 py-2 text-slate-400 font-medium">Name</th>
                          <th className="text-left px-2 py-2 text-slate-400 font-medium">Value</th>
                          <th className="text-left px-2 py-2 text-slate-400 font-medium">Description</th>
                          <th className="w-8" />
                        </tr>
                      </thead>
                      <tbody>
                        {config.environment.map((env, i) => (
                          <TableRow key={i} onDelete={() => removeEnv(i)}>
                            <td className="px-2 py-2">
                              <TableInput value={env.name} onChange={v => updateEnv(i, 'name', v)} placeholder="VAR_NAME" />
                            </td>
                            <td className="px-2 py-2">
                              <TableInput value={env.value} onChange={v => updateEnv(i, 'value', v)} placeholder="value" />
                            </td>
                            <td className="px-2 py-2">
                              <TableInput value={env.description} onChange={v => updateEnv(i, 'description', v)} placeholder="optional note" />
                            </td>
                          </TableRow>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button type="button" onClick={addEnv} className="mt-3 btn-secondary text-sm">
                    + Add Variable
                  </button>
                </div>
              )}

              {/* Volumes Tab */}
              {activeTab === 'volumes' && (
                <div>
                  <div className="space-y-3">
                    {config.volumes.map((vol, i) => (
                      <div key={i} className="bg-slate-800 rounded-lg p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => updateVolume(i, 'type', 'bind')}
                              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${vol.type !== 'named' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400 hover:text-slate-300'}`}
                            >
                              Bind Mount
                            </button>
                            <button
                              type="button"
                              onClick={() => updateVolume(i, 'type', 'named')}
                              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${vol.type === 'named' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400 hover:text-slate-300'}`}
                            >
                              Named Volume
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeVolume(i)}
                            className="text-red-500 hover:text-red-400 transition-colors p-1"
                            title="Remove"
                          >✕</button>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          {vol.type === 'named' ? (
                            <div>
                              <label className="block text-xs text-slate-500 mb-1">Volume Name</label>
                              <TableInput
                                value={vol.volumeName || ''}
                                onChange={v => updateVolume(i, 'volumeName', v)}
                                placeholder="my_volume"
                              />
                            </div>
                          ) : (
                            <div>
                              <label className="block text-xs text-slate-500 mb-1">Host Path</label>
                              <TableInput
                                value={vol.hostPath}
                                onChange={v => updateVolume(i, 'hostPath', v)}
                                placeholder="/host/path"
                              />
                            </div>
                          )}
                          <div>
                            <label className="block text-xs text-slate-500 mb-1">Container Path</label>
                            <TableInput
                              value={vol.containerPath}
                              onChange={v => updateVolume(i, 'containerPath', v)}
                              placeholder="/container/path"
                            />
                          </div>
                        </div>

                        <div className="flex gap-4 items-center">
                          <div className="flex items-center gap-2">
                            <label className="text-xs text-slate-500">Mode</label>
                            <select
                              value={vol.mode}
                              onChange={e => updateVolume(i, 'mode', e.target.value)}
                              className="bg-slate-700 border border-slate-600 rounded px-2 py-1 text-slate-100 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                            >
                              <option value="rw">rw</option>
                              <option value="ro">ro</option>
                            </select>
                          </div>
                          {vol.type === 'named' && (
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={vol.external || false}
                                onChange={e => updateVolume(i, 'external', e.target.checked)}
                                className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-700 text-blue-600 focus:ring-blue-500"
                              />
                              <span className="text-xs text-slate-400">External (pre-existing volume)</span>
                            </label>
                          )}
                          <div className="flex-1">
                            <TableInput
                              value={vol.description}
                              onChange={v => updateVolume(i, 'description', v)}
                              placeholder="description (optional)"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button type="button" onClick={addVolume} className="mt-3 btn-secondary text-sm">
                    + Add Volume
                  </button>
                </div>
              )}

              {/* Ports Tab */}
              {activeTab === 'ports' && (
                <div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-700">
                          <th className="text-left px-2 py-2 text-slate-400 font-medium">Host IP</th>
                          <th className="text-left px-2 py-2 text-slate-400 font-medium">Host Port</th>
                          <th className="text-left px-2 py-2 text-slate-400 font-medium">Container Port</th>
                          <th className="text-left px-2 py-2 text-slate-400 font-medium w-24">Protocol</th>
                          <th className="text-left px-2 py-2 text-slate-400 font-medium">Description</th>
                          <th className="w-8" />
                        </tr>
                      </thead>
                      <tbody>
                        {config.ports.map((port, i) => (
                          <TableRow key={i} onDelete={() => removePort(i)}>
                            <td className="px-2 py-2">
                              <TableInput value={port.hostIP || ''} onChange={v => updatePort(i, 'hostIP', v)} placeholder="any" />
                            </td>
                            <td className="px-2 py-2">
                              <TableInput value={port.hostPort} onChange={v => updatePort(i, 'hostPort', v)} placeholder="8080" type="text" />
                            </td>
                            <td className="px-2 py-2">
                              <TableInput value={port.containerPort} onChange={v => updatePort(i, 'containerPort', v)} placeholder="80" type="text" />
                            </td>
                            <td className="px-2 py-2">
                              <select
                                value={port.protocol}
                                onChange={e => updatePort(i, 'protocol', e.target.value)}
                                className="bg-slate-700 border border-slate-600 rounded px-2 py-1.5 text-slate-100 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 w-full"
                              >
                                <option value="tcp">tcp</option>
                                <option value="udp">udp</option>
                              </select>
                            </td>
                            <td className="px-2 py-2">
                              <TableInput value={port.description} onChange={v => updatePort(i, 'description', v)} placeholder="optional" />
                            </td>
                          </TableRow>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-slate-600 text-xs mt-2">Host IP: leave blank to bind all interfaces, or enter e.g. <code>192.168.0.3</code> to restrict to one interface.</p>
                  <button type="button" onClick={addPort} className="mt-3 btn-secondary text-sm">
                    + Add Port
                  </button>
                </div>
              )}

              {/* Labels Tab */}
              {activeTab === 'labels' && (
                <div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-700">
                          <th className="text-left px-2 py-2 text-slate-400 font-medium">Name</th>
                          <th className="text-left px-2 py-2 text-slate-400 font-medium">Value</th>
                          <th className="w-8" />
                        </tr>
                      </thead>
                      <tbody>
                        {config.labels.map((label, i) => (
                          <TableRow key={i} onDelete={() => removeLabel(i)}>
                            <td className="px-2 py-2">
                              <TableInput value={label.name} onChange={v => updateLabel(i, 'name', v)} placeholder="com.example.key" />
                            </td>
                            <td className="px-2 py-2">
                              <TableInput value={label.value} onChange={v => updateLabel(i, 'value', v)} placeholder="value" />
                            </td>
                          </TableRow>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button type="button" onClick={addLabel} className="mt-3 btn-secondary text-sm">
                    + Add Label
                  </button>
                </div>
              )}

              {/* Advanced Tab — sysctls + depends_on */}
              {activeTab === 'advanced' && (
                <div className="space-y-8">
                  <div>
                    <SectionHeader title="Sysctls" />
                    <p className="text-slate-500 text-xs mb-3">Kernel parameter overrides. e.g. <code>net.ipv6.conf.all.disable_ipv6 = 1</code></p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-700">
                            <th className="text-left px-2 py-2 text-slate-400 font-medium">Key</th>
                            <th className="text-left px-2 py-2 text-slate-400 font-medium">Value</th>
                            <th className="w-8" />
                          </tr>
                        </thead>
                        <tbody>
                          {(config.sysctls || []).map((s, i) => (
                            <TableRow key={i} onDelete={() => removeSysctl(i)}>
                              <td className="px-2 py-2">
                                <TableInput value={s.key} onChange={v => updateSysctl(i, 'key', v)} placeholder="net.ipv4.ip_forward" className="font-mono text-xs" />
                              </td>
                              <td className="px-2 py-2">
                                <TableInput value={s.value} onChange={v => updateSysctl(i, 'value', v)} placeholder="1" />
                              </td>
                            </TableRow>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <button type="button" onClick={addSysctl} className="mt-3 btn-secondary text-sm">
                      + Add Sysctl
                    </button>
                  </div>

                  <div>
                    <SectionHeader title="Depends On" />
                    <p className="text-slate-500 text-xs mb-3">Container names that must be running before this service starts.</p>
                    <div className="space-y-2">
                      {(config.dependsOn || []).map((dep, i) => (
                        <div key={i} className="flex gap-2 items-center">
                          <input
                            type="text"
                            value={dep}
                            onChange={e => updateDependsOn(i, e.target.value)}
                            className="input-field flex-1"
                            placeholder="postgresql"
                          />
                          <button
                            type="button"
                            onClick={() => removeDependsOn(i)}
                            className="text-red-500 hover:text-red-400 transition-colors p-1"
                            title="Remove"
                          >✕</button>
                        </div>
                      ))}
                    </div>
                    <button type="button" onClick={addDependsOn} className="mt-2 btn-secondary text-sm">
                      + Add Dependency
                    </button>
                  </div>
                </div>
              )}

              {/* Behaviour Tab */}
              {activeTab === 'behaviour' && (
                <div className="space-y-6">
                  <div>
                    <SectionHeader title="Startup" />
                    <Toggle
                      value={config.autoStart}
                      onChange={v => updateConfig('autoStart', v)}
                      label="AutoStart — start this container when Bosun starts"
                    />
                  </div>

                  <div>
                    <SectionHeader title="Auto-Update" />
                    <div className="space-y-4">
                      <Toggle
                        value={config.autoUpdate}
                        onChange={v => updateConfig('autoUpdate', v)}
                        label="AutoUpdate — automatically pull and redeploy on schedule"
                      />
                      {config.autoUpdate && (
                        <div>
                          <label className="block text-sm font-medium text-slate-300 mb-1.5">
                            Update Schedule (cron)
                          </label>
                          <input
                            type="text"
                            value={config.autoUpdateSchedule}
                            onChange={e => updateConfig('autoUpdateSchedule', e.target.value)}
                            className="input-field max-w-xs"
                            placeholder="0 3 * * *"
                          />
                          <p className="text-slate-600 text-xs mt-1">
                            e.g. <code>0 3 * * *</code> = 3 AM daily, <code>0 */6 * * *</code> = every 6 hours
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 flex-shrink-0 bg-slate-900">
          {error && (
            <div className="text-red-400 text-sm flex-1 mr-4">{error}</div>
          )}
          {!error && <div className="flex-1" />}
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-ghost">
              Cancel
            </button>
            <button
              onClick={() => handleSave(false)}
              disabled={saving}
              className="btn-secondary disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Config'}
            </button>
            <button
              onClick={() => handleSave(true)}
              disabled={saving}
              className="btn-primary disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save & Deploy'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

import React, { useState, useEffect, useCallback, useRef } from 'react'
import Nav from '../components/Nav.jsx'
import ContainerEditor from '../components/ContainerEditor.jsx'
import { get } from '../lib/api.js'

const CATEGORIES = ['All', 'Media', 'Download & Arr', 'Productivity', 'Dev Tools', 'Monitoring', 'Security', 'Databases', 'Networking', 'Home & IoT', 'AI & ML', 'Photos']

function formatPulls(n) {
  if (!n) return ''
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`
  return `${n}`
}

function getImageBase(img) {
  return (img || '').split(':')[0].toLowerCase()
}

function AppCard({ app, onDeploy, installed }) {
  const [iconError, setIconError] = useState(false)

  return (
    <div className="bg-slate-800 rounded-xl p-4 flex flex-col gap-3 hover:bg-slate-800/70 transition-colors">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-slate-700 flex-shrink-0 overflow-hidden flex items-center justify-center">
          {app.icon && !iconError ? (
            <img
              src={app.icon}
              alt={app.name}
              className="w-10 h-10 object-contain"
              onError={() => setIconError(true)}
            />
          ) : (
            <span className="text-xl">{app.name[0]}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-slate-100 text-sm">{app.name}</h3>
            {installed && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 border border-green-500/30 flex-shrink-0">Installed</span>
            )}
          </div>
          <p className="text-slate-500 text-xs font-mono mt-0.5 truncate">{app.image}</p>
        </div>
      </div>

      <p className="text-slate-400 text-xs leading-relaxed flex-1 line-clamp-2">{app.description}</p>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700 text-slate-400">{app.category}</span>
        {app.tags?.slice(0, 2).map(t => (
          <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-slate-700/50 text-slate-500">{t}</span>
        ))}
      </div>

      <div className="flex items-center gap-2 mt-auto">
        {app.website && (
          <a
            href={app.website}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="text-slate-500 hover:text-slate-300 text-xs transition-colors"
          >
            ↗ Docs
          </a>
        )}
        <div className="flex-1" />
        <button
          onClick={() => onDeploy(app)}
          className="btn-primary text-xs px-3 py-1.5"
        >
          {installed ? 'Deploy Second Instance' : 'Deploy'}
        </button>
      </div>
    </div>
  )
}

function HubCard({ result, onDeploy }) {
  return (
    <div className="bg-slate-800 rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-slate-700 flex-shrink-0 flex items-center justify-center text-slate-500 text-xl">
          {result.official ? '✓' : '⬡'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-slate-100 text-sm truncate">{result.name}</h3>
            {result.official && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30 flex-shrink-0">Official</span>
            )}
          </div>
          <p className="text-slate-500 text-xs font-mono mt-0.5 truncate">{result.name}</p>
        </div>
      </div>

      <p className="text-slate-400 text-xs leading-relaxed flex-1 line-clamp-2">
        {result.description || 'No description available.'}
      </p>

      <div className="flex items-center gap-3 text-xs text-slate-600">
        {result.stars > 0 && <span>★ {formatPulls(result.stars)}</span>}
        {result.pulls > 0 && <span>↓ {formatPulls(result.pulls)}</span>}
      </div>

      <button
        onClick={() => onDeploy(result)}
        className="bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs px-3 py-1.5 rounded-lg transition-colors w-full"
      >
        Deploy
      </button>
    </div>
  )
}

// Convert marketplace template to Bosun config object
function templateToConfig(template) {
  return {
    name: template.id || template.name.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
    repository: template.image,
    icon: template.icon || '',
    webUI: template.webUI || '',
    restartPolicy: template.restartPolicy || 'unless-stopped',
    ports: (template.ports || []).map(p => ({
      hostPort: p.hostPort,
      containerPort: p.containerPort,
      protocol: p.protocol || 'tcp',
    })),
    volumes: (template.volumes || []).map(v => ({
      type: v.type || 'bind',
      hostDir: v.hostPath || '',
      containerDir: v.containerPath || '',
      volumeName: v.volumeName || '',
      external: v.external || false,
    })),
    environment: (template.environment || []).map(e => ({
      key: e.key,
      value: e.value || '',
    })),
    networks: (template.networks || ['internal']).map(n => ({ name: n })),
    labels: [],
    sysctls: [],
    dependsOn: [],
  }
}

// Convert Docker Hub search result to minimal Bosun config
function hubResultToConfig(result) {
  const name = result.name.includes('/') ? result.name.split('/')[1] : result.name
  return {
    name: name.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
    repository: result.name + ':latest',
    icon: '',
    webUI: '',
    restartPolicy: 'unless-stopped',
    ports: [],
    volumes: [],
    environment: [],
    networks: [{ name: 'internal' }],
    labels: [],
    sysctls: [],
    dependsOn: [],
  }
}

export default function MarketplacePage() {
  const [catalog, setCatalog] = useState([])
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [category, setCategory] = useState('All')
  const [search, setSearch] = useState('')
  const [runningImages, setRunningImages] = useState([])

  const [hubQuery, setHubQuery] = useState('')
  const [hubResults, setHubResults] = useState([])
  const [hubLoading, setHubLoading] = useState(false)
  const [hubError, setHubError] = useState('')
  const [hubPage, setHubPage] = useState(1)
  const [hubTotal, setHubTotal] = useState(0)

  const [deployConfig, setDeployConfig] = useState(null)
  const searchTimeout = useRef(null)

  useEffect(() => {
    get('/api/marketplace/catalog')
      .then(data => { setCatalog(data); setCatalogLoading(false) })
      .catch(() => setCatalogLoading(false))
    get('/api/containers')
      .then(data => setRunningImages((data.containers || []).map(c => getImageBase(c.image))))
      .catch(() => {})
  }, [])

  const searchHub = useCallback(async (q, page = 1) => {
    if (!q.trim()) { setHubResults([]); setHubTotal(0); return }
    setHubLoading(true)
    setHubError('')
    try {
      const data = await get(`/api/marketplace/search?q=${encodeURIComponent(q)}&page=${page}`)
      setHubResults(data.results || [])
      setHubTotal(data.count || 0)
      setHubPage(page)
    } catch (err) {
      setHubError(err.message)
    } finally {
      setHubLoading(false)
    }
  }, [])

  function handleHubSearch(e) {
    const q = e.target.value
    setHubQuery(q)
    clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(() => searchHub(q, 1), 500)
  }

  // Filtered catalog
  const filteredCatalog = catalog.filter(app => {
    const matchesCategory = category === 'All' || app.category === category
    const matchesSearch = !search || app.name.toLowerCase().includes(search.toLowerCase()) ||
      app.description?.toLowerCase().includes(search.toLowerCase()) ||
      app.image?.toLowerCase().includes(search.toLowerCase())
    return matchesCategory && matchesSearch
  })

  function handleDeploy(template) {
    setDeployConfig(templateToConfig(template))
  }

  function handleHubDeploy(result) {
    setDeployConfig(hubResultToConfig(result))
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <Nav />
      <main className="max-w-screen-2xl mx-auto px-6 py-6">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-slate-100">Marketplace</h1>
          <p className="text-slate-500 text-sm mt-0.5">Deploy popular self-hosted apps, or search Docker Hub for any image.</p>
        </div>

        {/* Curated catalog */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <h2 className="text-base font-semibold text-slate-200">Curated Apps</h2>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Filter apps…"
              className="input-field text-sm py-1.5 w-56"
            />
          </div>

          {/* Category tabs */}
          <div className="flex items-center gap-1 overflow-x-auto pb-2 mb-4">
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs whitespace-nowrap flex-shrink-0 transition-colors ${
                  category === cat
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {catalogLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="bg-slate-800 rounded-xl p-4 animate-pulse h-40" />
              ))}
            </div>
          ) : filteredCatalog.length === 0 ? (
            <div className="text-center py-12 text-slate-600">No apps match your search</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredCatalog.map(app => (
                <AppCard key={app.id} app={app} onDeploy={handleDeploy} installed={runningImages.includes(getImageBase(app.image))} />
              ))}
            </div>
          )}
        </section>

        {/* Docker Hub search */}
        <section>
          <h2 className="text-base font-semibold text-slate-200 mb-4">Docker Hub Search</h2>
          <div className="flex gap-3 mb-4">
            <input
              type="text"
              value={hubQuery}
              onChange={handleHubSearch}
              placeholder="Search Docker Hub for any image…"
              className="input-field flex-1 text-sm"
            />
            {hubLoading && <span className="text-slate-500 text-sm self-center">Searching…</span>}
          </div>

          {hubError && (
            <div className="mb-4 text-red-400 text-sm bg-red-950/50 border border-red-800 rounded-lg px-4 py-3">{hubError}</div>
          )}

          {hubResults.length > 0 && (
            <>
              <p className="text-slate-600 text-xs mb-3">
                {hubTotal.toLocaleString()} results for "{hubQuery}"
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-4">
                {hubResults.map(r => (
                  <HubCard key={r.name} result={r} onDeploy={handleHubDeploy} />
                ))}
              </div>
              {/* Pagination */}
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => searchHub(hubQuery, hubPage - 1)}
                  disabled={hubPage <= 1 || hubLoading}
                  className="bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 text-sm px-4 py-2 rounded-lg transition-colors"
                >
                  ← Prev
                </button>
                <span className="text-slate-500 text-sm">Page {hubPage}</span>
                <button
                  onClick={() => searchHub(hubQuery, hubPage + 1)}
                  disabled={hubPage * 24 >= hubTotal || hubLoading}
                  className="bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 text-sm px-4 py-2 rounded-lg transition-colors"
                >
                  Next →
                </button>
              </div>
            </>
          )}
        </section>
      </main>

      {/* Deploy via ContainerEditor */}
      {deployConfig && (
        <ContainerEditor
          container={{ config: deployConfig, __fromMarketplace: true }}
          onClose={() => setDeployConfig(null)}
          onSave={() => setDeployConfig(null)}
        />
      )}
    </div>
  )
}

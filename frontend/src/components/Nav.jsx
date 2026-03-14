import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'

const NAV_LINKS = [
  { to: '/', label: 'Containers', exact: true },
  { to: '/images', label: 'Images' },
  { to: '/volumes', label: 'Volumes' },
  { to: '/networks', label: 'Networks' },
  { to: '/events', label: 'Events' },
  { to: '/marketplace', label: 'Marketplace' },
  { to: '/settings', label: 'Settings' },
]

export default function Nav({ hostInfo, runningCount, totalCount }) {
  const { logout, username } = useAuth()
  const location = useLocation()

  function isActive(link) {
    if (link.exact) return location.pathname === link.to
    return location.pathname.startsWith(link.to)
  }

  return (
    <nav className="bg-slate-900 border-b border-slate-800 sticky top-0 z-40">
      <div className="max-w-screen-2xl mx-auto px-6 h-14 flex items-center gap-4">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 text-slate-100 hover:text-white transition-colors flex-shrink-0">
          <span className="text-xl">⚓</span>
          <span className="font-bold text-lg tracking-tight">Bosun</span>
        </Link>

        {/* Nav links */}
        <div className="flex items-center gap-0.5 overflow-x-auto flex-1 min-w-0">
          {NAV_LINKS.map(link => (
            <Link
              key={link.to}
              to={link.to}
              className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors flex-shrink-0 ${
                isActive(link)
                  ? 'text-slate-100 bg-slate-800'
                  : 'text-slate-400 hover:text-slate-100'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Right: status + user */}
        <div className="hidden md:flex items-center gap-3 flex-shrink-0">
          {hostInfo !== undefined && runningCount !== undefined && (
            <span className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 rounded-full px-3 py-1 text-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
              <span className="text-green-400 font-medium">{runningCount}</span>
              <span className="text-slate-500">/</span>
              <span className="text-slate-300">{totalCount} running</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <div className="w-px h-5 bg-slate-700 mx-1" />
          {username && (
            <span className="text-slate-500 text-xs hidden lg:block mr-1">{username}</span>
          )}
          <button
            onClick={logout}
            className="text-slate-400 hover:text-slate-100 px-3 py-1.5 rounded-lg text-sm transition-colors"
          >
            Logout
          </button>
        </div>
      </div>
    </nav>
  )
}

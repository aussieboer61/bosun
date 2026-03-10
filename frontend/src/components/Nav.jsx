import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'

export default function Nav({ hostInfo, runningCount, totalCount }) {
  const { logout, username } = useAuth()
  const location = useLocation()

  const isSettings = location.pathname === '/settings'

  return (
    <nav className="bg-slate-900 border-b border-slate-800 sticky top-0 z-40">
      <div className="max-w-screen-2xl mx-auto px-6 h-14 flex items-center justify-between">
        {/* Left: Logo */}
        <Link to="/" className="flex items-center gap-2.5 text-slate-100 hover:text-white transition-colors">
          <span className="text-xl">⚓</span>
          <span className="font-bold text-lg tracking-tight">Bosun</span>
        </Link>

        {/* Center: status pills */}
        <div className="hidden md:flex items-center gap-3">
          {hostInfo !== undefined && (
            <>
              <span className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 rounded-full px-3 py-1 text-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                <span className="text-slate-300">Docker Connected</span>
              </span>
              {(runningCount !== undefined) && (
                <span className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 rounded-full px-3 py-1 text-xs">
                  <span className="text-green-400 font-medium">{runningCount}</span>
                  <span className="text-slate-500">/</span>
                  <span className="text-slate-300">{totalCount} running</span>
                </span>
              )}
            </>
          )}
        </div>

        {/* Right: nav links + logout */}
        <div className="flex items-center gap-1">
          <Link
            to="/"
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
              !isSettings
                ? 'text-slate-100 bg-slate-800'
                : 'text-slate-400 hover:text-slate-100'
            }`}
          >
            Dashboard
          </Link>
          <Link
            to="/settings"
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
              isSettings
                ? 'text-slate-100 bg-slate-800'
                : 'text-slate-400 hover:text-slate-100'
            }`}
          >
            Settings
          </Link>
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

import { useState, useEffect, useCallback, useRef } from 'react'
import { get } from '../lib/api.js'

export function useContainers() {
  const [containers, setContainers] = useState([])
  const [hostInfo, setHostInfo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const intervalRef = useRef(null)

  const fetchContainers = useCallback(async () => {
    try {
      const data = await get('/api/containers')
      setContainers(data.containers || [])
      setHostInfo(data.hostInfo || null)
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchContainers()
    intervalRef.current = setInterval(fetchContainers, 10000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [fetchContainers])

  const refresh = useCallback(() => {
    return fetchContainers()
  }, [fetchContainers])

  return { containers, hostInfo, loading, error, refresh }
}

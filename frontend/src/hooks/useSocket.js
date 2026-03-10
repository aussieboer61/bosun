import { useMemo } from 'react'
import { io } from 'socket.io-client'

export function createSocket(namespace = '/') {
  const token = localStorage.getItem('bosun_token')
  return io(namespace, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000
  })
}

export function useSocket(namespace = '/') {
  const socket = useMemo(() => createSocket(namespace), [namespace])
  return socket
}

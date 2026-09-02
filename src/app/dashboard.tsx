'use client'

import { FormEvent, useEffect, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import styles from './page.module.css'

type LoginResult = { message?: string; full_name?: string }

export default function Dashboard() {
  const [user, setUser] = useState<string | null>(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [status, setStatus] = useState('offline')
  const [socket, setSocket] = useState<Socket | null>(null)

  useEffect(() => {
    return () => {
      socket?.disconnect()
    }
  }, [socket])

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ usr: username, pwd: password }),
    })
    const data = (await response.json()) as LoginResult
    if (!response.ok) {
      setError(data.message || 'Login failed')
      return
    }
    const session = (await fetch('/api/auth/me').then((result) => result.json())) as LoginResult
    if (!session.message) {
      setError('Login succeeded, but the session was not established')
      return
    }
    setUser(session.message || data.full_name || username)
    setPassword('')
    setStatus('connecting')
    const connection = io('/kababrayhan.com', {
      transports: ['websocket'],
      withCredentials: true,
    })
    connection.onAny((eventName, ...args) => {
      console.log('[socket event]', {
        event: eventName,
        data: args,
      })
    })
    connection.on('connect', () => {
      console.log('[socket connected]', {
        id: connection.id,
        namespace: '/kababrayhan.com',
      })
      setStatus('connected')
    })
    connection.on('disconnect', (reason) => {
      console.log('[socket disconnected]', { reason })
      setStatus('offline')
    })
    connection.on('connect_error', (reason) => {
      console.error('[socket error]', reason)
      setStatus('offline')
      setError(reason.message)
    })
    setSocket(connection)
  }

  async function logout() {
    socket?.disconnect()
    await fetch('/api/auth/logout', { method: 'POST' })
    setSocket(null)
    setUser(null)
    setStatus('offline')
  }

  return (
    <main className={styles.shell}>
      <section className={styles.panel}>
        <div className={styles.kicker}>Frappe / realtime gateway</div>
        <h1 className={styles.title}>Session control</h1>
        <p className={styles.lede}>Authentication stays on the Next.js server. The browser receives only session state.</p>
        {!user ? (
          <form onSubmit={login} className={styles.form}>
            <label className={styles.field}>Username<input className={styles.input} value={username} onChange={(event) => setUsername(event.target.value)} required /></label>
            <label className={styles.field}>Password<input className={styles.input} type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
            <button className={styles.button} type="submit">Sign in <span>→</span></button>
          </form>
        ) : (
          <div className={styles.session}>
            <div className={styles.identity}><span className={styles.avatar}>F</span><div><small>Authenticated user</small><strong>{user}</strong></div></div>
            <div className={styles.connection}><span className={`${styles.dot} ${status === 'connected' ? styles.live : ''}`} /> {status}</div>
            <button className={styles.button} disabled={status !== 'connected'} onClick={() => socket?.emit('new order', { user, sentAt: new Date().toISOString() })}>Send new order event <span>↗</span></button>
            <button className={`${styles.button} ${styles.secondary}`} onClick={logout}>Sign out</button>
          </div>
        )}
        {error && <p className={styles.error}>{error}</p>}
      </section>
      <aside className={styles.aside}><span>01</span><p>Private session bridge</p><span>SERVER AUTH</span></aside>
    </main>
  )
}
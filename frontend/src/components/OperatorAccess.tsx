import { createContext, useContext, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { getIncidents, setOperatorToken, clearOperatorToken } from '../lib/api'
import { PrototypeNotice } from './PublicLayout'

const OperatorContext = createContext<{ authorized: boolean; signIn: () => void; signOut: () => void }>({ authorized: false, signIn: () => {}, signOut: () => {} })
export function OperatorProvider({ children }: { children: ReactNode }) {
  const [authorized, setAuthorized] = useState(false)
  return <OperatorContext.Provider value={{ authorized, signIn: () => setAuthorized(true), signOut: () => { clearOperatorToken(); setAuthorized(false) } }}>{children}</OperatorContext.Provider>
}
export function OperatorGate({ children }: { children: ReactNode }) {
  const { authorized, signIn, signOut } = useContext(OperatorContext)
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setBusy(true)
    setOperatorToken(token)
    try { await getIncidents(); setToken(''); signIn() }
    catch (cause) { clearOperatorToken(); setError(cause instanceof Error ? cause.message : 'Operator access could not be verified.') }
    finally { setBusy(false) }
  }
  if (authorized) return <><div className="operator-session"><span>Demo operator session · credential kept in memory only</span><button className="text-button" onClick={signOut}>Sign out</button></div>{children}</>
  return <><PrototypeNotice /><main className="public-main" tabIndex={-1}><span className="eyebrow">MUNICIPAL OPERATIONS</span><h1>Operator access</h1><p className="intro-copy">Enter the demo operator token configured on the API. Public reporting and tracking do not require this token.</p><form className="tracking-form" onSubmit={submit}><label htmlFor="operator-token">Demo operator token</label><input id="operator-token" type="password" autoComplete="off" value={token} onChange={event => setToken(event.target.value)} required minLength={32} disabled={busy} /><button className="button button-primary" disabled={busy}>{busy ? 'Verifying…' : 'Open operations'}</button>{error && <p role="alert" className="field-error">{error}</p>}</form><p className="service-note">Local hackathon access only. Reloading the page clears the session. Configure a token with scripts/Initialize-DemoOperator.ps1; never put it in a VITE_ variable.</p><Link className="text-button" to="/report">Return to resident reporting</Link></main></>
}

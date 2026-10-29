import { createContext, useContext, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Droplets, ShieldCheck } from 'lucide-react'
import { getIncidents, setOperatorToken, clearOperatorToken } from '../lib/api'
import { ProductFooter } from './PublicLayout'

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
    catch (cause) { clearOperatorToken(); setError(cause instanceof Error ? cause.message : 'We couldn’t verify your access. Please try again.') }
    finally { setBusy(false) }
  }
  if (authorized) return <><div className="operator-session"><span>Staff access</span><button className="text-button" onClick={signOut}>Sign out</button></div>{children}</>
  return <div className="staff-login-shell"><header className="public-header"><Link to="/report" className="brand"><span className="brand-symbol"><Droplets size={26} /></span><span>WaterWatch<small>FREE STATE</small></span></Link><Link className="text-button" to="/report">Resident portal</Link></header><main className="public-main staff-login" tabIndex={-1}><span className="signin-symbol" aria-hidden="true"><ShieldCheck size={27} /></span><span className="eyebrow">WATER MANAGEMENT</span><h1>Staff sign in</h1><p className="intro-copy">Review reports, coordinate maintenance and keep communities informed.</p><form className="tracking-form" onSubmit={submit}><label htmlFor="operator-token">Staff access key</label><input id="operator-token" type="password" autoComplete="off" value={token} onChange={event => setToken(event.target.value)} required minLength={32} disabled={busy} /><button className="button button-primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>{error && <p role="alert" className="field-error">{error}</p>}</form><p className="signin-help">Ask your team administrator for an access key. You’ll need to sign in again if you refresh or close this page.</p><Link className="text-button" to="/report">Report a problem instead</Link></main><ProductFooter /></div>
}

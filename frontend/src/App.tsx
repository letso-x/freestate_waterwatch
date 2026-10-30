import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import OperationsDashboard from './pages/OperationsDashboard'
import OperationsOverview from './pages/OperationsOverview'
import { PublicReport, ReportSuccess, TrackReport } from './pages/PublicPortal'
import IncidentDetails from './pages/IncidentDetails'
import SensorMonitoring from './pages/SensorMonitoring'
import PublicLayout from './components/PublicLayout'
import { OperatorProvider, OperatorGate } from './components/OperatorAccess'

function RouteFocus() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo?.(0, 0); document.querySelector<HTMLElement>('main')?.focus() }, [pathname])
  return null
}

export function AppRoutes() {
  return <><RouteFocus /><Routes>
    <Route path="/" element={<Navigate to="/report" replace />} />
    <Route path="/report" element={<PublicReport />} />
    <Route path="/report/success" element={<ReportSuccess />} />
    <Route path="/track" element={<TrackReport />} />
    <Route path="/operations" element={<OperatorGate><OperationsOverview /></OperatorGate>} />
    <Route path="/operations/incidents" element={<OperatorGate><OperationsDashboard /></OperatorGate>} />
    <Route path="/operations/sensors" element={<OperatorGate><SensorMonitoring /></OperatorGate>} />
    <Route path="/operations/incidents/:id" element={<OperatorGate><IncidentDetails /></OperatorGate>} />
    <Route path="*" element={<PublicLayout><h1>Page not found</h1><p>Choose a WaterWatch workspace to continue.</p><Link to="/report" className="button button-primary">Report a problem</Link> <Link to="/operations" className="button button-secondary">Water management</Link></PublicLayout>} />
  </Routes></>
}

export default function App() { return <BrowserRouter><OperatorProvider><AppRoutes /></OperatorProvider></BrowserRouter> }

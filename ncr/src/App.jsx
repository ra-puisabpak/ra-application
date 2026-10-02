import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, RequireAuth } from './auth'
import NCRListPage from './pages/NCRListPage'
import NCRPrintPage from './pages/NCRPrintPage'
import NCRDetailPage from './pages/NCRDetailPage'
import CAPAListPage from './pages/CAPAListPage'
import CAPAPrintPage from './pages/CAPAPrintPage'
import CAPADetailPage from './pages/CAPADetailPage'
import SupplierReplyPage from './pages/SupplierReplyPage'
import SupplierCAPAReplyPage from './pages/SupplierCAPAReplyPage'
import DashboardPage from './pages/DashboardPage'
import LoginPage from './pages/LoginPage'
import SetupPage from './pages/SetupPage'
import UsersPage from './pages/UsersPage'
import AccountPage from './pages/AccountPage'

const Private = ({ children, role }) => <RequireAuth role={role}>{children}</RequireAuth>

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public: sign-in, first-time setup, and supplier reply links (token after #) */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/setup" element={<SetupPage />} />
          <Route path="/reply" element={<SupplierReplyPage />} />
          <Route path="/capa-reply" element={<SupplierCAPAReplyPage />} />

          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Private><DashboardPage /></Private>} />
          <Route path="/ncr" element={<Private><NCRListPage /></Private>} />
          <Route path="/ncr/new" element={<Private><NCRDetailPage /></Private>} />
          <Route path="/ncr/:id" element={<Private><NCRDetailPage /></Private>} />
          <Route path="/ncr/:id/print" element={<Private><NCRPrintPage /></Private>} />
          <Route path="/capa" element={<Private><CAPAListPage /></Private>} />
          <Route path="/capa/new" element={<Private><CAPADetailPage /></Private>} />
          <Route path="/capa/:id" element={<Private><CAPADetailPage /></Private>} />
          <Route path="/capa/:id/print" element={<Private><CAPAPrintPage /></Private>} />
          <Route path="/account" element={<Private><AccountPage /></Private>} />
          <Route path="/users" element={<Private role="QA_MANAGER"><UsersPage /></Private>} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

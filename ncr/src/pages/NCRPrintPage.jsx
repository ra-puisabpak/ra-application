import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ncrApi, capaApi } from '../api/d1Api'
import NCRFormA4 from '../components/NCRFormA4'
import { Printer, ArrowLeft, RefreshCw, AlertCircle } from 'lucide-react'

export default function NCRPrintPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [ncr, setNcr] = useState(null)
  const [capa, setCapa] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([
      ncrApi.get(id),
      capaApi.listByNcr(id).then(list => list?.[0] || null).catch(() => null),
    ])
      .then(([ncrData, capaData]) => { setNcr(ncrData); setCapa(capaData) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  return (
    <div className="min-h-screen bg-gray-200">
      <div className="no-print bg-blue-900 text-white px-6 py-3 flex items-center justify-between shadow-lg sticky top-0 z-50">
        <button onClick={() => navigate('/ncr')} className="flex items-center gap-2 hover:bg-blue-800 px-3 py-2 rounded-lg text-sm transition">
          <ArrowLeft className="w-4 h-4" />กลับรายการ NCR
        </button>
        <div className="text-sm font-medium">{ncr ? `NCR: ${ncr.ncr_id}` : 'ใบ NCR'}</div>
        <button
          onClick={() => window.print()}
          disabled={loading || !!error}
          className="flex items-center gap-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-semibold transition"
        >
          <Printer className="w-4 h-4" />พิมพ์ A4
        </button>
      </div>

      {loading && (
        <div className="no-print flex flex-col items-center justify-center py-24 text-gray-500">
          <RefreshCw className="w-10 h-10 animate-spin mb-3" />กำลังโหลด...
        </div>
      )}
      {error && (
        <div className="no-print max-w-lg mx-auto mt-10 bg-red-50 border border-red-200 rounded-xl p-6 flex gap-3 text-red-700">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <div><strong>โหลดข้อมูลไม่ได้:</strong><br />{error}</div>
        </div>
      )}
      {ncr && <NCRFormA4 data={ncr} capa={capa} />}
    </div>
  )
}

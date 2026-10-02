import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { capaApi } from '../api/d1Api'
import { ClipboardList, Printer, RefreshCw, AlertCircle, Plus, Search } from 'lucide-react'
import Layout from '../components/Layout'

const STATUS_CLS = {
  Open: 'bg-red-100 text-red-700',
  'Root Cause Analysis': 'bg-orange-100 text-orange-700',
  'Action Planning': 'bg-amber-100 text-amber-700',
  Implementation: 'bg-blue-100 text-blue-700',
  Verification: 'bg-purple-100 text-purple-700',
  'Closed Effective': 'bg-green-100 text-green-700',
  'Closed Not Effective': 'bg-red-200 text-red-800',
  Overdue: 'bg-red-300 text-red-900',
}

const SEV_CLS = {
  Critical: 'bg-red-100 text-red-700',
  Major: 'bg-orange-100 text-orange-700',
  Minor: 'bg-amber-100 text-amber-700',
}

export default function CAPAListPage() {
  const navigate = useNavigate()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')

  const load = async () => {
    setLoading(true); setError(null)
    try {
      const data = await capaApi.list()
      setRecords(Array.isArray(data) ? data : [])
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const fmt = (d) => d ? new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '-'

  const filtered = records.filter(r =>
    !search ||
    (r.capa_id || '').toLowerCase().includes(search.toLowerCase()) ||
    (r.description || '').toLowerCase().includes(search.toLowerCase()) ||
    (r.source_ref || '').toLowerCase().includes(search.toLowerCase()) ||
    (r.responsible_person || '').toLowerCase().includes(search.toLowerCase())
  )

  const pageActions = (
    <>
      <button onClick={load} title="รีเฟรช"
        className="p-2 hover:bg-white/20 rounded-lg transition text-white">
        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
      </button>
      <button
        onClick={() => navigate('/capa/new')}
        className="flex items-center gap-1.5 bg-teal-500 hover:bg-teal-400 px-3 py-1.5 rounded-lg text-sm font-semibold transition text-white shadow-sm"
      >
        <Plus className="w-4 h-4" />
        <span className="hidden sm:inline">สร้าง CAPA</span>
        <span className="sm:hidden">ใหม่</span>
      </button>
    </>
  )

  return (
    <Layout pageActions={pageActions}>
      {/* Search bar */}
      <div className="mb-4 flex gap-2 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="ค้นหา CAPA ID / หัวข้อ / NCR อ้างอิง..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
          />
        </div>
        <span className="text-xs text-gray-400 whitespace-nowrap pr-1">{filtered.length} รายการ</span>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-4 flex gap-3 text-red-700 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div><strong>โหลดไม่ได้:</strong> {error}</div>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-3">
          <RefreshCw className="w-8 h-8 animate-spin" />
          <span className="text-sm">กำลังโหลดข้อมูล...</span>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400 gap-3">
          <ClipboardList className="w-14 h-14 opacity-20" />
          <p className="text-sm">ยังไม่มีข้อมูล CAPA</p>
          <button onClick={() => navigate('/capa/new')}
            className="mt-2 bg-teal-600 hover:bg-teal-700 text-white px-5 py-2 rounded-xl text-sm font-medium transition">
            + สร้าง CAPA แรก
          </button>
        </div>
      ) : (
        <>
          {/* ── Mobile: card list ── */}
          <div className="sm:hidden flex flex-col gap-3">
            {filtered.map(r => (
              <div
                key={r.capa_id}
                onClick={() => navigate(`/capa/${r.capa_id}`)}
                className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 cursor-pointer active:bg-teal-50 transition"
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <span className="font-mono font-bold text-teal-700 text-base leading-tight">{r.capa_id || '—'}</span>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold shrink-0 ${STATUS_CLS[r.status] || 'bg-gray-100 text-gray-600'}`}>
                    {r.status || '-'}
                  </span>
                </div>
                <p className="text-sm text-gray-700 font-medium line-clamp-1 mb-1">{r.description || '—'}</p>
                {r.source_ref && (
                  <p className="text-xs text-gray-400 mb-2">NCR อ้างอิง: <span className="font-mono text-gray-600">{r.source_ref}</span></p>
                )}
                <div className="flex items-center gap-2 flex-wrap text-xs text-gray-400">
                  {r.responsible_person && <span>👤 {r.responsible_person}</span>}
                  {r.target_date && <span>📅 {fmt(r.target_date)}</span>}
                  {r.severity_label && (
                    <span className={`px-2 py-0.5 rounded-full font-semibold ${SEV_CLS[r.severity_label] || 'bg-gray-100 text-gray-500'}`}>
                      {r.severity_label}
                    </span>
                  )}
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={e => { e.stopPropagation(); navigate(`/capa/${r.capa_id}/print`) }}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-medium text-slate-600 transition"
                  >
                    <Printer className="w-3.5 h-3.5" />พิมพ์ A4
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); navigate(`/capa/${r.capa_id}`) }}
                    className="flex-1 flex items-center justify-center py-2 bg-teal-600 hover:bg-teal-700 rounded-xl text-xs font-semibold text-white transition"
                  >
                    แก้ไข / ดู
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* ── Desktop: table ── */}
          <div className="hidden sm:block bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-blue-900 text-white text-left text-xs">
                  <th className="px-4 py-3 font-medium">CAPA ID</th>
                  <th className="px-4 py-3 font-medium">หัวข้อ CAPA</th>
                  <th className="px-4 py-3 font-medium">NCR อ้างอิง</th>
                  <th className="px-4 py-3 font-medium">Severity</th>
                  <th className="px-4 py-3 font-medium">ผู้รับผิดชอบ</th>
                  <th className="px-4 py-3 font-medium">กำหนดวัน</th>
                  <th className="px-4 py-3 font-medium">สถานะ</th>
                  <th className="px-4 py-3 font-medium text-center">พิมพ์</th>
                  <th className="px-4 py-3 font-medium text-center">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr
                    key={r.capa_id}
                    onClick={() => navigate(`/capa/${r.capa_id}`)}
                    className={`border-t border-gray-100 hover:bg-teal-50 transition cursor-pointer ${i % 2 === 0 ? '' : 'bg-slate-50/60'}`}
                  >
                    <td className="px-4 py-3 font-mono font-semibold text-teal-700">{r.capa_id}</td>
                    <td className="px-4 py-3 max-w-[200px]">
                      <span className="line-clamp-1 text-gray-700">{r.description || '-'}</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{r.source_ref || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${SEV_CLS[r.severity_label] || 'bg-gray-100 text-gray-500'}`}>
                        {r.severity_label || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{r.responsible_person || '-'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{fmt(r.target_date)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_CLS[r.status] || 'bg-gray-100 text-gray-600'}`}>
                        {r.status || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => navigate(`/capa/${r.capa_id}/print`)}
                        className="inline-flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-600 px-2.5 py-1.5 rounded-lg text-xs font-medium transition"
                      >
                        <Printer className="w-3.5 h-3.5" />A4
                      </button>
                    </td>
                    <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => navigate(`/capa/${r.capa_id}`)}
                        className="inline-flex items-center bg-teal-600 hover:bg-teal-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition"
                      >
                        แก้ไข/ดู
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Layout>
  )
}

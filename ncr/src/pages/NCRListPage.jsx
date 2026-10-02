import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ncrApi } from '../api/d1Api'
import { Printer, RefreshCw, AlertCircle, ClipboardList, Plus, Search } from 'lucide-react'
import Layout from '../components/Layout'
import { SOURCE_TH } from '../data/masterData'
import { useAuth, canWrite } from '../auth'

const STATUS = {
  Open: 'bg-red-100 text-red-700',
  'In Investigation': 'bg-orange-100 text-orange-700',
  'Pending Verification': 'bg-amber-100 text-amber-700',
  Closed: 'bg-green-100 text-green-700',
  Cancelled: 'bg-gray-100 text-gray-500',
}

const STATUS_TH = {
  Open: 'เปิด',
  'In Investigation': 'สอบสวน',
  'Pending Verification': 'รอทวนสอบ',
  Closed: 'ปิดแล้ว',
  Cancelled: 'ยกเลิก',
}

const SEV_CLS = {
  Critical: 'bg-red-100 text-red-700',
  Major: 'bg-orange-100 text-orange-700',
  Minor: 'bg-green-100 text-green-700',
}

export default function NCRListPage() {
  const navigate = useNavigate()
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const { user } = useAuth()
  const writer = canWrite(user)

  const load = async () => {
    setLoading(true); setError(null)
    try {
      const data = await ncrApi.list()
      setRecords(Array.isArray(data) ? data : [])
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const fmt = (d) => d ? new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '-'

  const filtered = records.filter(r =>
    !search ||
    (r.ncr_id || '').toLowerCase().includes(search.toLowerCase()) ||
    (r.nc_description || '').toLowerCase().includes(search.toLowerCase()) ||
    (r.product_lot_no || '').toLowerCase().includes(search.toLowerCase()) ||
    (r.reported_by || '').toLowerCase().includes(search.toLowerCase())
  )

  const pageActions = (
    <>
      <button onClick={load} title="รีเฟรช"
        className="p-2 hover:bg-white/20 rounded-lg transition text-white">
        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
      </button>
      {writer && (
      <button
        onClick={() => navigate('/ncr/new')}
        className="flex items-center gap-1.5 bg-green-500 hover:bg-green-400 px-3 py-1.5 rounded-lg text-sm font-semibold transition text-white shadow-sm"
      >
        <Plus className="w-4 h-4" />
        <span className="hidden sm:inline">สร้าง NCR</span>
        <span className="sm:hidden">ใหม่</span>
      </button>
      )}
    </>
  )

  return (
    <>
    <Layout pageActions={pageActions}>
      {/* Search bar */}
      <div className="mb-4 flex gap-2 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            placeholder="ค้นหา NCR No. / รายละเอียด..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
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
          <p className="text-sm">ยังไม่มีข้อมูล NCR</p>
          <button onClick={() => navigate('/ncr/new')}
            className="mt-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-xl text-sm font-medium transition">
            + สร้าง NCR แรก
          </button>
        </div>
      ) : (
        <>
          {/* ── Mobile: card list ── */}
          <div className="sm:hidden flex flex-col gap-3">
            {filtered.map(r => (
              <div
                key={r.ncr_id}
                onClick={() => navigate(`/ncr/${r.ncr_id}`)}
                className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 cursor-pointer active:bg-blue-50 transition"
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <span className="font-mono font-bold text-blue-800 text-base leading-tight">{r.ncr_id || '—'}</span>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold shrink-0 ${STATUS[r.status] || 'bg-gray-100 text-gray-600'}`}>
                    {STATUS_TH[r.status] || r.status || '-'}
                  </span>
                </div>
                <p className="text-sm text-gray-700 line-clamp-2 mb-2">{r.nc_description || '—'}</p>
                <div className="flex items-center gap-2 flex-wrap text-xs text-gray-400">
                  <span>{fmt(r.issue_date)}</span>
                  <span>·</span>
                  <span>{SOURCE_TH[r.source_type] || r.source_type || '-'}</span>
                  {r.severity && (
                    <span className={`px-2 py-0.5 rounded-full font-semibold ${SEV_CLS[r.severity] || 'bg-gray-100 text-gray-500'}`}>
                      {r.severity}
                    </span>
                  )}
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={e => { e.stopPropagation(); navigate(`/ncr/${r.ncr_id}/print`) }}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-medium text-slate-600 transition"
                  >
                    <Printer className="w-3.5 h-3.5" />พิมพ์ A4
                  </button>
                  <button
                    onClick={e => { e.stopPropagation(); navigate(`/ncr/${r.ncr_id}`) }}
                    className="flex-1 flex items-center justify-center py-2 bg-blue-600 hover:bg-blue-700 rounded-xl text-xs font-semibold text-white transition"
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
                  <th className="px-4 py-3 font-medium">NCR No.</th>
                  <th className="px-4 py-3 font-medium">วันที่</th>
                  <th className="px-4 py-3 font-medium">แหล่งที่มา</th>
                  <th className="px-4 py-3 font-medium">รายละเอียดปัญหา</th>
                  <th className="px-4 py-3 font-medium">Severity</th>
                  <th className="px-4 py-3 font-medium">สถานะ</th>
                  <th className="px-4 py-3 font-medium text-center">พิมพ์</th>
                  <th className="px-4 py-3 font-medium text-center">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr
                    key={r.ncr_id}
                    onClick={() => navigate(`/ncr/${r.ncr_id}`)}
                    className={`border-t border-gray-100 hover:bg-blue-50 transition cursor-pointer ${i % 2 === 0 ? '' : 'bg-slate-50/60'}`}
                  >
                    <td className="px-4 py-3 font-mono font-semibold text-blue-800">{r.ncr_id}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{fmt(r.issue_date)}</td>
                    <td className="px-4 py-3 text-xs text-gray-600">{SOURCE_TH[r.source_type] || r.source_type || '-'}</td>
                    <td className="px-4 py-3 max-w-[220px]">
                      <span className="line-clamp-1 text-gray-700">{r.nc_description || '-'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${SEV_CLS[r.severity] || 'bg-gray-100 text-gray-500'}`}>
                        {r.severity || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS[r.status] || 'bg-gray-100 text-gray-600'}`}>
                        {STATUS_TH[r.status] || r.status || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => navigate(`/ncr/${r.ncr_id}/print`)}
                        className="inline-flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-600 px-2.5 py-1.5 rounded-lg text-xs font-medium transition"
                      >
                        <Printer className="w-3.5 h-3.5" />A4
                      </button>
                    </td>
                    <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => navigate(`/ncr/${r.ncr_id}`)}
                        className="inline-flex items-center bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition"
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
    </>
  )
}

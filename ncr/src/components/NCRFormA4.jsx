import { COMPANY_NAME, COMPANY_NAME_EN, FORM_CODE_NCR, FORM_REVISION } from '../config'
import { PROCESSES, byCode, DISPOSITION_TH, SOURCE_TH as SOURCE_TH_ALL } from '../data/masterData'

const PROCESS_LABEL = byCode(PROCESSES)
const procText = (d) => {
  if (!d.process_ref) return '-'
  const lbl = PROCESS_LABEL[d.process_ref]
  return lbl ? `${d.process_ref} - ${lbl}` : d.process_ref
}

const fmt = (d) => {
  if (!d) return '-'
  try { return new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' }) }
  catch { return d }
}
const val = (v) => v || '-'

const SOURCE_TH = {
  RM_RECEIVING: 'รับวัตถุดิบ (RM Receiving)',
  IN_PROCESS: 'ระหว่างการผลิต (In-Process)',
  CCP: 'CCP ไม่ผ่านค่ากำหนด',
  FINAL_QC: 'ตรวจสอบขั้นสุดท้าย (Final QC)',
  COMPLAINT: 'ข้อร้องเรียนลูกค้า (Customer Complaint)',
  AUDIT: 'การตรวจสอบ (Audit)',
  MAINTENANCE: 'ซ่อมบำรุง (Maintenance)',
  OTHER: 'อื่นๆ (Other)',
}

const SEVERITY_STYLE = {
  Critical: { bg: '#fed7d7', color: '#c53030' },
  High: { bg: '#fed7d7', color: '#c53030' },
  Medium: { bg: '#feebc8', color: '#c05621' },
  Low: { bg: '#c6f6d5', color: '#276749' },
}

export default function NCRFormA4({ data, capa }) {
  const d = data || {}
  const sevStyle = SEVERITY_STYLE[d.severity] || { bg: '#feebc8', color: '#c05621' }

  return (
    <div className="a4-page" style={{ fontFamily: "'Sarabun', sans-serif" }}>

      {/* ===== HEADER ===== */}
      <table className="ncr-table" style={{ marginBottom: '2mm' }}>
        <tbody>
          <tr>
            <td rowSpan={3} style={{ width: '22%', textAlign: 'center', padding: '4px' }}>
              <div style={{ fontSize: '13pt', fontWeight: '700', color: '#1a365d' }}>SWI</div>
              <div style={{ fontSize: '7.5pt', color: '#444', lineHeight: '1.4' }}>{COMPANY_NAME}</div>
              <div style={{ fontSize: '7pt', color: '#666' }}>{COMPANY_NAME_EN}</div>
            </td>
            <td colSpan={2} style={{ textAlign: 'center', fontSize: '13pt', fontWeight: '700', color: '#1a365d', padding: '4px', borderBottom: '1px solid #ccc' }}>
              ใบรายงานความไม่สอดคล้อง
            </td>
          </tr>
          <tr>
            <td colSpan={2} style={{ textAlign: 'center', fontSize: '10pt', fontWeight: '600', color: '#2b6cb0', padding: '2px', borderBottom: '1px solid #ccc' }}>
              Non-Conformance Report (NCR)
            </td>
          </tr>
          <tr>
            <td style={{ width: '39%', padding: '3px 5px', fontSize: '8pt' }}>
              <strong>รหัสเอกสาร:</strong> {FORM_CODE_NCR}<br />
              <strong>แก้ไขครั้งที่:</strong> {FORM_REVISION}
            </td>
            <td style={{ width: '39%', padding: '3px 5px', fontSize: '8pt' }}>
              <strong>NCR ID:</strong> <span style={{ color: '#c53030', fontWeight: '700' }}>{val(d.ncr_id)}</span><br />
              <strong>วันที่ออก:</strong> {fmt(d.issue_date)}
            </td>
          </tr>
        </tbody>
      </table>

      {/* ===== SECTION A: รายละเอียด NC ===== */}
      <table className="ncr-table" style={{ marginBottom: '2mm' }}>
        <tbody>
          <tr>
            <td colSpan={4} className="section-header">
              ส่วนที่ 1 : รายละเอียดความไม่สอดคล้อง &nbsp;/&nbsp; SECTION A : NONCONFORMANCE DETAILS
            </td>
          </tr>
          <tr>
            <td className="label-cell" style={{ width: '20%' }}>แหล่งที่มา / Source</td>
            <td className="value-cell" style={{ width: '30%' }}>{SOURCE_TH_ALL[d.source_type] || d.source_type || '-'}</td>
            <td className="label-cell" style={{ width: '20%' }}>วันที่พบ / Found Date</td>
            <td className="value-cell" style={{ width: '30%' }}>{fmt(d.found_date || d.issue_date)}</td>
          </tr>
          <tr>
            <td className="label-cell">Product / Lot No.</td>
            <td colSpan={3} className="value-cell" style={{ fontFamily: 'monospace', fontSize: '9pt' }}>
              {d.product_lot_no || d.lot_no || '-'}
            </td>
          </tr>
          <tr>
            <td className="label-cell">กระบวนการ / Process</td>
            <td className="value-cell">{procText(d)}</td>
            <td className="label-cell">วัตถุดิบ / Material · FG</td>
            <td className="value-cell">{val(d.material_name || d.material_code)}</td>
          </tr>
          <tr>
            <td className="label-cell">ซัพพลายเออร์ / Supplier</td>
            <td className="value-cell">{val(d.supplier_name || d.supplier_id)}</td>
            <td className="label-cell">พารามิเตอร์ / Parameter</td>
            <td className="value-cell">{val(d.parameter_name || d.parameter_id)}</td>
          </tr>
          <tr>
            <td className="label-cell">ค่ามาตรฐาน / Critical Limit</td>
            <td className="value-cell">{val(d.critical_limit)}</td>
            <td className="label-cell">ผลจริง / Actual Result</td>
            <td className="value-cell">{val(d.actual_result)}</td>
          </tr>
          <tr>
            <td className="label-cell">Visual Check</td>
            <td className="value-cell">{val(d.visual_check)}</td>
            <td className="label-cell">สถานที่ Hold / Hold Location</td>
            <td className="value-cell">{val(d.hold_location)}</td>
          </tr>
          <tr>
            <td className="label-cell">จำนวน / Quantity</td>
            <td className="value-cell">{d.defect_qty ? `${d.defect_qty} ${d.defect_unit || ''}`.trim() : '-'}</td>
            <td className="label-cell">Severity</td>
            <td className="value-cell">
              <span style={{ ...sevStyle, padding: '1px 8px', borderRadius: '3px', fontSize: '8pt', fontWeight: '700' }}>
                {val(d.severity)}
              </span>
            </td>
          </tr>
          <tr>
            <td className="label-cell" style={{ verticalAlign: 'top' }}>
              รายละเอียดข้อบกพร่อง<br />Defect Description *
            </td>
            <td colSpan={3} className="value-cell">
              <div className="text-block" style={{ minHeight: '45px' }}>{val(d.nc_description)}</div>
            </td>
          </tr>
          <tr>
            <td className="label-cell" style={{ verticalAlign: 'top' }}>
              สาเหตุเบื้องต้น<br />Immediate Cause
            </td>
            <td colSpan={3} className="value-cell">
              <div className="text-block" style={{ minHeight: '30px' }}>{val(d.immediate_action)}</div>
            </td>
          </tr>
          <tr>
            <td className="label-cell">Disposition</td>
            <td className="value-cell">{val(DISPOSITION_TH[d.disposition] || d.disposition)}</td>
            <td className="label-cell">Dispositioned By</td>
            <td className="value-cell">{val(d.dispositioned_by)}</td>
          </tr>
          <tr>
            <td className="label-cell">ผู้รายงาน / Reported By</td>
            <td className="value-cell">{val(d.reported_by)}</td>
            <td className="label-cell">วันที่รายงาน</td>
            <td className="value-cell">{fmt(d.issue_date)}</td>
          </tr>
          <tr>
            <td className="label-cell">สถานะ / Status</td>
            <td className="value-cell">
              <span style={{
                padding: '1px 6px', borderRadius: '3px', fontSize: '8pt', fontWeight: '600',
                background: d.status === 'Closed' ? '#c6f6d5' : d.status === 'Open' ? '#fed7d7' : '#feebc8',
                color: d.status === 'Closed' ? '#276749' : d.status === 'Open' ? '#c53030' : '#c05621',
              }}>{val(d.status)}</span>
            </td>
            <td className="label-cell">ผู้รับผิดชอบ</td>
            <td className="value-cell">{val(d.assignee)}</td>
          </tr>
        </tbody>
      </table>

      {/* ===== SECTION B: Root Cause (from NCR) ===== */}
      {(d.root_cause || d.corrective_action || d.preventive_action) && (
        <table className="ncr-table avoid-break" style={{ marginBottom: '2mm' }}>
          <tbody>
            <tr>
              <td colSpan={4} className="section-header">
                ส่วนที่ 2 : สาเหตุ + การแก้ไข + การป้องกัน &nbsp;/&nbsp; SECTION B : ROOT CAUSE & ACTIONS
              </td>
            </tr>
            <tr>
              <td className="label-cell" style={{ width: '20%', verticalAlign: 'top' }}>สาเหตุหลัก / Root Cause</td>
              <td colSpan={3} className="value-cell">
                <div className="text-block" style={{ minHeight: '30px' }}>{val(d.root_cause)}</div>
              </td>
            </tr>
            <tr>
              <td className="label-cell" style={{ verticalAlign: 'top' }}>การแก้ไข / Corrective Action</td>
              <td colSpan={3} className="value-cell">
                <div className="text-block" style={{ minHeight: '30px' }}>{val(d.corrective_action)}</div>
              </td>
            </tr>
            <tr>
              <td className="label-cell" style={{ verticalAlign: 'top' }}>การป้องกัน / Preventive Action</td>
              <td colSpan={3} className="value-cell">
                <div className="text-block" style={{ minHeight: '30px' }}>{val(d.preventive_action)}</div>
              </td>
            </tr>
          </tbody>
        </table>
      )}

      {/* ===== SECTION C: CAPA Reference ===== */}
      {capa && (
        <table className="ncr-table avoid-break" style={{ marginBottom: '2mm' }}>
          <tbody>
            <tr>
              <td colSpan={4} className="section-header" style={{ background: '#276749' }}>
                ส่วนที่ 3 : CAPA อ้างอิง &nbsp;/&nbsp; SECTION C : RELATED CAPA
              </td>
            </tr>
            <tr>
              <td className="label-cell" style={{ width: '20%' }}>CAPA ID</td>
              <td className="value-cell" style={{ width: '30%', color: '#276749', fontWeight: '700' }}>{val(capa.capa_id)}</td>
              <td className="label-cell" style={{ width: '20%' }}>Severity</td>
              <td className="value-cell" style={{ width: '30%' }}>{val(capa.severity_label)}</td>
            </tr>
            <tr>
              <td className="label-cell">หัวข้อ CAPA</td>
              <td colSpan={3} className="value-cell">{val(capa.description)}</td>
            </tr>
            <tr>
              <td className="label-cell">ผู้รับผิดชอบ</td>
              <td className="value-cell">{val(capa.responsible_person)}</td>
              <td className="label-cell">สถานะ CAPA</td>
              <td className="value-cell">{val(capa.status)}</td>
            </tr>
          </tbody>
        </table>
      )}

      {/* ===== SECTION D: Verification ===== */}
      <table className="ncr-table avoid-break" style={{ marginBottom: '3mm' }}>
        <tbody>
          <tr>
            <td colSpan={4} className="section-header">
              ส่วนที่ {capa ? '4' : '3'} : การตรวจสอบผล &nbsp;/&nbsp; SECTION {capa ? 'D' : 'C'} : VERIFICATION
            </td>
          </tr>
          <tr>
            <td className="label-cell" style={{ width: '20%' }}>ผลการตรวจสอบ</td>
            <td className="value-cell" style={{ width: '30%' }}>
              <span style={{
                padding: '1px 6px', borderRadius: '3px', fontSize: '8pt', fontWeight: '600',
                background: d.verification_result === 'Effective' ? '#c6f6d5' :
                  d.verification_result === 'Not Effective' ? '#fed7d7' : '#feebc8',
                color: d.verification_result === 'Effective' ? '#276749' :
                  d.verification_result === 'Not Effective' ? '#c53030' : '#c05621',
              }}>{val(d.verification_result)}</span>
            </td>
            <td className="label-cell" style={{ width: '20%' }}>ผู้ตรวจสอบ</td>
            <td className="value-cell" style={{ width: '30%' }}>{val(d.verified_by)}</td>
          </tr>
          <tr>
            <td className="label-cell" style={{ verticalAlign: 'top' }}>หมายเหตุ / Note</td>
            <td colSpan={3} className="value-cell">
              <div className="text-block" style={{ minHeight: '20px' }}>{val(d.verification_note)}</div>
            </td>
          </tr>
          <tr>
            <td className="label-cell">วันที่ปิด / Closed Date</td>
            <td className="value-cell">{fmt(d.closed_date)}</td>
            <td className="label-cell">ปิดโดย / Closed By</td>
            <td className="value-cell">{val(d.closed_by)}</td>
          </tr>
        </tbody>
      </table>

      {/* ===== SIGNATURES ===== */}
      <table className="ncr-table">
        <tbody>
          <tr>
            <td style={{ width: '33.33%', padding: '4px 8px', textAlign: 'center' }}>
              <div style={{ fontSize: '8pt', fontWeight: '600', marginBottom: '18px' }}>ผู้จัดทำ / Prepared by</div>
              <div className="signature-line">{val(d.reported_by)}</div>
              <div style={{ fontSize: '7.5pt', marginTop: '3px', color: '#555' }}>วันที่: {fmt(d.issue_date)}</div>
            </td>
            <td style={{ width: '33.33%', padding: '4px 8px', textAlign: 'center' }}>
              <div style={{ fontSize: '8pt', fontWeight: '600', marginBottom: '18px' }}>ผู้รับผิดชอบ / Responsible</div>
              <div className="signature-line">{val(d.assignee)}</div>
              <div style={{ fontSize: '7.5pt', marginTop: '3px', color: '#555' }}>วันที่: {fmt(d.reply_date)}</div>
            </td>
            <td style={{ width: '33.33%', padding: '4px 8px', textAlign: 'center' }}>
              <div style={{ fontSize: '8pt', fontWeight: '600', marginBottom: '18px' }}>ผู้ตรวจสอบ / Checked by</div>
              <div className="signature-line">{val(d.verified_by)}</div>
              <div style={{ fontSize: '7.5pt', marginTop: '3px', color: '#555' }}>วันที่: {fmt(d.verified_at)}</div>
            </td>
          </tr>
        </tbody>
      </table>

      <div style={{ marginTop: '3mm', fontSize: '7pt', color: '#888', display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #ddd', paddingTop: '2mm' }}>
        <span>{FORM_CODE_NCR} Rev.{FORM_REVISION}</span>
        <span>{COMPANY_NAME_EN}</span>
        <span>NCR: {val(d.ncr_id)}</span>
      </div>
    </div>
  )
}

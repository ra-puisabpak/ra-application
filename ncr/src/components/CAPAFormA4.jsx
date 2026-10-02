import { COMPANY_NAME, COMPANY_NAME_EN, FORM_CODE_CAPA, FORM_REVISION } from '../config'

const fmt = (d) => {
  if (!d) return '-'
  try { return new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' }) }
  catch { return d }
}
const val = (v) => v || '-'

const SEVERITY_COLOR = {
  Major: { bg: '#fed7d7', color: '#c53030' },
  Minor: { bg: '#feebc8', color: '#c05621' },
  Critical: { bg: '#fee2e2', color: '#991b1b' },
}

const FISHBONE_ITEMS = [
  { key: 'fishbone_man', label: 'Man (คน)' },
  { key: 'fishbone_machine', label: 'Machine (เครื่องจักร)' },
  { key: 'fishbone_material', label: 'Material (วัตถุดิบ)' },
  { key: 'fishbone_method', label: 'Method (วิธีการ)' },
  { key: 'fishbone_environment', label: 'Environment (สิ่งแวดล้อม)' },
  { key: 'fishbone_measurement', label: 'Measurement (การวัด)' },
]

export default function CAPAFormA4({ data }) {
  const d = data || {}
  const sevStyle = SEVERITY_COLOR[d.severity_label] || { bg: '#feebc8', color: '#c05621' }

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
              ใบรายงานการแก้ไขและป้องกัน
            </td>
          </tr>
          <tr>
            <td colSpan={2} style={{ textAlign: 'center', fontSize: '10pt', fontWeight: '600', color: '#276749', padding: '2px', borderBottom: '1px solid #ccc' }}>
              Corrective and Preventive Action Report (CAPA)
            </td>
          </tr>
          <tr>
            <td style={{ width: '39%', padding: '3px 5px', fontSize: '8pt' }}>
              <strong>รหัสเอกสาร:</strong> {FORM_CODE_CAPA}<br />
              <strong>แก้ไขครั้งที่:</strong> {FORM_REVISION}
            </td>
            <td style={{ width: '39%', padding: '3px 5px', fontSize: '8pt' }}>
              <strong>CAPA ID:</strong> <span style={{ color: '#276749', fontWeight: '700' }}>{val(d.capa_id)}</span><br />
              <strong>วันที่ออก:</strong> {fmt(d.created_at)}
            </td>
          </tr>
        </tbody>
      </table>

      {/* ===== SECTION A: ข้อมูลทั่วไป ===== */}
      <table className="ncr-table" style={{ marginBottom: '2mm' }}>
        <tbody>
          <tr>
            <td colSpan={4} className="section-header" style={{ background: '#276749' }}>
              ส่วนที่ 1 : ข้อมูลทั่วไป &nbsp;/&nbsp; SECTION A : GENERAL INFORMATION
            </td>
          </tr>
          <tr>
            <td className="label-cell" style={{ width: '18%' }}>CAPA ID</td>
            <td className="value-cell" style={{ width: '32%', fontWeight: '700', color: '#276749' }}>{val(d.capa_id)}</td>
            <td className="label-cell" style={{ width: '18%' }}>NCR อ้างอิง / NCR ID</td>
            <td className="value-cell" style={{ width: '32%', fontFamily: 'monospace' }}>{val(d.source_ref)}</td>
          </tr>
          <tr>
            <td className="label-cell">Source</td>
            <td className="value-cell">{val(d.source)}</td>
            <td className="label-cell">Severity</td>
            <td className="value-cell">
              <span style={{ ...sevStyle, padding: '1px 8px', borderRadius: '3px', fontSize: '8pt', fontWeight: '700' }}>
                {val(d.severity_label)}
              </span>
            </td>
          </tr>
          <tr>
            <td className="label-cell" style={{ verticalAlign: 'top' }}>
              หัวข้อ CAPA<br />Title
            </td>
            <td colSpan={3} className="value-cell" style={{ fontWeight: '600' }}>
              <div className="text-block" style={{ minHeight: '20px' }}>{val(d.description)}</div>
            </td>
          </tr>
          <tr>
            <td className="label-cell" style={{ verticalAlign: 'top' }}>
              รายละเอียด NC<br />NC Detail
            </td>
            <td colSpan={3} className="value-cell">
              <div className="text-block" style={{ minHeight: '35px' }}>{val(d.detail)}</div>
            </td>
          </tr>
          <tr>
            <td className="label-cell">ผู้รับผิดชอบ / Responsible</td>
            <td className="value-cell">{val(d.responsible_person)}</td>
            <td className="label-cell">กำหนดวัน / Due Date</td>
            <td className="value-cell">{fmt(d.target_date)}</td>
          </tr>
          <tr>
            <td className="label-cell">สถานะ / Status</td>
            <td className="value-cell">
              <span style={{
                padding: '1px 6px', borderRadius: '3px', fontSize: '8pt', fontWeight: '600',
                background: d.status?.includes('Closed') ? '#c6f6d5' : d.status === 'Open' ? '#fed7d7' : '#feebc8',
                color: d.status?.includes('Closed') ? '#276749' : d.status === 'Open' ? '#c53030' : '#c05621',
              }}>{val(d.status)}</span>
            </td>
            <td className="label-cell">วันที่ปิด / Closed Date</td>
            <td className="value-cell">{fmt(d.closed_date || d.actual_completion)}</td>
          </tr>
        </tbody>
      </table>

      {/* ===== SECTION B: Root Cause — 5 Why ===== */}
      <table className="ncr-table avoid-break" style={{ marginBottom: '2mm' }}>
        <tbody>
          <tr>
            <td colSpan={4} className="section-header" style={{ background: '#276749' }}>
              ส่วนที่ 2 : การวิเคราะห์สาเหตุ (5-Why Analysis) &nbsp;/&nbsp; SECTION B : ROOT CAUSE ANALYSIS
            </td>
          </tr>
          {[1,2,3,4,5].map(n => (
            <tr key={n}>
              <td className="label-cell" style={{ width: '12%' }}>ทำไม #{n} / Why {n}</td>
              <td colSpan={3} className="value-cell">
                <div className="text-block" style={{ minHeight: '18px' }}>{val(d[`why${n}`])}</div>
              </td>
            </tr>
          ))}
          <tr>
            <td className="label-cell" style={{ background: '#d1fae5', verticalAlign: 'top' }}>
              <strong>Root Cause สรุป</strong><br />Root Cause Summary
            </td>
            <td colSpan={3} className="value-cell" style={{ background: '#f0fdf4' }}>
              <div className="text-block" style={{ minHeight: '30px', fontWeight: '500' }}>
                {val(d.root_cause_summary || d.root_cause_analysis)}
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* ===== SECTION C: Fishbone Diagram ===== */}
      <table className="ncr-table avoid-break" style={{ marginBottom: '2mm' }}>
        <tbody>
          <tr>
            <td colSpan={4} className="section-header" style={{ background: '#276749' }}>
              ส่วนที่ 3 : Fishbone Diagram (Ishikawa) &nbsp;/&nbsp; SECTION C : CAUSE & EFFECT ANALYSIS
            </td>
          </tr>
          <tr>
            <td className="label-cell" style={{ width: '25%' }}>Man (คน)</td>
            <td className="value-cell" style={{ width: '25%' }}>{val(d.fishbone_man)}</td>
            <td className="label-cell" style={{ width: '25%' }}>Machine (เครื่องจักร)</td>
            <td className="value-cell" style={{ width: '25%' }}>{val(d.fishbone_machine)}</td>
          </tr>
          <tr>
            <td className="label-cell">Material (วัตถุดิบ)</td>
            <td className="value-cell">{val(d.fishbone_material)}</td>
            <td className="label-cell">Method (วิธีการ)</td>
            <td className="value-cell">{val(d.fishbone_method)}</td>
          </tr>
          <tr>
            <td className="label-cell">Environment (สิ่งแวดล้อม)</td>
            <td className="value-cell">{val(d.fishbone_environment)}</td>
            <td className="label-cell">Measurement (การวัด)</td>
            <td className="value-cell">{val(d.fishbone_measurement)}</td>
          </tr>
        </tbody>
      </table>

      {/* ===== SECTION D: CA/PA ===== */}
      <table className="ncr-table avoid-break" style={{ marginBottom: '2mm' }}>
        <tbody>
          <tr>
            <td colSpan={4} className="section-header" style={{ background: '#276749' }}>
              ส่วนที่ 4 : มาตรการแก้ไขและป้องกัน &nbsp;/&nbsp; SECTION D : CORRECTIVE & PREVENTIVE ACTIONS
            </td>
          </tr>
          <tr>
            <td className="label-cell" style={{ width: '22%', verticalAlign: 'top' }}>
              Immediate Action<br />(การแก้ไขเฉพาะหน้า)
            </td>
            <td colSpan={3} className="value-cell">
              <div className="text-block" style={{ minHeight: '35px' }}>{val(d.containment_action || d.immediate_action)}</div>
            </td>
          </tr>
          <tr>
            <td className="label-cell" style={{ verticalAlign: 'top' }}>
              Corrective Action (CA)<br />(มาตรการแก้ไข)
            </td>
            <td colSpan={3} className="value-cell">
              <div className="text-block" style={{ minHeight: '40px' }}>{val(d.corrective_action)}</div>
            </td>
          </tr>
          <tr>
            <td className="label-cell" style={{ verticalAlign: 'top' }}>
              Preventive Action (PA)<br />(มาตรการป้องกัน)
            </td>
            <td colSpan={3} className="value-cell">
              <div className="text-block" style={{ minHeight: '40px' }}>{val(d.preventive_action)}</div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* ===== SECTION E: Verification ===== */}
      <table className="ncr-table avoid-break" style={{ marginBottom: '3mm' }}>
        <tbody>
          <tr>
            <td colSpan={4} className="section-header" style={{ background: '#276749' }}>
              ส่วนที่ 5 : การตรวจสอบประสิทธิผล &nbsp;/&nbsp; SECTION E : EFFECTIVENESS VERIFICATION
            </td>
          </tr>
          <tr>
            <td className="label-cell" style={{ width: '22%', verticalAlign: 'top' }}>
              เกณฑ์ตรวจสอบ<br />Effectiveness Criteria
            </td>
            <td colSpan={3} className="value-cell">
              <div className="text-block" style={{ minHeight: '25px' }}>{val(d.effectiveness_criteria)}</div>
            </td>
          </tr>
          <tr>
            <td className="label-cell">ผลการตรวจสอบ / Result</td>
            <td className="value-cell">
              <span style={{
                padding: '1px 8px', borderRadius: '3px', fontSize: '8pt', fontWeight: '600',
                background: d.effectiveness_result === 'Effective' ? '#c6f6d5' :
                  d.effectiveness_result === 'Not Effective' ? '#fed7d7' : '#feebc8',
                color: d.effectiveness_result === 'Effective' ? '#276749' :
                  d.effectiveness_result === 'Not Effective' ? '#c53030' : '#c05621',
              }}>
                {val(d.effectiveness_result)}
              </span>
            </td>
            <td className="label-cell">วันที่ตรวจสอบ</td>
            <td className="value-cell">{fmt(d.effectiveness_check_date)}</td>
          </tr>
          <tr>
            <td className="label-cell">ผู้ตรวจสอบ / Verified By</td>
            <td className="value-cell">{val(d.verified_by)}</td>
            <td className="label-cell">วันที่ตรวจสอบ</td>
            <td className="value-cell">{fmt(d.verified_date)}</td>
          </tr>
          <tr>
            <td className="label-cell">ผู้อนุมัติ / Approved By</td>
            <td className="value-cell">{val(d.approved_by)}</td>
            <td className="label-cell">วันที่อนุมัติ</td>
            <td className="value-cell">{fmt(d.approved_date)}</td>
          </tr>
        </tbody>
      </table>

      {/* ===== SIGNATURES ===== */}
      <table className="ncr-table">
        <tbody>
          <tr>
            <td style={{ width: '33.33%', padding: '4px 8px', textAlign: 'center' }}>
              <div style={{ fontSize: '8pt', fontWeight: '600', marginBottom: '18px' }}>ผู้รายงาน / Created by</div>
              <div className="signature-line">{val(d.created_by)}</div>
              <div style={{ fontSize: '7.5pt', marginTop: '3px', color: '#555' }}>วันที่: {fmt(d.created_at)}</div>
            </td>
            <td style={{ width: '33.33%', padding: '4px 8px', textAlign: 'center' }}>
              <div style={{ fontSize: '8pt', fontWeight: '600', marginBottom: '18px' }}>ผู้ตรวจสอบ / Verified by</div>
              <div className="signature-line">{val(d.verified_by)}</div>
              <div style={{ fontSize: '7.5pt', marginTop: '3px', color: '#555' }}>วันที่: {fmt(d.verified_date)}</div>
            </td>
            <td style={{ width: '33.33%', padding: '4px 8px', textAlign: 'center' }}>
              <div style={{ fontSize: '8pt', fontWeight: '600', marginBottom: '18px' }}>ผู้อนุมัติ / Approved by</div>
              <div className="signature-line">{val(d.approved_by)}</div>
              <div style={{ fontSize: '7.5pt', marginTop: '3px', color: '#555' }}>วันที่: {fmt(d.approved_date)}</div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Footer */}
      <div style={{ marginTop: '3mm', fontSize: '7pt', color: '#888', display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #ddd', paddingTop: '2mm' }}>
        <span>{FORM_CODE_CAPA} Rev.{FORM_REVISION}</span>
        <span>{COMPANY_NAME_EN}</span>
        <span>CAPA: {val(d.capa_id)}</span>
      </div>
    </div>
  )
}

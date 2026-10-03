// ---------------------------------------------------------------- RA department KPIs
// Source: "Draft KPI แผนก RA — ปุยแสบปาก" (7 responsibilities, 14 KPIs).
// kind: RATIO  = numerator / denominator x 100 (%)   AVG = numerator / denominator   NUMBER = value entered directly
// freq: M = monthly (YYYY-MM)   Q = quarterly (YYYY-Qn)   E = per event (YYYY-MM-DD + subject)
// op:   GE = higher is better (value >= target)   LE = lower is better (value <= target)
// target: null = no target yet (baseline must be set by an approver, with a reference, in the app)
// The server always calculates the value itself; every result must carry a source reference (drill-down).
const KPI_GROUPS = [
  'ขึ้นทะเบียน/จดแจ้งผลิตภัณฑ์กับ อย. (อ.17, สบ.5/1, ฉลาก GHP)',
  'ฉลากโภชนาการ ข้อความโฆษณา และการกล่าวอ้าง (Claim)',
  'ตรวจสอบสูตร วัตถุดิบ COA/Specification',
  'ติดตามกฎหมาย ประกาศ อย. และข้อกำหนดอาหารพร้อมปรุง/เครื่องแกง',
  'สนับสนุนการออกสินค้าใหม่ (Creative, E-Commerce, Production, Admin)',
  'ดูแลระบบเอกสารมาตรฐาน GHP/HACCP ให้พร้อมตรวจสอบ',
  'วางระบบงาน RA ตั้งแต่ต้น',
];
const KPI_DEFS = [
  { key: 'reg_on_time_rate', group: 1, name: 'Registration On-Time Rate',
    formula: '(จำนวน SKU ที่ได้เลข อย./อ.17/สบ.5 ภายในกำหนดที่วางแผนไว้ ÷ จำนวน SKU ที่ยื่นทั้งหมด) × 100',
    kind: 'RATIO', unit: '%', numLabel: 'SKU ที่ได้เลขภายในกำหนด', denLabel: 'SKU ที่ยื่นทั้งหมด',
    op: 'GE', target: 90, targetText: '≥ 90%', source: 'e-Submission Tracking Log', freq: 'M', freqText: 'รายเดือน' },
  { key: 'reg_cycle_time', group: 1, name: 'Registration Cycle Time',
    formula: 'ระยะเวลาเฉลี่ยตั้งแต่เอกสารครบ (Master Document List = EFFECTIVE) จนถึงวันได้เลข อย.',
    kind: 'AVG', unit: 'วัน', numLabel: 'รวมจำนวนวันของทุก SKU (เอกสารครบ → ได้เลข อย.)', denLabel: 'จำนวน SKU ที่ได้เลข อย.',
    op: 'LE', target: null, targetText: 'ตามเป้าที่ตกลงกับผู้บริหาร (ตั้ง Baseline หลังยื่นครั้งแรก)', source: 'RA Tracking Log', freq: 'Q', freqText: 'รายไตรมาส' },
  { key: 'reg_rejection_count', group: 1, name: 'Rejection/Resubmission Count',
    formula: 'จำนวนครั้งที่คำขอถูกตีกลับจาก อย. ต่อ 1 SKU',
    kind: 'NUMBER', unit: 'ครั้ง', valueLabel: 'จำนวนครั้งที่ถูกตีกลับ', subjectLabel: 'SKU / เลขคำขอ',
    op: 'LE', target: 1, targetText: '≤ 1 ครั้ง/SKU', source: 'e-Submission History', freq: 'E', freqText: 'ต่อรอบยื่น' },

  { key: 'label_claim_preapproval_rate', group: 2, name: 'Label/Claim Pre-Approval Rate',
    formula: '% ฉลากและสื่อโฆษณา (TikTok/Shopee/Lazada) ที่ผ่านการตรวจโดย RA ก่อนเผยแพร่จริง',
    kind: 'RATIO', unit: '%', numLabel: 'ชิ้นงานที่ RA ตรวจก่อนเผยแพร่', denLabel: 'ชิ้นงานที่เผยแพร่ทั้งหมด', subjectLabel: 'ฉลาก / สื่อ / แคมเปญ',
    op: 'GE', target: 100, targetText: '100% (ห้ามเผยแพร่ก่อนอนุมัติ)', source: 'Label & Claim Review Log (FM-RA-04)', freq: 'E', freqText: 'ทุกครั้งที่มีการเผยแพร่ใหม่' },
  { key: 'regulatory_warning_count', group: 2, name: 'Regulatory Warning Count',
    formula: 'จำนวนครั้งที่ถูกแจ้งเตือน/ร้องเรียนจาก อย. หรือหน่วยงาน เรื่องฉลาก-โฆษณาไม่ถูกต้อง',
    kind: 'NUMBER', unit: 'ครั้ง', valueLabel: 'จำนวนครั้งที่ถูกแจ้งเตือน/ร้องเรียน',
    op: 'LE', target: 0, targetText: '0 ครั้ง', source: 'Complaint/Warning Log', freq: 'M', freqText: 'รายเดือน' },

  { key: 'rm_document_completeness', group: 3, name: 'Raw Material Document Completeness',
    formula: '% วัตถุดิบที่มี COA/Specification ครบถ้วนก่อนอนุมัติใช้งานจริง',
    kind: 'RATIO', unit: '%', numLabel: 'วัตถุดิบที่มี COA/Spec ครบ', denLabel: 'วัตถุดิบที่อนุมัติใช้งานทั้งหมด',
    op: 'GE', target: 100, targetText: '100%', source: 'Supplier Document Register', freq: 'M', freqText: 'รายเดือน' },
  { key: 'spec_deviation_followup_rate', group: 3, name: 'Spec Deviation Follow-up Rate',
    formula: '% ของ COA ที่ไม่ตรง Spec ที่ถูกเปิดเรื่องติดตามกับ Production/QA-QC ภายใน 3 วันทำการ',
    kind: 'RATIO', unit: '%', numLabel: 'COA ไม่ตรง Spec ที่เปิดเรื่องภายใน 3 วันทำการ', denLabel: 'COA ไม่ตรง Spec ทั้งหมดที่พบ', subjectLabel: 'วัตถุดิบ / ผู้ขาย / เลข COA',
    op: 'GE', target: 100, targetText: '100%', source: 'Supplier NC/COA Log', freq: 'E', freqText: 'ต่อครั้งที่พบ' },

  { key: 'regulatory_update_response_time', group: 4, name: 'Regulatory Update Response Time',
    formula: 'ระยะเวลาตั้งแต่ประกาศ อย./กฎหมายใหม่มีผล จนถึงวันที่ RA แจ้งผลกระทบต่อผลิตภัณฑ์ให้ทีมที่เกี่ยวข้อง',
    kind: 'NUMBER', unit: 'วันทำการ', valueLabel: 'จำนวนวันทำการที่ใช้', subjectLabel: 'ชื่อ/เลขที่ประกาศ',
    op: 'LE', target: 7, targetText: '≤ 7 วันทำการ', source: 'Regulatory Watch Log', freq: 'E', freqText: 'ต่อประกาศที่เกี่ยวข้อง' },
  { key: 'impact_assessment_coverage', group: 4, name: 'Impact Assessment Coverage',
    formula: '% ประกาศที่เกี่ยวข้องกับผลิตภัณฑ์ที่มีการทำ Impact Assessment เป็นลายลักษณ์อักษร',
    kind: 'RATIO', unit: '%', numLabel: 'ประกาศที่ทำ Impact Assessment แล้ว', denLabel: 'ประกาศที่เกี่ยวข้องทั้งหมด',
    op: 'GE', target: 100, targetText: '100%', source: 'Regulatory Watch Log', freq: 'Q', freqText: 'รายไตรมาส' },

  { key: 'launch_readiness_rate', group: 5, name: 'New Product Launch Readiness Rate',
    formula: '% สินค้าใหม่ที่เอกสาร RA (ฉลาก/เลข อย./claim) พร้อมสมบูรณ์ก่อนวันวางขายจริง',
    kind: 'RATIO', unit: '%', numLabel: 'สินค้าใหม่ที่เอกสาร RA พร้อมก่อนวันวางขาย', denLabel: 'สินค้าใหม่ทั้งหมดในรอบนี้', subjectLabel: 'SKU ใหม่',
    op: 'GE', target: 100, targetText: '100% (ห้าม Launch ก่อนเอกสารพร้อม)', source: 'New Product Launch Tracker', freq: 'E', freqText: 'ต่อ SKU ใหม่' },
  { key: 'cross_team_lead_time', group: 5, name: 'Cross-team Coordination Lead Time',
    formula: 'ระยะเวลาเฉลี่ยที่ RA ตอบกลับ/ส่งมอบเอกสารให้ทีม Creative/E-Commerce หลังได้รับคำขอ',
    kind: 'AVG', unit: 'วัน', numLabel: 'รวมจำนวนวันที่ใช้ตอบกลับทุกคำขอ', denLabel: 'จำนวนคำขอทั้งหมด',
    op: 'LE', target: null, targetText: 'ตามเป้าที่ตกลงร่วมกัน (SLA)', source: 'Request/Response Log', freq: 'M', freqText: 'รายเดือน' },

  { key: 'mdl_effective_rate', group: 6, name: 'Master Document List Effective Rate',
    formula: '% เอกสารใน Master Document List ที่มีสถานะ EFFECTIVE เทียบกับแผนทั้งหมด',
    kind: 'RATIO', unit: '%', numLabel: 'เอกสารที่มีสถานะ EFFECTIVE', denLabel: 'เอกสารตามแผนทั้งหมด',
    op: 'GE', target: null, targetText: 'ตาม Milestone ที่วางไว้ (เช่น 100% ภายในไตรมาสที่กำหนด)', source: 'Master Document List', freq: 'M', freqText: 'รายเดือน' },
  { key: 'audit_readiness_score', group: 6, name: 'Audit Readiness Score',
    formula: 'ผลประเมินตนเอง (Self-assessment) ความพร้อมรับตรวจ GHP/HACCP ตาม Checklist ภายใน',
    kind: 'RATIO', unit: '%', numLabel: 'คะแนนที่ได้', denLabel: 'คะแนนเต็ม',
    op: 'GE', target: 90, targetText: '≥ 90%', source: 'Internal Audit Checklist', freq: 'Q', freqText: 'รายไตรมาส' },

  { key: 'ra_system_buildout_progress', group: 7, name: 'RA System Build-out Progress',
    formula: '% Milestone ของแผนวางระบบ RA (SOP/WI/FM/SD ใน Master List + Checklist + Line-up) ที่ทำสำเร็จตามแผน',
    kind: 'RATIO', unit: '%', numLabel: 'Milestone ที่ทำสำเร็จ', denLabel: 'Milestone ตามแผน ณ งวดนี้',
    op: 'GE', target: null, targetText: 'ตาม Roadmap ที่ตกลงกับผู้บริหาร', source: 'RA Project Roadmap / Line-up Tracker', freq: 'M', freqText: 'รายเดือน' },
];
const KPI_PERIOD_RE = { M: /^\d{4}-(0[1-9]|1[0-2])$/, Q: /^\d{4}-Q[1-4]$/, E: /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/ };

/** Latest period that may be reported, in Thailand time (UTC+7): results cannot be recorded for the future. */
function kpiCurrentPeriod(freq) {
  const today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  if (freq === 'E') return today;
  if (freq === 'M') return today.slice(0, 7);
  return `${today.slice(0, 4)}-Q${Math.ceil(Number(today.slice(5, 7)) / 3)}`;
}

async function handleKpi(request, env, user, path, method) {
  if (method === 'GET' && path === '/api/kpi') {
    const [results, targets] = await Promise.all([
      env.DB.prepare(
        `SELECT r.*, u.display_name AS created_by_name, v.display_name AS voided_by_name
         FROM reg_kpi_results r LEFT JOIN users u ON u.id = r.created_by LEFT JOIN users v ON v.id = r.voided_by
         ORDER BY r.period DESC, r.created_at DESC LIMIT 2000`).all(),
      env.DB.prepare(
        `SELECT t.*, u.display_name AS set_by_name FROM reg_kpi_targets t LEFT JOIN users u ON u.id = t.set_by ORDER BY t.id`).all(),
    ]);
    return json({ groups: KPI_GROUPS, defs: KPI_DEFS, results: results.results, targets: targets.results });
  }
  if (method !== 'POST') return null;

  if (path === '/api/kpi/results') {
    if (!user.roles.some((r) => r === 'RA' || r === 'R&D' || r === 'QA' || r === 'MANAGEMENT')) {
      fail(403, 'FORBIDDEN', 'บัญชีนี้ไม่มีสิทธิ์บันทึกผล KPI');
    }
    const input = await readJson(request);
    const def = KPI_DEFS.find((d) => d.key === str(input.kpiKey));
    if (!def) fail(400, 'BAD_KPI', 'ไม่พบ KPI นี้');
    const period = str(input.period);
    if (!KPI_PERIOD_RE[def.freq].test(period)) fail(400, 'BAD_PERIOD', 'กรุณาเลือกงวด/วันที่ให้ถูกต้อง');
    if (def.freq === 'E' && new Date(`${period}T00:00:00Z`).toISOString().slice(0, 10) !== period) fail(400, 'BAD_PERIOD', 'วันที่ไม่ถูกต้อง');
    if (period > kpiCurrentPeriod(def.freq)) fail(400, 'FUTURE_PERIOD', 'บันทึกผลล่วงหน้าไม่ได้ (งวด/วันที่ยังมาไม่ถึง)');
    const subject = def.freq === 'E' ? str(input.subject).slice(0, 200) : '';
    if (def.freq === 'E' && !subject) fail(400, 'REQUIRED', `กรุณาระบุ ${def.subjectLabel || 'เรื่องที่วัด'}`);
    const sourceRef = str(input.sourceRef).slice(0, 300);
    if (!sourceRef) fail(400, 'SOURCE_REQUIRED', 'ต้องระบุเอกสาร/Log อ้างอิงของตัวเลขนี้ (ห้ามใช้ค่าประมาณ)');

    const num = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v));
    let numerator = null, denominator = null, value;
    if (def.kind === 'NUMBER') {
      value = num(input.value);
      if (!Number.isFinite(value) || value < 0) fail(400, 'BAD_NUMBER', `กรุณากรอก ${def.valueLabel} เป็นตัวเลขตั้งแต่ 0 ขึ้นไป`);
      if (def.unit === 'ครั้ง' && !Number.isInteger(value)) fail(400, 'BAD_NUMBER', 'จำนวนครั้งต้องเป็นจำนวนเต็ม');
    } else {
      numerator = num(input.numerator); denominator = num(input.denominator);
      if (!Number.isFinite(numerator) || numerator < 0) fail(400, 'BAD_NUMBER', `กรุณากรอก "${def.numLabel}" เป็นตัวเลขตั้งแต่ 0 ขึ้นไป`);
      if (!Number.isFinite(denominator) || denominator <= 0) fail(400, 'BAD_NUMBER', `"${def.denLabel}" ต้องมากกว่า 0 (ถ้างวดนี้ไม่มีรายการ ไม่ต้องบันทึกผล)`);
      if (def.kind === 'RATIO' && numerator > denominator) fail(400, 'BAD_NUMBER', `"${def.numLabel}" ต้องไม่มากกว่า "${def.denLabel}"`);
      value = def.kind === 'RATIO' ? (numerator / denominator) * 100 : numerator / denominator;
    }
    value = Math.round(value * 100) / 100;

    const dup = await env.DB.prepare(
      'SELECT id FROM reg_kpi_results WHERE kpi_key = ? AND period = ? AND subject = ? AND voided_at IS NULL',
    ).bind(def.key, period, subject).first();
    if (dup) fail(409, 'DUPLICATE', `มีผลของ${def.freq === 'E' ? 'เรื่องนี้ในวันนี้' : 'งวดนี้'}แล้ว (${dup.id}) ถ้าต้องแก้ไข ให้ยกเลิกรายการเดิมก่อนแล้วบันทึกใหม่`);

    const note = str(input.note).slice(0, 500);
    for (let attempt = 0; attempt < 3; attempt++) {
      const row = await env.DB.prepare('SELECT MAX(CAST(substr(id, 4) AS INTEGER)) AS n FROM reg_kpi_results').first();
      const id = 'KR-' + String((row?.n || 0) + 1).padStart(4, '0');
      const after = { kpi: def.name, period, subject, numerator, denominator, value, unit: def.unit, sourceRef, note };
      try {
        await env.DB.batch([
          env.DB.prepare('INSERT INTO reg_kpi_results (id, kpi_key, period, subject, numerator, denominator, value, source_ref, note, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
            .bind(id, def.key, period, subject, numerator, denominator, value, sourceRef, note, user.id),
          audit(env, user, 'CREATE', 'kpiResults', id, null, after),
        ]);
        return json({ ok: true, id, value }, 201);
      } catch (e) {
        const msg = String(e);
        if (msg.includes('reg_kpi_results.id')) continue; // id race: try the next number
        if (msg.includes('UNIQUE')) fail(409, 'DUPLICATE', 'มีผลของงวดนี้แล้ว กรุณาดึงข้อมูลใหม่');
        throw e;
      }
    }
    fail(409, 'ID_CONFLICT', 'สร้างเลขที่ไม่สำเร็จ กรุณาลองใหม่');
  }

  const voidMatch = path.match(/^\/api\/kpi\/results\/(KR-\d+)\/void$/);
  if (voidMatch) {
    const row = await env.DB.prepare('SELECT * FROM reg_kpi_results WHERE id = ?').bind(voidMatch[1]).first();
    if (!row) fail(404, 'NOT_FOUND', `ไม่พบรายการ ${voidMatch[1]}`);
    if (row.voided_at) fail(409, 'LOCKED', 'รายการนี้ถูกยกเลิกไปแล้ว');
    if (row.created_by !== user.id && !user.canApprove) fail(403, 'FORBIDDEN', 'ยกเลิกได้เฉพาะผู้บันทึกหรือผู้อนุมัติ');
    const input = await readJson(request);
    const reason = str(input.reason).slice(0, 300);
    if (!reason) fail(400, 'REASON_REQUIRED', 'กรุณาระบุเหตุผลที่ยกเลิก');
    const res = await env.DB.batch([
      env.DB.prepare('UPDATE reg_kpi_results SET voided_at = CURRENT_TIMESTAMP, voided_by = ?, void_reason = ? WHERE id = ? AND voided_at IS NULL')
        .bind(user.id, reason, row.id),
      audit(env, user, 'VOID', 'kpiResults', row.id, { value: row.value, period: row.period, subject: row.subject, sourceRef: row.source_ref }, null, reason),
    ]);
    if (!res[0].meta.changes) fail(409, 'LOCKED', 'รายการนี้ถูกยกเลิกไปแล้ว');
    return json({ ok: true });
  }

  if (path === '/api/kpi/targets') {
    if (!user.canApprove) fail(403, 'FORBIDDEN', 'ตั้งเป้าหมาย KPI ได้เฉพาะผู้อนุมัติ');
    const input = await readJson(request);
    const def = KPI_DEFS.find((d) => d.key === str(input.kpiKey));
    if (!def) fail(400, 'BAD_KPI', 'ไม่พบ KPI นี้');
    const value = input.value === '' || input.value === null || input.value === undefined ? NaN : Number(input.value);
    if (!Number.isFinite(value) || value < 0) fail(400, 'BAD_NUMBER', 'กรุณากรอกค่าเป้าหมายเป็นตัวเลขตั้งแต่ 0 ขึ้นไป');
    if (def.kind === 'RATIO' && value > 100) fail(400, 'BAD_NUMBER', 'เป้าหมายแบบร้อยละต้องไม่เกิน 100');
    const basisRef = str(input.basisRef).slice(0, 300);
    if (!basisRef) fail(400, 'BASIS_REQUIRED', 'ต้องระบุที่มาของเป้าหมาย (เช่น มติผู้บริหาร หรือ Baseline จากรอบจริง) ห้ามตั้งเป้าจากการคาดเดา');
    const prev = await env.DB.prepare('SELECT target_value FROM reg_kpi_targets WHERE kpi_key = ? ORDER BY id DESC LIMIT 1').bind(def.key).first();
    await env.DB.batch([
      env.DB.prepare('INSERT INTO reg_kpi_targets (kpi_key, target_value, basis_ref, set_by) VALUES (?, ?, ?, ?)').bind(def.key, value, basisRef, user.id),
      audit(env, user, 'SET_TARGET', 'kpiTargets', def.key, { target: prev ? prev.target_value : def.target }, { target: value }, basisRef),
    ]);
    return json({ ok: true }, 201);
  }
  return null;
}


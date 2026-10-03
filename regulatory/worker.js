// Puisabpak Regulatory — single-file Worker (built 2026-10-03)
// Paste this whole file into Cloudflare dashboard > Workers > puisabpak-regulatory > Edit code, then Deploy.
// Required binding: D1 database "ra-application" with variable name DB.
/**
 * Puisabpak Regulatory — Cloudflare Worker (free plan)
 *
 * - Serves the PWA from ./public (Workers Static Assets)
 * - /api/*  JSON API backed by the shared D1 database "ra-application"
 * - Login: cookie session (HttpOnly), PBKDF2 password hashes in reg_credentials
 * - Controlled records: products, formulas (100% rule), label checklists
 * - Rules enforced here AND in D1 triggers: approved = locked, no self-approval,
 *   unique revision per product, only drafts deletable, append-only audit trail.
 */

               
                 
                  
 

                                                                      
const COLLECTIONS               = ['regProducts', 'formulaControl', 'labelChecklist'];
const ID_PREFIX                             = {
  regProducts: 'PROD-NP-',
  formulaControl: 'FM-',
  labelChecklist: 'LB-',
};

const PRODUCT_STATUSES = [
  'CONCEPT', 'CLASSIFICATION_REVIEW', 'FORMULA_REVIEW', 'LABEL_REVIEW', 'DOCUMENT_PREPARATION',
  'READY_TO_SUBMIT', 'SUBMITTED', 'AUTHORITY_QUERY', 'REVISION_REQUIRED', 'APPROVED',
  'REJECTED', 'CANCELLED', 'POST_APPROVAL_CHANGE',
];

const SESSION_COOKIE = 'reg_session';
const SESSION_HOURS = 12;
const PBKDF2_ITERATIONS = 100_000; // Workers maximum

                
             
                
               
                  
                      
                   
 

                     
                         
             
                 
               
                  
                     
                     
                             
                             
                     
                     
 

class HttpError extends Error {
  status        ;
  code        ;
  constructor(status        , code        , message        ) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// ---------------------------------------------------------------- helpers

const SECURITY_HEADERS                         = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
};

function json(value         , status = 200, extra                         = {})           {
  return new Response(JSON.stringify(value), { status, headers: { ...SECURITY_HEADERS, ...extra } });
}

function fail(status        , code        , message        )        {
  throw new HttpError(status, code, message);
}

async function readJson                             (request         )             {
  // Requiring a JSON body blocks cross-site form posts (simple CSRF protection).
  if (!(request.headers.get('content-type') || '').includes('application/json')) {
    fail(415, 'BAD_CONTENT_TYPE', 'ต้องส่งข้อมูลแบบ JSON');
  }
  try {
    return (await request.json())     ;
  } catch {
    fail(400, 'BAD_JSON', 'รูปแบบข้อมูลไม่ถูกต้อง');
  }
}

const b64 = (buf                          ) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s        ) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function sha256Hex(text        )                  {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function pbkdf2(password        , salt            , iterations        )                      {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

async function hashPassword(password        )                  {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${b64(salt)}$${b64(hash)}`;
}

async function verifyPassword(password        , stored        )                   {
  const [scheme, iter, salt, hash] = stored.split('$');
  if (scheme !== 'pbkdf2' || !iter || !salt || !hash) return false;
  const actual = await pbkdf2(password, unb64(salt), Number(iter));
  const expected = unb64(hash);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
  return diff === 0;
}

function checkPasswordStrength(password         )         {
  if (typeof password !== 'string' || password.length < 8) fail(400, 'WEAK_PASSWORD', 'รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร');
  return password;
}

function cookieValue(request         , name        )                {
  const raw = request.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

function sessionCookie(token        , url     , maxAge        )         {
  const secure = url.protocol === 'https:' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
}

// ---------------------------------------------------------------- users & auth

async function loadUser(env     , userId        )                       {
  const row = await env.DB.prepare('SELECT id, email, display_name FROM users WHERE id = ? AND active = 1')
    .bind(userId).first                                                     ();
  if (!row) return null;
  const roles = await env.DB.prepare('SELECT role, can_approve FROM user_roles WHERE user_id = ?')
    .bind(userId).all                                       ();
  const list = roles.results;
  const canApprove = list.some((r) => r.can_approve === 1);
  const isAdmin = list.some((r) => r.role === 'MANAGEMENT' || (r.role === 'RA' && r.can_approve === 1));
  return { id: row.id, email: row.email, name: row.display_name, roles: list.map((r) => r.role), canApprove, isAdmin };
}

async function currentUser(request         , env     )                       {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) return null;
  const session = await env.DB.prepare(
    "SELECT user_id FROM reg_sessions WHERE token_hash = ? AND expires_at > datetime('now')",
  ).bind(await sha256Hex(token)).first                     ();
  return session ? loadUser(env, session.user_id) : null;
}

async function startSession(env     , user      , url     )                    {
  const token = b64(crypto.getRandomValues(new Uint8Array(32))).replace(/[+/=]/g, '');
  await env.DB.batch([
    env.DB.prepare("DELETE FROM reg_sessions WHERE user_id = ? OR expires_at <= datetime('now')").bind(user.id),
    env.DB.prepare(`INSERT INTO reg_sessions (token_hash, user_id, expires_at) VALUES (?, ?, datetime('now', '+${SESSION_HOURS} hours'))`)
      .bind(await sha256Hex(token), user.id),
  ]);
  return json({ user }, 200, { 'set-cookie': sessionCookie(token, url, SESSION_HOURS * 3600) });
}

function audit(
  env     , user                               , action        ,
  collection               , recordId               , before         , after         , reason                ,
)                      {
  return env.DB.prepare(
    'INSERT INTO reg_audit (user_id, user_email, action, collection, record_id, before_json, after_json, reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(
    user.id, user.email, action, collection, recordId,
    before === undefined || before === null ? null : JSON.stringify(before),
    after === undefined || after === null ? null : JSON.stringify(after),
    reason ?? null,
  );
}

/** Accepts a full email or the part before "@" (e.g. "ra"). */
async function findUserByLogin(env     , login        ) {
  const value = login.trim().toLowerCase();
  if (!value) return null;
  if (value.includes('@')) {
    return env.DB.prepare('SELECT id FROM users WHERE lower(email) = ? AND active = 1').bind(value).first                ();
  }
  const rows = await env.DB.prepare("SELECT id FROM users WHERE lower(email) LIKE ? AND active = 1")
    .bind(`${value}@%`).all                ();
  return rows.results.length === 1 ? rows.results[0] : null;
}

// ---------------------------------------------------------------- records

function toApi(row           , names                     ) {
  return {
    ...JSON.parse(row.data),
    id: row.id,
    status: row.status,
    version: row.version,
    createdBy: row.created_by,
    createdByName: names.get(row.created_by) || row.created_by,
    updatedBy: row.updated_by,
    updatedByName: names.get(row.updated_by) || row.updated_by,
    approvedBy: row.approved_by,
    approvedByName: row.approved_by ? names.get(row.approved_by) || row.approved_by : null,
    approvedAt: row.approved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function userNames(env     )                               {
  const rows = await env.DB.prepare('SELECT id, display_name FROM users').all                                      ();
  return new Map(rows.results.map((r) => [r.id, r.display_name]));
}

async function getRecord(env     , collection            , id        )                     {
  const row = await env.DB.prepare('SELECT * FROM reg_records WHERE collection = ? AND id = ?')
    .bind(collection, id).first           ();
  if (!row) fail(404, 'NOT_FOUND', `ไม่พบรายการ ${id}`);
  return row;
}

async function listRecords(env     , collection            )                       {
  const rows = await env.DB.prepare('SELECT * FROM reg_records WHERE collection = ? ORDER BY id')
    .bind(collection).all           ();
  return rows.results;
}

async function nextId(env     , collection            )                  {
  const prefix = ID_PREFIX[collection];
  const row = await env.DB.prepare(
    'SELECT MAX(CAST(substr(id, ?) AS INTEGER)) AS n FROM reg_records WHERE collection = ? AND id LIKE ?',
  ).bind(prefix.length + 1, collection, `${prefix}%`).first                      ();
  return prefix + String((row?.n || 0) + 1).padStart(4, '0');
}

const str = (v         ) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim());

/** Pulls only known fields from the client and validates them. Returns [status, data]. */
async function cleanInput(
  env     , collection            , input                         , selfId               ,
)                                             {
  if (collection === 'regProducts') {
    const data = {
      productCode: str(input.productCode),
      brand: str(input.brand),
      thaiProductName: str(input.thaiProductName),
      englishProductName: str(input.englishProductName),
      regulatoryClassification: str(input.regulatoryClassification),
      rawRtcParcookedRteStatus: str(input.rawRtcParcookedRteStatus),
      chilledFrozenStatus: str(input.chilledFrozenStatus),
      registrationStatus: str(input.registrationStatus) || 'CONCEPT',
      thaiFdaNumber: str(input.thaiFdaNumber),
      approvalDate: str(input.approvalDate),
      note: str(input.note),
      // product-name amendment tracking (สบ.8)
      registeredNameTh: str(input.registeredNameTh),
      registeredNameEn: str(input.registeredNameEn),
      proposedNameTh: str(input.proposedNameTh),
      proposedNameEn: str(input.proposedNameEn),
      sb8Status: str(input.sb8Status),
      sb8Date: str(input.sb8Date),
      sb8Ref: str(input.sb8Ref),
    };
    if (!['', 'PENDING', 'SUBMITTED', 'APPROVED'].includes(data.sb8Status)) fail(400, 'BAD_STATUS', 'สถานะแก้ไข สบ.8 ไม่ถูกต้อง');
    if (data.sb8Status === 'APPROVED' && !data.sb8Date) fail(400, 'REQUIRED', 'สถานะ สบ.8 อนุมัติแล้ว ต้องระบุวันที่อนุมัติ');
    if (data.sb8Status && !data.proposedNameTh) fail(400, 'REQUIRED', 'กรุณากรอกชื่อที่เสนอใหม่ (ภาษาไทย)');
    if (!data.productCode) fail(400, 'REQUIRED', 'กรุณากรอก Product Code');
    if (!data.thaiProductName) fail(400, 'REQUIRED', 'กรุณากรอกชื่อผลิตภัณฑ์ภาษาไทย');
    if (!data.brand) fail(400, 'REQUIRED', 'กรุณากรอกแบรนด์');
    if (!PRODUCT_STATUSES.includes(data.registrationStatus)) fail(400, 'BAD_STATUS', 'สถานะไม่ถูกต้อง');
    if (data.registrationStatus === 'APPROVED' && !data.thaiFdaNumber) {
      fail(400, 'REQUIRED', 'สถานะอนุมัติแล้วต้องมีเลขสารบบอาหาร (อย.)');
    }
    const dup = await env.DB.prepare(
      "SELECT id FROM reg_records WHERE collection = 'regProducts' AND id <> ? AND json_extract(data, '$.productCode') = ?",
    ).bind(selfId || '', data.productCode).first                ();
    if (dup) fail(409, 'DUPLICATE', `Product Code นี้ใช้แล้วใน ${dup.id}`);
    return [data.registrationStatus, data];
  }

  // formula & label both belong to a product
  const productId = str(input.productId);
  if (!productId) fail(400, 'REQUIRED', 'กรุณาเลือกผลิตภัณฑ์');
  await getRecord(env, 'regProducts', productId);

  if (collection === 'formulaControl') {
    const revision = str(input.formulaRevision);
    if (!revision) fail(400, 'REQUIRED', 'กรุณากรอก Revision ของสูตร');
    const raw = Array.isArray(input.ingredients) ? input.ingredients : [];
    const ingredients = raw.map((r) => {
      const item = (r || {})                           ;
      return { ingredient: str(item.ingredient), percentage: Number(item.percentage), note: str(item.note) };
    }).filter((r) => r.ingredient || Number.isFinite(r.percentage));
    if (!ingredients.length) fail(400, 'REQUIRED', 'ต้องมีส่วนประกอบอย่างน้อย 1 รายการ');
    let totalE4 = 0; // integer math in units of 0.0001 % so 33.3333 + 66.6667 == 100 exactly
    ingredients.forEach((it, i) => {
      if (!it.ingredient) fail(400, 'REQUIRED', `แถวที่ ${i + 1}: กรุณากรอกชื่อส่วนประกอบ`);
      if (!Number.isFinite(it.percentage) || it.percentage <= 0) fail(400, 'BAD_PERCENT', `แถวที่ ${i + 1}: ร้อยละต้องมากกว่า 0`);
      totalE4 += Math.round(it.percentage * 10000);
    });
    if (totalE4 !== 1_000_000) fail(400, 'NOT_100', `ผลรวมสัดส่วนสูตรต้องเท่ากับ 100% (ปัจจุบัน ${totalE4 / 10000}%)`);
    const dup = await env.DB.prepare(
      "SELECT id FROM reg_records WHERE collection = 'formulaControl' AND id <> ? AND json_extract(data, '$.productId') = ? AND json_extract(data, '$.formulaRevision') = ?",
    ).bind(selfId || '', productId, revision).first                ();
    if (dup) fail(409, 'DUPLICATE', `Revision ${revision} ของผลิตภัณฑ์นี้มีแล้วใน ${dup.id}`);
    return ['DRAFT', { productId, formulaRevision: revision, ingredients, totalPercentage: 100, note: str(input.note) }];
  }

  // labelChecklist
  const revision = str(input.labelRevision);
  if (!revision) fail(400, 'REQUIRED', 'กรุณากรอก Revision ของฉลาก');
  const formulaId = str(input.formulaId);
  if (formulaId) {
    const formula = await getRecord(env, 'formulaControl', formulaId);
    if (JSON.parse(formula.data).productId !== productId) fail(400, 'MISMATCH', 'สูตรที่เลือกไม่ใช่ของผลิตภัณฑ์นี้');
  }
  const criteria = await env.DB.prepare('SELECT check_id FROM ra_label_release_checklist').all                      ();
  const valid = new Set(criteria.results.map((c) => String(c.check_id)));
  const checksIn = (input.checks && typeof input.checks === 'object' ? input.checks : {})                                                      ;
  const checks                                                   = {};
  for (const [key, value] of Object.entries(checksIn)) {
    if (!valid.has(key)) continue;
    const result = str(value?.result);
    if (result && !['PASS', 'FAIL', 'NA'].includes(result)) fail(400, 'BAD_RESULT', 'ผลตรวจต้องเป็น PASS / FAIL / NA');
    checks[key] = { result, note: str(value?.note) };
  }
  const dup = await env.DB.prepare(
    "SELECT id FROM reg_records WHERE collection = 'labelChecklist' AND id <> ? AND json_extract(data, '$.productId') = ? AND json_extract(data, '$.labelRevision') = ?",
  ).bind(selfId || '', productId, revision).first                ();
  if (dup) fail(409, 'DUPLICATE', `Revision ${revision} ของฉลากนี้มีแล้วใน ${dup.id}`);
  return ['DRAFT', { productId, labelRevision: revision, formulaId, artworkRef: str(input.artworkRef), checks, note: str(input.note) }];
}

function nextRevision(rev        )         {
  const m = rev.match(/^(.*?)(\d+)$/);
  if (!m) return `${rev}-new`;
  return m[1] + String(Number(m[2]) + 1).padStart(m[2].length, '0');
}

function isLockedCollection(c            ) {
  return c === 'formulaControl' || c === 'labelChecklist';
}

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

// ---------------------------------------------------------------- image attachments
// Photos are stored in D1 (table reg_attachments, base64 text) so no extra binding is needed on the free plan.
// The browser shrinks every photo before upload; the server re-checks size and file signature.
// Append-only like the rest of the system: a photo can be voided with a reason, never deleted or replaced.
const ATT_COLLECTIONS = ['regProducts', 'formulaControl', 'labelChecklist', 'rawMaterials', 'kpiResults'];
const ATT_MAX_BYTES = 1000000; // per photo, after shrinking (D1 row limit is 2 MB)
const ATT_MAX_PER_RECORD = 20;
const ATT_COLS = 'a.id, a.collection, a.record_id, a.file_name, a.mime, a.size, a.sha256, a.caption, a.created_by, a.created_at, a.voided_at, a.void_reason';

function sniffImage(b) {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return null;
}

async function attRecordExists(env, collection, id) {
  if (collection === 'rawMaterials') return !!(await env.DB.prepare('SELECT 1 FROM ra_raw_material_master WHERE material_code = ?').bind(id).first());
  if (collection === 'kpiResults') return !!(await env.DB.prepare('SELECT 1 FROM reg_kpi_results WHERE id = ?').bind(id).first());
  return !!(await env.DB.prepare('SELECT 1 FROM reg_records WHERE collection = ? AND id = ?').bind(collection, id).first());
}

async function handleAttachments(request, env, user, url, path, method) {
  if (method === 'GET' && path === '/api/attachments/counts') {
    const rows = await env.DB.prepare('SELECT collection, record_id, COUNT(*) AS n FROM reg_attachments WHERE voided_at IS NULL GROUP BY collection, record_id').all();
    const counts = {};
    for (const r of rows.results) counts[`${r.collection}|${r.record_id}`] = r.n;
    return json({ counts });
  }

  if (method === 'GET' && path === '/api/attachments') {
    const collection = url.searchParams.get('collection') || '';
    const id = url.searchParams.get('id') || '';
    if (!ATT_COLLECTIONS.includes(collection) || !id) fail(400, 'BAD_REQUEST', 'ระบุรายการไม่ถูกต้อง');
    const rows = await env.DB.prepare(
      `SELECT ${ATT_COLS}, u.display_name AS created_by_name, v.display_name AS voided_by_name
       FROM reg_attachments a LEFT JOIN users u ON u.id = a.created_by LEFT JOIN users v ON v.id = a.voided_by
       WHERE a.collection = ? AND a.record_id = ? ORDER BY a.id`).bind(collection, id).all();
    return json({ rows: rows.results, max: ATT_MAX_PER_RECORD });
  }

  const fileMatch = path.match(/^\/api\/attachments\/(\d+)\/file$/);
  if (method === 'GET' && fileMatch) {
    const row = await env.DB.prepare('SELECT mime, data, file_name FROM reg_attachments WHERE id = ?').bind(Number(fileMatch[1])).first();
    if (!row) fail(404, 'NOT_FOUND', 'ไม่พบรูปนี้');
    const bin = atob(row.data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Response(bytes, { headers: {
      'content-type': row.mime,
      'content-disposition': `inline; filename="attachment-${fileMatch[1]}.${row.mime.split('/')[1]}"`,
      'cache-control': 'private, max-age=86400', // an attachment never changes once stored
      'x-content-type-options': 'nosniff',
    } });
  }

  if (method === 'POST' && path === '/api/attachments') {
    if (!user.roles.some((r) => r === 'RA' || r === 'R&D' || r === 'QA' || r === 'MANAGEMENT')) {
      fail(403, 'FORBIDDEN', 'บัญชีนี้ไม่มีสิทธิ์แนบรูป');
    }
    const input = await readJson(request);
    const collection = str(input.collection);
    const recordId = str(input.recordId);
    if (!ATT_COLLECTIONS.includes(collection) || !recordId) fail(400, 'BAD_REQUEST', 'ระบุรายการไม่ถูกต้อง');
    if (!(await attRecordExists(env, collection, recordId))) fail(404, 'NOT_FOUND', `ไม่พบรายการ ${recordId}`);
    const data = typeof input.dataBase64 === 'string' ? input.dataBase64.replace(/\s+/g, '') : '';
    if (!data) fail(400, 'REQUIRED', 'ไม่พบไฟล์รูป');
    if (data.length > Math.ceil(ATT_MAX_BYTES / 3) * 4) fail(413, 'TOO_LARGE', 'รูปใหญ่เกินไป (สูงสุด 1 MB หลังย่อ)');
    let bin;
    try { bin = atob(data); } catch { fail(400, 'BAD_FILE', 'ไฟล์รูปเสียหาย กรุณาลองใหม่'); }
    if (bin.length > ATT_MAX_BYTES) fail(413, 'TOO_LARGE', 'รูปใหญ่เกินไป (สูงสุด 1 MB หลังย่อ)');
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const mime = sniffImage(bytes);
    if (!mime) fail(400, 'BAD_FILE', 'แนบได้เฉพาะไฟล์รูปภาพ (JPEG / PNG / WebP)');
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const sha256 = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');

    const active = await env.DB.prepare('SELECT id, sha256 FROM reg_attachments WHERE collection = ? AND record_id = ? AND voided_at IS NULL')
      .bind(collection, recordId).all();
    if (active.results.some((a) => a.sha256 === sha256)) fail(409, 'DUPLICATE', 'รูปนี้แนบไว้กับรายการนี้แล้ว');
    if (active.results.length >= ATT_MAX_PER_RECORD) fail(409, 'LIMIT', `แนบได้สูงสุด ${ATT_MAX_PER_RECORD} รูปต่อรายการ`);

    const fileName = (str(input.fileName) || 'photo').replace(/[^\w.\-ก-๙ ]/g, '_').slice(0, 100);
    const caption = str(input.caption).slice(0, 200);
    const inserted = await env.DB.prepare(
      'INSERT INTO reg_attachments (collection, record_id, file_name, mime, size, sha256, caption, data, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id',
    ).bind(collection, recordId, fileName, mime, bytes.length, sha256, caption, data, user.id).first();
    await audit(env, user, 'ATTACH', collection, recordId, null, { attachment: inserted.id, fileName, size: bytes.length, sha256, caption }).run();
    return json({ ok: true, id: inserted.id }, 201);
  }

  const voidMatch = path.match(/^\/api\/attachments\/(\d+)\/void$/);
  if (method === 'POST' && voidMatch) {
    const row = await env.DB.prepare(`SELECT ${ATT_COLS} FROM reg_attachments a WHERE a.id = ?`).bind(Number(voidMatch[1])).first();
    if (!row) fail(404, 'NOT_FOUND', 'ไม่พบรูปนี้');
    if (row.voided_at) fail(409, 'LOCKED', 'รูปนี้ถูกยกเลิกไปแล้ว');
    if (row.created_by !== user.id && !user.canApprove) fail(403, 'FORBIDDEN', 'ยกเลิกได้เฉพาะผู้แนบหรือผู้อนุมัติ');
    const input = await readJson(request);
    const reason = str(input.reason).slice(0, 300);
    if (!reason) fail(400, 'REASON_REQUIRED', 'กรุณาระบุเหตุผลที่ยกเลิก');
    const res = await env.DB.batch([
      env.DB.prepare('UPDATE reg_attachments SET voided_at = CURRENT_TIMESTAMP, voided_by = ?, void_reason = ? WHERE id = ? AND voided_at IS NULL').bind(user.id, reason, row.id),
      audit(env, user, 'VOID_ATTACH', row.collection, row.record_id, { attachment: row.id, fileName: row.file_name, sha256: row.sha256 }, null, reason),
    ]);
    if (!res[0].meta.changes) fail(409, 'LOCKED', 'รูปนี้ถูกยกเลิกไปแล้ว');
    return json({ ok: true });
  }
  return null;
}

// ---------------------------------------------------------------- API routes

async function handleApi(request         , env     , url     )                    {
  const path = url.pathname.replace(/\/+$/, '');
  const method = request.method;

  // ---- public: first-time setup + login
  if (method === 'GET' && path === '/api/setup-status') {
    const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM reg_credentials').first               ();
    return json({ needsSetup: (row?.n || 0) === 0 });
  }

  if (method === 'POST' && path === '/api/setup') {
    // Only works while no one has a password yet. The first admin is an approver
    // (RA approver or MANAGEMENT) chosen by email; everyone else is added afterwards.
    const input = await readJson                                                      (request);
    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM reg_credentials').first               ();
    if ((count?.n || 0) > 0) fail(409, 'ALREADY_SETUP', 'ตั้งค่าผู้ดูแลระบบไปแล้ว');
    const found = await findUserByLogin(env, str(input.login));
    if (!found) fail(404, 'NO_USER', 'ไม่พบผู้ใช้นี้ในระบบ');
    const user = await loadUser(env, found.id);
    if (!user?.isAdmin) fail(403, 'NOT_ADMIN', 'ผู้ดูแลระบบคนแรกต้องเป็น RA ที่อนุมัติได้ หรือ MANAGEMENT');
    const password = checkPasswordStrength(input.password);
    const stmts = [
      env.DB.prepare('INSERT INTO reg_credentials (user_id, password_hash) VALUES (?, ?)').bind(user.id, await hashPassword(password)),
      audit(env, user, 'SETUP_ADMIN', null, user.id, null, null),
    ];
    if (str(input.name)) stmts.push(env.DB.prepare('UPDATE users SET display_name = ? WHERE id = ?').bind(str(input.name), user.id));
    await env.DB.batch(stmts);
    return startSession(env, (await loadUser(env, user.id)) , url);
  }

  if (method === 'POST' && path === '/api/login') {
    const input = await readJson                                       (request);
    const found = await findUserByLogin(env, str(input.login));
    const cred = found
      ? await env.DB.prepare('SELECT password_hash FROM reg_credentials WHERE user_id = ?').bind(found.id).first                           ()
      : null;
    if (!found || !cred || !(await verifyPassword(String(input.password || ''), cred.password_hash))) {
      fail(401, 'INVALID_LOGIN', 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
    }
    const user = await loadUser(env, found.id);
    if (!user) fail(401, 'INVALID_LOGIN', 'บัญชีนี้ถูกปิดใช้งาน');
    await audit(env, user, 'LOGIN', null, user.id, null, null).run();
    return startSession(env, user, url);
  }

  // ---- everything below needs a session
  const user = await currentUser(request, env);

  if (method === 'POST' && path === '/api/logout') {
    const token = cookieValue(request, SESSION_COOKIE);
    if (token) await env.DB.prepare('DELETE FROM reg_sessions WHERE token_hash = ?').bind(await sha256Hex(token)).run();
    return json({ ok: true }, 200, { 'set-cookie': sessionCookie('', url, 0) });
  }

  if (!user) fail(401, 'UNAUTHENTICATED', 'กรุณาเข้าสู่ระบบ');

  if (method === 'GET' && path === '/api/me') return json({ user });

  if (method === 'POST' && path === '/api/me/password') {
    const input = await readJson                                     (request);
    const cred = await env.DB.prepare('SELECT password_hash FROM reg_credentials WHERE user_id = ?').bind(user.id).first                           ();
    if (!cred || !(await verifyPassword(String(input.current || ''), cred.password_hash))) fail(400, 'WRONG_PASSWORD', 'รหัสผ่านเดิมไม่ถูกต้อง');
    const next = checkPasswordStrength(input.next);
    await env.DB.batch([
      env.DB.prepare('UPDATE reg_credentials SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?').bind(await hashPassword(next), user.id),
      audit(env, user, 'CHANGE_PASSWORD', null, user.id, null, null),
    ]);
    return json({ ok: true });
  }

  // ---- all data in one call (small team, small data)
  if (method === 'GET' && path === '/api/data') {
    const names = await userNames(env);
    const records                            = {};
    for (const c of COLLECTIONS) records[c] = (await listRecords(env, c)).map((r) => toApi(r, names));
    const [criteria, materials] = await Promise.all([
      env.DB.prepare('SELECT check_id AS id, check_item AS item, criterion FROM ra_label_release_checklist ORDER BY check_id').all(),
      env.DB.prepare('SELECT * FROM ra_raw_material_master ORDER BY material_code').all(),
    ]);
    return json({ records, ref: { labelCriteria: criteria.results, rawMaterials: materials.results }, serverTime: new Date().toISOString() });
  }

  if (method === 'GET' && path === '/api/audit') {
    const collection = url.searchParams.get('collection');
    const id = url.searchParams.get('id');
    let stmt;
    if (collection && id) {
      stmt = env.DB.prepare('SELECT * FROM reg_audit WHERE collection = ? AND record_id = ? ORDER BY id DESC LIMIT 200').bind(collection, id);
    } else {
      if (!user.canApprove) fail(403, 'FORBIDDEN', 'ดูประวัติทั้งหมดได้เฉพาะผู้อนุมัติ');
      stmt = env.DB.prepare('SELECT * FROM reg_audit ORDER BY id DESC LIMIT 300');
    }
    return json({ rows: (await stmt.all()).results });
  }

  // ---- records
  const recMatch = path.match(/^\/api\/records\/(regProducts|formulaControl|labelChecklist)(?:\/([A-Za-z0-9-]+))?(?:\/(approve|revise))?$/);
  if (recMatch) {
    const collection = recMatch[1]              ;
    const id = recMatch[2] || null;
    const action = recMatch[3] || null;
    if (!user.roles.some((r) => r === 'RA' || r === 'R&D' || r === 'QA' || r === 'MANAGEMENT')) {
      fail(403, 'FORBIDDEN', 'บัญชีนี้ไม่มีสิทธิ์แก้ไขข้อมูล RA');
    }

    // create
    if (method === 'POST' && !id) {
      const input = await readJson(request);
      const [status, data] = await cleanInput(env, collection, input, null);
      for (let attempt = 0; attempt < 3; attempt++) {
        const newId = await nextId(env, collection);
        try {
          await env.DB.batch([
            env.DB.prepare('INSERT INTO reg_records (collection, id, status, data, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?)')
              .bind(collection, newId, status, JSON.stringify(data), user.id, user.id),
            audit(env, user, 'CREATE', collection, newId, null, { status, ...data }),
          ]);
          return json({ record: toApi(await getRecord(env, collection, newId), await userNames(env)) }, 201);
        } catch (e) {
          if (!String(e).includes('UNIQUE')) throw e; // id race: try the next number
        }
      }
      fail(409, 'ID_CONFLICT', 'สร้างเลขที่ไม่สำเร็จ กรุณาลองใหม่');
    }

    if (!id) fail(404, 'NOT_FOUND', 'ไม่พบเส้นทาง');
    const row = await getRecord(env, collection, id);
    const before = { status: row.status, ...JSON.parse(row.data) };

    // update
    if (method === 'PUT' && !action) {
      const input = await readJson                                                                 (request);
      if (Number(input.version) !== row.version) fail(409, 'STALE', 'มีคนแก้ไขรายการนี้ก่อนคุณ กรุณาดึงข้อมูลใหม่');
      if (isLockedCollection(collection) && row.status !== 'DRAFT') {
        fail(409, 'LOCKED', 'รายการที่อนุมัติแล้วแก้ไขไม่ได้ ให้กด "สร้าง Revision ใหม่"');
      }
      const reason = str(input.reason);
      if (collection === 'regProducts' && row.status === 'APPROVED') {
        // registered product: only approvers may change it, and must say why
        if (!user.canApprove) fail(403, 'FORBIDDEN', 'ผลิตภัณฑ์ที่ได้ อย. แล้ว แก้ไขได้เฉพาะผู้อนุมัติ');
        if (!reason) fail(400, 'REASON_REQUIRED', 'กรุณาระบุเหตุผลการแก้ไข');
      }
      const [status, data] = await cleanInput(env, collection, input, id);
      const res = await env.DB.batch([
        env.DB.prepare('UPDATE reg_records SET status = ?, data = ?, version = version + 1, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE collection = ? AND id = ? AND version = ?')
          .bind(status, JSON.stringify(data), user.id, collection, id, row.version),
        audit(env, user, 'UPDATE', collection, id, before, { status, ...data }, reason || null),
      ]);
      if (!res[0].meta.changes) fail(409, 'STALE', 'มีคนแก้ไขรายการนี้ก่อนคุณ กรุณาดึงข้อมูลใหม่');
      return json({ record: toApi(await getRecord(env, collection, id), await userNames(env)) });
    }

    // delete (drafts / concept products only — also enforced by a D1 trigger)
    if (method === 'DELETE' && !action) {
      if (!['DRAFT', 'CONCEPT'].includes(row.status)) fail(409, 'LOCKED', 'ลบได้เฉพาะรายการสถานะ Draft / Concept');
      if (collection === 'regProducts') {
        const linked = await env.DB.prepare(
          "SELECT COUNT(*) AS n FROM reg_records WHERE collection IN ('formulaControl','labelChecklist') AND json_extract(data, '$.productId') = ?",
        ).bind(id).first               ();
        if ((linked?.n || 0) > 0) fail(409, 'IN_USE', 'ผลิตภัณฑ์นี้มีสูตรหรือฉลากผูกอยู่ ลบไม่ได้');
      }
      await env.DB.batch([
        env.DB.prepare('DELETE FROM reg_records WHERE collection = ? AND id = ?').bind(collection, id),
        audit(env, user, 'DELETE', collection, id, before, null),
      ]);
      return json({ ok: true });
    }

    // approve (formula / label)
    if (method === 'POST' && action === 'approve') {
      if (!isLockedCollection(collection)) fail(400, 'NOT_APPLICABLE', 'ผลิตภัณฑ์ใช้การเปลี่ยนสถานะแทนการอนุมัติ');
      const input = await readJson                                       (request);
      if (Number(input.version) !== row.version) fail(409, 'STALE', 'ข้อมูลมีการเปลี่ยนแปลง กรุณาดึงข้อมูลใหม่');
      if (!user.canApprove) fail(403, 'FORBIDDEN', 'บัญชีนี้ไม่มีสิทธิ์อนุมัติ');
      if (row.status !== 'DRAFT') fail(409, 'LOCKED', 'อนุมัติได้เฉพาะรายการ Draft');
      if (row.created_by === user.id || row.updated_by === user.id) {
        fail(403, 'SELF_APPROVAL', 'ห้ามอนุมัติรายการที่ตัวเองจัดทำหรือแก้ไขล่าสุด');
      }
      const data = JSON.parse(row.data);
      if (collection === 'labelChecklist') {
        const criteria = await env.DB.prepare('SELECT check_id FROM ra_label_release_checklist').all                      ();
        const missing = criteria.results.filter((c) => !data.checks?.[String(c.check_id)]?.result);
        if (missing.length) fail(409, 'CHECKLIST_INCOMPLETE', `ยังตรวจฉลากไม่ครบ ${missing.length} ข้อ`);
        const failed = Object.values(data.checks                                      ).filter((c) => c.result === 'FAIL');
        if (failed.length) fail(409, 'CHECKLIST_FAIL', `มีข้อที่ไม่ผ่าน ${failed.length} ข้อ ต้องแก้ไขก่อนอนุมัติ`);
        if (!data.formulaId) fail(409, 'FORMULA_REQUIRED', 'ต้องระบุสูตรที่ฉลากนี้อ้างอิง');
        const formula = await getRecord(env, 'formulaControl', data.formulaId);
        if (formula.status !== 'APPROVED') fail(409, 'FORMULA_NOT_APPROVED', `สูตร ${data.formulaId} ยังไม่ใช่ฉบับอนุมัติปัจจุบัน`);
      }
      // previous approved revision of the same product becomes OBSOLETE
      const previous = await env.DB.prepare(
        "SELECT id FROM reg_records WHERE collection = ? AND status = 'APPROVED' AND json_extract(data, '$.productId') = ?",
      ).bind(collection, data.productId).all                ();
      const stmts = previous.results.flatMap((p) => [
        env.DB.prepare("UPDATE reg_records SET status = 'OBSOLETE', version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE collection = ? AND id = ?").bind(collection, p.id),
        audit(env, user, 'OBSOLETE', collection, p.id, { status: 'APPROVED' }, { status: 'OBSOLETE' }, `แทนที่ด้วย ${id}`),
      ]);
      stmts.push(
        env.DB.prepare("UPDATE reg_records SET status = 'APPROVED', approved_by = ?, approved_at = CURRENT_TIMESTAMP, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE collection = ? AND id = ? AND version = ?")
          .bind(user.id, collection, id, row.version),
        audit(env, user, 'APPROVE', collection, id, { status: 'DRAFT' }, { status: 'APPROVED' }, str(input.reason) || null),
      );
      await env.DB.batch(stmts);
      return json({ record: toApi(await getRecord(env, collection, id), await userNames(env)) });
    }

    // new revision from an approved / obsolete record
    if (method === 'POST' && action === 'revise') {
      if (!isLockedCollection(collection)) fail(400, 'NOT_APPLICABLE', 'ใช้ได้กับสูตรและฉลากเท่านั้น');
      if (row.status === 'DRAFT') fail(409, 'ALREADY_DRAFT', 'รายการนี้ยังเป็น Draft แก้ไขได้เลย');
      const data = JSON.parse(row.data);
      const revKey = collection === 'formulaControl' ? 'formulaRevision' : 'labelRevision';
      let rev = nextRevision(String(data[revKey]));
      // skip revisions that already exist
      for (let i = 0; i < 50; i++) {
        const exists = await env.DB.prepare(
          `SELECT 1 FROM reg_records WHERE collection = ? AND json_extract(data, '$.productId') = ? AND json_extract(data, '$.${revKey}') = ?`,
        ).bind(collection, data.productId, rev).first();
        if (!exists) break;
        rev = nextRevision(rev);
      }
      const copy = { ...data, [revKey]: rev, revisedFrom: id };
      if (collection === 'labelChecklist') copy.checks = {}; // a new label must be re-checked
      const newId = await nextId(env, collection);
      await env.DB.batch([
        env.DB.prepare("INSERT INTO reg_records (collection, id, status, data, created_by, updated_by) VALUES (?, ?, 'DRAFT', ?, ?, ?)")
          .bind(collection, newId, JSON.stringify(copy), user.id, user.id),
        audit(env, user, 'REVISE', collection, newId, null, { status: 'DRAFT', ...copy }, `สร้างจาก ${id}`),
      ]);
      return json({ record: toApi(await getRecord(env, collection, newId), await userNames(env)) }, 201);
    }
  }

  // ---- raw materials (shared table ra_raw_material_master, also read by the QA system)
  const matMatch = path.match(/^\/api\/materials(?:\/([A-Za-z0-9-]+))?$/);
  if (matMatch && method !== 'GET') {
    if (!user.roles.some((r) => r === 'RA' || r === 'R&D' || r === 'QA' || r === 'MANAGEMENT')) {
      fail(403, 'FORBIDDEN', 'บัญชีนี้ไม่มีสิทธิ์แก้ไขทะเบียนวัตถุดิบ');
    }
    const code = matMatch[1] || null;
    const existing = code
      ? await env.DB.prepare('SELECT * FROM ra_raw_material_master WHERE material_code = ?').bind(code).first                         ()
      : null;
    if (code && !existing) fail(404, 'NOT_FOUND', `ไม่พบวัตถุดิบ ${code}`);

    if (method === 'DELETE' && code) {
      try {
        await env.DB.batch([
          env.DB.prepare('DELETE FROM ra_raw_material_master WHERE material_code = ?').bind(code),
          audit(env, user, 'DELETE', 'rawMaterials', code, existing, null),
        ]);
      } catch (e) {
        if (String(e).includes('FOREIGN KEY')) fail(409, 'IN_USE', 'วัตถุดิบนี้ผูกกับผู้ขาย (Supplier) อยู่ ลบไม่ได้');
        throw e;
      }
      return json({ ok: true });
    }

    const input = await readJson(request);
    const text = (v         , max = 500) => str(v).slice(0, max);
    const m = {
      material_name_th: text(input.material_name_th, 200),
      material_name_en: text(input.material_name_en, 200),
      category: text(input.category, 100),
      used_in_sku: text(input.used_in_sku),
      allergen_group: text(input.allergen_group, 200) || 'ไม่มี',
      fda_or_source: text(input.fda_or_source, 200) || '-',
      storage_condition: text(input.storage_condition, 200),
      status_note: text(input.status_note, 1000),
      unit: text(input.unit, 50),
    };
    if (!m.material_name_th) fail(400, 'REQUIRED', 'กรุณากรอกชื่อวัตถุดิบ (ภาษาไทย)');
    const dup = await env.DB.prepare('SELECT material_code FROM ra_raw_material_master WHERE material_name_th = ? AND material_code <> ?')
      .bind(m.material_name_th, code || '').first                           ();
    if (dup) fail(409, 'DUPLICATE', `ชื่อวัตถุดิบนี้มีแล้วใน ${dup.material_code}`);
    // edited in the app, so it no longer mirrors the original source form
    const sourceRevision = `แก้ไขในระบบ ${new Date().toISOString().slice(0, 10)}`;
    const values = [m.material_name_th, m.material_name_en, m.category, m.used_in_sku, m.allergen_group, m.fda_or_source, m.storage_condition, m.status_note, sourceRevision, m.unit];

    if (method === 'POST' && !code) {
      const row = await env.DB.prepare("SELECT MAX(CAST(substr(material_code, 4) AS INTEGER)) AS n FROM ra_raw_material_master WHERE material_code LIKE 'RM-%'").first                      ();
      const newCode = 'RM-' + String((row?.n || 0) + 1).padStart(3, '0');
      await env.DB.batch([
        env.DB.prepare('INSERT INTO ra_raw_material_master (material_name_th, material_name_en, category, used_in_sku, allergen_group, fda_or_source, storage_condition, status_note, source_revision, unit, material_code) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .bind(...values, newCode),
        audit(env, user, 'CREATE', 'rawMaterials', newCode, null, m),
      ]);
      return json({ material: await env.DB.prepare('SELECT * FROM ra_raw_material_master WHERE material_code = ?').bind(newCode).first() }, 201);
    }
    if (method === 'PUT' && code) {
      await env.DB.batch([
        env.DB.prepare('UPDATE ra_raw_material_master SET material_name_th = ?, material_name_en = ?, category = ?, used_in_sku = ?, allergen_group = ?, fda_or_source = ?, storage_condition = ?, status_note = ?, source_revision = ?, unit = ? WHERE material_code = ?')
          .bind(...values, code),
        audit(env, user, 'UPDATE', 'rawMaterials', code, existing, m),
      ]);
      return json({ material: await env.DB.prepare('SELECT * FROM ra_raw_material_master WHERE material_code = ?').bind(code).first() });
    }
  }

  // ---- KPI แผนก RA
  if (path.startsWith('/api/kpi')) {
    const res = await handleKpi(request, env, user, path, method);
    if (res) return res;
  }

  // ---- รูปแนบ
  if (path.startsWith('/api/attachments')) {
    const res = await handleAttachments(request, env, user, url, path, method);
    if (res) return res;
  }

  // ---- user admin (simple)
  if (path === '/api/users' && method === 'GET') {
    if (!user.isAdmin) fail(403, 'FORBIDDEN', 'เฉพาะผู้ดูแลระบบ');
    const rows = await env.DB.prepare(
      `SELECT u.id, u.email, u.display_name AS name, u.active,
              (SELECT group_concat(role || CASE can_approve WHEN 1 THEN '*' ELSE '' END, ', ') FROM user_roles r WHERE r.user_id = u.id) AS roles,
              EXISTS(SELECT 1 FROM reg_credentials c WHERE c.user_id = u.id) AS hasPassword
       FROM users u ORDER BY u.email`,
    ).all();
    return json({ rows: rows.results });
  }

  if (path === '/api/users' && method === 'POST') {
    if (!user.isAdmin) fail(403, 'FORBIDDEN', 'เฉพาะผู้ดูแลระบบ');
    const input = await readJson                                                                                           (request);
    const email = str(input.email).toLowerCase();
    if (!/^[^@\s]+@[^@\s]+$/.test(email)) fail(400, 'BAD_EMAIL', 'อีเมลไม่ถูกต้อง');
    const role = str(input.role);
    if (!['RA', 'QA', 'QC', 'DCC', 'R&D', 'MANAGEMENT'].includes(role)) fail(400, 'BAD_ROLE', 'บทบาทไม่ถูกต้อง');
    const password = checkPasswordStrength(input.password);
    if (await env.DB.prepare('SELECT 1 FROM users WHERE lower(email) = ?').bind(email).first()) fail(409, 'DUPLICATE', 'อีเมลนี้มีอยู่แล้ว');
    const newId = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare('INSERT INTO users (id, email, display_name) VALUES (?, ?, ?)').bind(newId, email, str(input.name) || email),
      env.DB.prepare('INSERT INTO user_roles (user_id, role, can_approve) VALUES (?, ?, ?)').bind(newId, role, input.canApprove ? 1 : 0),
      env.DB.prepare('INSERT INTO reg_credentials (user_id, password_hash) VALUES (?, ?)').bind(newId, await hashPassword(password)),
      audit(env, user, 'CREATE_USER', null, newId, null, { email, role, canApprove: !!input.canApprove }),
    ]);
    return json({ ok: true, id: newId }, 201);
  }

  const pwMatch = path.match(/^\/api\/users\/([^/]+)\/password$/);
  if (pwMatch && method === 'POST') {
    if (!user.isAdmin) fail(403, 'FORBIDDEN', 'เฉพาะผู้ดูแลระบบ');
    const target = await env.DB.prepare('SELECT id, email FROM users WHERE id = ?').bind(pwMatch[1]).first                               ();
    if (!target) fail(404, 'NOT_FOUND', 'ไม่พบผู้ใช้');
    const input = await readJson                       (request);
    const password = checkPasswordStrength(input.password);
    await env.DB.batch([
      env.DB.prepare('INSERT INTO reg_credentials (user_id, password_hash) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET password_hash = excluded.password_hash, updated_at = CURRENT_TIMESTAMP')
        .bind(target.id, await hashPassword(password)),
      env.DB.prepare('DELETE FROM reg_sessions WHERE user_id = ?').bind(target.id),
      audit(env, user, 'RESET_PASSWORD', null, target.id, null, { email: target.email }),
    ]);
    return json({ ok: true });
  }

  fail(404, 'NOT_FOUND', 'ไม่พบเส้นทาง API');
}


// ---------------------------------------------------------------- built-in web page (single-file build)
const STATIC_FILES = {"/index.html":["text/html; charset=utf-8","<!doctype html>\n<html lang=\"th\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1, viewport-fit=cover\">\n<title>Puisabpak Regulatory — อย. / FDA</title>\n<meta name=\"robots\" content=\"noindex\">\n<meta name=\"theme-color\" content=\"#b91c1c\">\n<link rel=\"manifest\" href=\"./manifest.webmanifest\">\n<link rel=\"icon\" href=\"./icon.svg\" type=\"image/svg+xml\">\n<link rel=\"apple-touch-icon\" href=\"./icon-192.png\">\n<meta name=\"apple-mobile-web-app-capable\" content=\"yes\">\n<meta name=\"apple-mobile-web-app-title\" content=\"Puisabpak RA\">\n<link href=\"https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600;700&display=swap\" rel=\"stylesheet\">\n<script src=\"https://cdn.tailwindcss.com\"></script>\n<script>\nif (window.tailwind) tailwind.config = {\n  theme: {\n    extend: {\n      colors: { brand:'#b91c1c', ink:'#15201e', 'ink-mute':'#5b6b68' },\n      fontFamily: { sans:['IBM Plex Sans Thai','sans-serif'] }\n    }\n  }\n};\n</script>\n<style>\n  body { font-family:'IBM Plex Sans Thai',sans-serif; -webkit-tap-highlight-color: transparent; }\n  .input,.select,.textarea { width:100%; padding:9px 11px; border:1px solid #d7dcdf; border-radius:9px; font-size:15px; font-family:inherit; background:#fff; }\n  .input:focus,.select:focus,.textarea:focus { outline:none; border-color:#b91c1c; box-shadow:0 0 0 3px rgba(185,28,28,.12); }\n  .input[readonly],.select:disabled,.textarea[readonly] { background:#f8fafc; color:#334155; }\n  .label { display:block; font-size:12px; font-weight:600; color:#475569; margin-bottom:3px; }\n  .btn { padding:8px 14px; border-radius:9px; font-size:14px; font-weight:600; cursor:pointer; border:1px solid transparent; font-family:inherit; transition:.2s; white-space:nowrap; }\n  .btn:disabled { opacity:.5; cursor:not-allowed; }\n  .btn-primary { background:#b91c1c; color:#fff; }\n  .btn-primary:hover:not(:disabled) { background:#991b1b; }\n  .btn-ghost { background:#fff; color:#b91c1c; border-color:#fca5a5; }\n  .btn-ghost:hover:not(:disabled) { background:#fef2f2; }\n  .btn-ok { background:#15803d; color:#fff; }\n  .btn-ok:hover:not(:disabled) { background:#166534; }\n  .btn-sm { padding:4px 10px; font-size:12px; border-radius:7px; }\n  .card { background:#fff; border:1px solid #e2e8f0; border-radius:14px; box-shadow:0 1px 3px rgba(0,0,0,.05); }\n  table.dt { width:100%; border-collapse:collapse; font-size:13px; }\n  table.dt th,table.dt td { border-bottom:1px solid #eef2f6; padding:8px 10px; text-align:left; vertical-align:top; }\n  table.dt th { background:#f8fafc; font-weight:600; font-size:12px; color:#475569; white-space:nowrap; }\n  .nav-item { display:flex; gap:9px; align-items:center; padding:10px 12px; border-radius:9px; cursor:pointer; font-size:14px; }\n  .nav-item:hover { background:#fef2f2; }\n  .nav-item.active { background:#b91c1c; color:#fff; }\n  .nav-item .badge { margin-left:auto; background:#fde68a; color:#78350f; border-radius:999px; font-size:11px; font-weight:700; padding:0 7px; }\n  .nav-item.active .badge { background:#fff; color:#b91c1c; }\n  .pill { display:inline-block; padding:2px 10px; border-radius:999px; font-size:11px; font-weight:600; white-space:nowrap; }\n  .seg { display:inline-flex; border:1px solid #d7dcdf; border-radius:9px; overflow:hidden; }\n  .seg button { padding:6px 12px; font-size:13px; font-weight:600; background:#fff; color:#475569; border-right:1px solid #d7dcdf; }\n  .seg button:last-child { border-right:0; }\n  .seg button.on-PASS { background:#dcfce7; color:#166534; }\n  .seg button.on-FAIL { background:#fee2e2; color:#991b1b; }\n  .seg button.on-NA { background:#e2e8f0; color:#334155; }\n  .seg button:disabled { cursor:default; }\n  .mat-grid { display:grid; gap:12px; grid-template-columns:repeat(auto-fill, minmax(min(100%, 330px), 1fr)); align-items:stretch; }\n  .mat-dl { display:grid; grid-template-columns:auto 1fr; gap:6px 12px; font-size:13px; margin:0; }\n  .mat-dl dt { color:#64748b; font-size:12px; white-space:nowrap; padding-top:1px; }\n  .mat-dl dd { margin:0; min-width:0; overflow-wrap:anywhere; }\n  .sku { display:inline-block; padding:1px 8px; border-radius:6px; background:#f1f5f9; border:1px solid #e2e8f0; font-size:12px; color:#334155; }\n  .alg-pill { display:inline-block; max-width:60%; padding:3px 10px; border-radius:8px; font-size:11.5px; font-weight:700; line-height:1.35; text-align:right; background:#fee2e2; color:#991b1b; border:1px solid #fecaca; }\n  .mat-note { font-size:12.5px; line-height:1.5; padding:8px 10px; border-radius:8px; background:#f8fafc; border:1px solid #e2e8f0; color:#475569; overflow-wrap:anywhere; }\n  .mat-note.warn { background:#fffbeb; border-color:#fde68a; color:#78350f; }\n  .mat-note.urgent { background:#fef2f2; border-color:#fecaca; color:#7f1d1d; }\n  .fchip { display:inline-flex; align-items:center; gap:7px; padding:6px 12px; border-radius:999px; font-size:13px; font-weight:600; background:#fff; color:#475569; border:1px solid #d7dcdf; cursor:pointer; }\n  .fchip b { font-size:12px; padding:0 7px; border-radius:999px; background:#f1f5f9; color:#334155; }\n  .fchip.alg b { background:#fee2e2; color:#991b1b; }\n  .fchip.warn b { background:#fef3c7; color:#92400e; }\n  .fchip.on { background:#b91c1c; color:#fff; border-color:#b91c1c; }\n  .fchip.on b { background:#fff; color:#b91c1c; }\n  .fchip:focus-visible, .btn:focus-visible { outline:2px solid #15201e; outline-offset:2px; }\n  /* mobile: tables become cards */\n  @media (max-width: 767px) {\n    table.dt.stack thead { display:none; }\n    table.dt.stack tr { display:block; border-bottom:1px solid #eef2f6; padding:8px 4px; }\n    table.dt.stack td { display:flex; gap:10px; border:0; padding:3px 8px; }\n    table.dt.stack td::before { content:attr(data-l); flex:0 0 38%; font-size:11px; color:#64748b; font-weight:600; }\n    table.dt.stack td.act::before { content:''; flex:0; }\n    table.dt.stack td.act { justify-content:flex-end; flex-wrap:wrap; }\n  }\n  @media print { .noprint { display:none !important; } }\n</style>\n</head>\n<body class=\"bg-slate-50 text-ink\">\n\n<!-- LOGIN / FIRST-TIME SETUP -->\n<div id=\"loginScreen\" class=\"hidden min-h-screen items-center justify-center p-5\" style=\"background:linear-gradient(135deg,#7f1d1d 0%,#b91c1c 45%,#27272a 100%)\">\n  <div class=\"card w-full max-w-sm p-6 shadow-xl\">\n    <div class=\"text-center mb-4\">\n      <h1 class=\"text-xl font-bold mt-2 text-brand\">Puisabpak Regulatory</h1>\n      <p class=\"text-xs text-ink-mute\">ระบบงานขึ้นทะเบียน อย. / FDA (ตรา ปุยแสบปาก)</p>\n    </div>\n    <div id=\"loginForm\">\n      <label class=\"label\" for=\"loginUser\">อีเมล หรือชื่อผู้ใช้ (เช่น ra)</label>\n      <input id=\"loginUser\" class=\"input mb-3\" autocomplete=\"username\" autocapitalize=\"off\">\n      <label class=\"label\" for=\"loginPass\">รหัสผ่าน</label>\n      <input id=\"loginPass\" type=\"password\" class=\"input\" autocomplete=\"current-password\">\n      <button id=\"loginBtn\" onclick=\"doLogin()\" class=\"btn btn-primary w-full mt-5 py-2.5\">เข้าสู่ระบบ</button>\n    </div>\n    <div id=\"setupForm\" class=\"hidden\">\n      <div class=\"text-sm bg-amber-50 border border-amber-200 text-amber-900 rounded-lg p-3 mb-3\">\n        ตั้งค่าครั้งแรก: กำหนดรหัสผ่านให้ผู้ดูแลระบบ (RA ที่มีสิทธิ์อนุมัติ หรือ Management)\n      </div>\n      <label class=\"label\" for=\"setupUser\">อีเมล หรือชื่อผู้ใช้ผู้ดูแลระบบ</label>\n      <input id=\"setupUser\" class=\"input mb-3\" value=\"ra\" autocapitalize=\"off\">\n      <label class=\"label\" for=\"setupName\">ชื่อที่แสดง</label>\n      <input id=\"setupName\" class=\"input mb-3\" placeholder=\"เช่น คุณสมชาย (RA)\">\n      <label class=\"label\" for=\"setupPass\">รหัสผ่าน (อย่างน้อย 8 ตัว)</label>\n      <input id=\"setupPass\" type=\"password\" class=\"input mb-3\" autocomplete=\"new-password\">\n      <label class=\"label\" for=\"setupPass2\">ยืนยันรหัสผ่าน</label>\n      <input id=\"setupPass2\" type=\"password\" class=\"input\" autocomplete=\"new-password\">\n      <button id=\"setupBtn\" onclick=\"doSetup()\" class=\"btn btn-primary w-full mt-5 py-2.5\">บันทึกและเข้าสู่ระบบ</button>\n    </div>\n    <div id=\"loginMsg\" class=\"text-xs text-center mt-2 text-ink-mute min-h-[1rem]\"></div>\n    <p class=\"text-[11px] text-ink-mute text-center mt-4 border-t pt-3\">ข้อมูลเก็บบน Cloudflare D1 ร่วมกับระบบ QA</p>\n  </div>\n</div>\n\n<!-- APP -->\n<div id=\"appScreen\" class=\"hidden min-h-screen flex-col\">\n  <header class=\"noprint bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm\">\n    <div class=\"max-w-7xl mx-auto px-4 py-2.5 flex items-center gap-3\">\n      <button onclick=\"toggleNav(true)\" class=\"md:hidden btn btn-ghost px-3 py-1\" aria-label=\"เมนู\">☰</button>\n      <div class=\"flex-1 min-w-0\">\n        <div class=\"font-bold text-sm leading-tight text-brand truncate\">Puisabpak Regulatory — อย. / FDA</div>\n        <div id=\"syncStatus\" class=\"text-[11px] text-ink-mute truncate\">กำลังเชื่อมต่อ…</div>\n      </div>\n      <button onclick=\"pullAll(true)\" class=\"btn btn-ghost text-xs\" title=\"ดึงข้อมูลล่าสุด\">↻<span class=\"hidden sm:inline\"> ดึงข้อมูล</span></button>\n      <button onclick=\"openAccount()\" class=\"btn btn-ghost text-xs\" id=\"meBtn\" title=\"บัญชีของฉัน\">👤</button>\n    </div>\n  </header>\n\n  <div class=\"max-w-7xl mx-auto px-3 sm:px-4 py-5 flex gap-6 w-full flex-1\">\n    <aside id=\"navPane\" class=\"noprint w-64 shrink-0 hidden md:block\">\n      <nav id=\"navList\" class=\"card p-3 sticky top-20 flex flex-col gap-1\"></nav>\n    </aside>\n    <main class=\"flex-1 min-w-0\">\n      <div class=\"noprint mb-4 pb-2 border-b border-slate-200\">\n        <h2 id=\"pageTitle\" class=\"text-xl font-bold text-slate-800\"></h2>\n        <p id=\"pageSubtitle\" class=\"text-xs text-ink-mute mt-1\"></p>\n      </div>\n      <div id=\"pageContent\"></div>\n    </main>\n  </div>\n</div>\n\n<!-- mobile drawer -->\n<div id=\"drawer\" class=\"hidden fixed inset-0 z-40 md:hidden\" onclick=\"if(event.target===this)toggleNav(false)\" style=\"background:rgba(15,23,42,.45)\">\n  <div class=\"bg-white w-72 max-w-[85%] h-full p-3 overflow-y-auto shadow-xl\">\n    <div class=\"font-bold text-brand px-2 py-3\">เมนู</div>\n    <nav id=\"navListMobile\" class=\"flex flex-col gap-1\"></nav>\n  </div>\n</div>\n\n<div id=\"toastBox\" class=\"fixed bottom-4 right-4 left-4 sm:left-auto z-50 space-y-2 noprint\"></div>\n<div id=\"modalRoot\"></div>\n\n<script>\n/* ============================================================================\n * Puisabpak Regulatory — frontend\n * Talks to the Worker on the same domain (/api/...). Login uses an HttpOnly\n * cookie, so nothing sensitive is kept in localStorage.\n * ==========================================================================*/\n\nconst STATUS = {\n  // product registration\n  CONCEPT:['รอพัฒนา (Concept)','slate'], CLASSIFICATION_REVIEW:['ตรวจประเภทอาหาร','amber'],\n  FORMULA_REVIEW:['กำลังตรวจสูตร','amber'], LABEL_REVIEW:['กำลังตรวจฉลาก','amber'],\n  DOCUMENT_PREPARATION:['เตรียมเอกสาร','amber'], READY_TO_SUBMIT:['พร้อมยื่น','blue'],\n  SUBMITTED:['ยื่นคำขอแล้ว','blue'], AUTHORITY_QUERY:['อย. มีคำถาม','orange'],\n  REVISION_REQUIRED:['ต้องแก้ไขคำขอ','orange'], APPROVED:['อนุมัติแล้ว','green'],\n  REJECTED:['ไม่อนุมัติ','red'], CANCELLED:['ยกเลิก','slate'], POST_APPROVAL_CHANGE:['ขอแก้ไขหลังอนุมัติ','orange'],\n  // formula / label\n  DRAFT:['ฉบับร่าง (Draft)','amber'], OBSOLETE:['ยกเลิกใช้ (Obsolete)','slate'],\n};\nconst PRODUCT_STATUS_ORDER = ['CONCEPT','CLASSIFICATION_REVIEW','FORMULA_REVIEW','LABEL_REVIEW','DOCUMENT_PREPARATION','READY_TO_SUBMIT','SUBMITTED','AUTHORITY_QUERY','REVISION_REQUIRED','APPROVED','REJECTED','CANCELLED','POST_APPROVAL_CHANGE'];\nconst SB8 = { PENDING:['รอดำเนินการ','amber'], SUBMITTED:['ยื่นแก้ไขแล้ว','blue'], APPROVED:['อนุมัติแล้ว','green'] };\nfunction sb8Pill(p){ const x = SB8[p.sb8Status]; return x ? `<span class=\"pill ${PILL[x[1]]}\">${esc(x[0])}</span>${p.sb8Status==='APPROVED'&&p.sb8Date?` <span class=\"text-[11px] text-ink-mute whitespace-nowrap\">${fmtDate(p.sb8Date)}</span>`:''}` : '<span class=\"text-slate-300\">-</span>'; }\nconst PILL = {\n  slate:'bg-slate-100 text-slate-700 border border-slate-200', amber:'bg-amber-100 text-amber-800 border border-amber-200',\n  blue:'bg-blue-50 text-blue-800 border border-blue-200', orange:'bg-orange-100 text-orange-800 border border-orange-200',\n  green:'bg-green-100 text-green-800 border border-green-200', red:'bg-red-100 text-red-800 border border-red-200',\n};\n\nlet ME = null;\nlet DB = { regProducts:[], formulaControl:[], labelChecklist:[] };\nlet REF = { labelCriteria:[], rawMaterials:[] };\nlet currentPage = 'regDashboard';\nlet _search = '';\n\n/* -------------------------------------------------------------- API */\nasync function api(method, path, body){\n  const init = { method, headers:{}, credentials:'same-origin' };\n  if (body !== undefined) { init.headers['content-type'] = 'application/json'; init.body = JSON.stringify(body); }\n  let res;\n  try { res = await fetch(path, init); }\n  catch { throw new Error('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจสอบอินเทอร์เน็ต'); }\n  let data = null;\n  try { data = await res.json(); } catch {}\n  if (res.status === 401 && !['/api/login','/api/setup','/api/me'].some(p => path.startsWith(p))) { ME = null; showLogin(); }\n  if (!res.ok) throw new Error((data && data.error && data.error.message) || ('เกิดข้อผิดพลาด (' + res.status + ')'));\n  return data;\n}\n\n/* -------------------------------------------------------------- login */\nfunction loginMsg(text, error){ const m = document.getElementById('loginMsg'); m.className = 'text-xs text-center mt-2 min-h-[1rem] ' + (error ? 'text-red-600' : 'text-ink-mute'); m.textContent = text || ''; }\n\nasync function showLogin(){\n  document.getElementById('appScreen').classList.add('hidden');\n  document.getElementById('appScreen').classList.remove('flex');\n  const l = document.getElementById('loginScreen'); l.classList.remove('hidden'); l.classList.add('flex');\n  try {\n    const s = await api('GET','/api/setup-status');\n    document.getElementById('setupForm').classList.toggle('hidden', !s.needsSetup);\n    document.getElementById('loginForm').classList.toggle('hidden', s.needsSetup);\n  } catch (e) { loginMsg(e.message, true); }\n}\n\nasync function doLogin(){\n  const login = document.getElementById('loginUser').value.trim();\n  const password = document.getElementById('loginPass').value;\n  if (!login || !password) return loginMsg('กรอกชื่อผู้ใช้และรหัสผ่าน', true);\n  const btn = document.getElementById('loginBtn'); btn.disabled = true; btn.textContent = 'กำลังตรวจสอบ...';\n  try {\n    const r = await api('POST','/api/login',{ login, password });\n    document.getElementById('loginPass').value = ''; loginMsg('');\n    ME = r.user; showApp();\n  } catch (e) { loginMsg(e.message, true); }\n  finally { btn.disabled = false; btn.textContent = 'เข้าสู่ระบบ'; }\n}\n\nasync function doSetup(){\n  const login = document.getElementById('setupUser').value.trim();\n  const name = document.getElementById('setupName').value.trim();\n  const p1 = document.getElementById('setupPass').value, p2 = document.getElementById('setupPass2').value;\n  if (p1 !== p2) return loginMsg('รหัสผ่านทั้งสองช่องไม่ตรงกัน', true);\n  const btn = document.getElementById('setupBtn'); btn.disabled = true;\n  try { const r = await api('POST','/api/setup',{ login, name, password:p1 }); ME = r.user; showApp(); }\n  catch (e) { loginMsg(e.message, true); }\n  finally { btn.disabled = false; }\n}\n\nasync function doLogout(){\n  try { await api('POST','/api/logout',{}); } catch {}\n  ME = null; currentPage = 'regDashboard'; closeModal(); showLogin();\n}\n\n/* -------------------------------------------------------------- data */\nasync function showApp(){\n  const l = document.getElementById('loginScreen'); l.classList.add('hidden'); l.classList.remove('flex');\n  document.getElementById('appScreen').classList.remove('hidden'); document.getElementById('appScreen').classList.add('flex');\n  buildNav(); await pullAll(); navigateTo(currentPage);\n}\n\nasync function pullAll(announce){\n  setSync('กำลังดึงข้อมูล…');\n  try {\n    const r = await api('GET','/api/data');\n    DB = r.records; REF = r.ref; await loadAttCounts();\n    setSync('ข้อมูลล่าสุด ' + new Date().toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'}) + ' · ' + ME.name);\n    buildNav();\n    if (announce) { navigateTo(currentPage); toast('ดึงข้อมูลล่าสุดแล้ว ✓'); }\n  } catch (e) { setSync('ดึงข้อมูลไม่สำเร็จ'); toast(e.message,'error'); }\n}\nfunction setSync(t){ document.getElementById('syncStatus').textContent = t; }\n\n/* -------------------------------------------------------------- helpers */\nfunction esc(s){ return String(s==null?'':s).replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c])); }\nfunction fmtDate(d){ if (!d) return '-'; const t = new Date(String(d).replace(' ','T') + (String(d).length===19?'Z':'')); return isNaN(t) ? esc(String(d).slice(0,10)) : t.toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'2-digit'}); }\nfunction pill(status){ const s = STATUS[status] || [status,'slate']; return `<span class=\"pill ${PILL[s[1]]}\">${esc(s[0])}</span>`; }\nfunction product(id){ return DB.regProducts.find(p => p.id === id); }\nfunction productName(id){ const p = product(id); return p ? `${p.thaiProductName} (${p.productCode})` : id || '-'; }\nfunction current(collection, productId){ return DB[collection].find(x => x.productId === productId && x.status === 'APPROVED'); }\nfunction canApprove(rec){ return ME.canApprove && rec.status === 'DRAFT' && rec.createdBy !== ME.id && rec.updatedBy !== ME.id; }\nfunction waitingApproval(){ return [...DB.formulaControl, ...DB.labelChecklist].filter(canApprove); }\nfunction checkProgress(lb){ const n = REF.labelCriteria.length; const done = REF.labelCriteria.filter(c => lb.checks && lb.checks[c.id] && lb.checks[c.id].result).length; const failed = REF.labelCriteria.filter(c => lb.checks && lb.checks[c.id] && lb.checks[c.id].result === 'FAIL').length; return { n, done, failed }; }\n\nfunction toast(msg, kind){\n  const box = document.getElementById('toastBox'); const d = document.createElement('div');\n  d.className = 'px-4 py-2 rounded-xl text-sm shadow-lg ' + (kind==='error' ? 'bg-red-600 text-white' : 'bg-slate-900 text-white');\n  d.textContent = msg; box.appendChild(d); setTimeout(() => d.remove(), kind==='error' ? 6000 : 3500);\n}\n\n/* -------------------------------------------------------------- navigation */\nconst PAGES = {\n  regDashboard:   { title:'ภาพรวม อย. ปุยแสบปาก', subtitle:'สถานะการขึ้นทะเบียนและงานที่รอดำเนินการ', render:renderDashboard },\n  kpi:            { title:'KPI แผนก RA', subtitle:'ตัวชี้วัด 14 ตัว ตามหน้าที่ความรับผิดชอบ 7 ข้อ · ค่าจริงจาก Log/เอกสารต้นทางเท่านั้น', render:renderKpi },\n  regProducts:    { title:'ทะเบียนผลิตภัณฑ์', subtitle:'Product Regulatory Master', render:() => renderList('regProducts') },\n  formulaControl: { title:'ควบคุมสูตรผลิตภัณฑ์', subtitle:'Master Formula Control · ต้องรวม 100% · อนุมัติแล้วแก้ไม่ได้ ต้องสร้าง Revision ใหม่', render:() => renderList('formulaControl') },\n  labelChecklist: { title:'ตรวจฉลากก่อนใช้งาน', subtitle:'Label Release Checklist · ต้องผ่านครบทุกข้อและอ้างอิงสูตรฉบับอนุมัติปัจจุบัน', render:() => renderList('labelChecklist') },\n  rawMaterials:   { title:'ทะเบียนวัตถุดิบ', subtitle:'Raw Material Master · ใช้ข้อมูลชุดเดียวกับระบบ QA · ทุกการแก้ไขถูกบันทึกในประวัติ', render:renderMaterials },\n  auditLog:       { title:'ประวัติการแก้ไข', subtitle:'Audit Trail · ลบหรือแก้ไขไม่ได้', render:renderAudit, show:() => ME.canApprove },\n  users:          { title:'ผู้ใช้งาน', subtitle:'เพิ่มผู้ใช้และตั้งรหัสผ่าน', render:renderUsers, show:() => ME.isAdmin },\n};\nconst NAV = [\n  ['regDashboard','📋','ภาพรวม อย.'],\n  ['kpi','🎯','KPI แผนก RA'],\n  ['regProducts','🧾','ทะเบียนผลิตภัณฑ์'],\n  ['formulaControl','⚗️','สูตร (Formula 100%)'],\n  ['labelChecklist','🏷️','ตรวจฉลาก'],\n  ['rawMaterials','🧂','วัตถุดิบ'],\n  ['auditLog','🕘','ประวัติการแก้ไข'],\n  ['users','👥','ผู้ใช้งาน'],\n];\nfunction buildNav(){\n  const waiting = ME ? waitingApproval().length : 0;\n  const html = NAV.filter(([k]) => !PAGES[k].show || PAGES[k].show()).map(([k,i,l]) =>\n    `<div class=\"nav-item${k===currentPage?' active':''}\" data-page=\"${k}\" onclick=\"navigateTo('${k}');toggleNav(false)\"><span class=\"text-lg\">${i}</span><span>${l}</span>${k==='regDashboard'&&waiting?`<span class=\"badge\">${waiting}</span>`:''}</div>`).join('')\n    + `<div class=\"nav-item mt-2 border-t pt-3 text-slate-500\" onclick=\"doLogout()\"><span class=\"text-lg\">🚪</span><span>ออกจากระบบ</span></div>`;\n  document.getElementById('navList').innerHTML = html;\n  document.getElementById('navListMobile').innerHTML = html;\n}\nfunction toggleNav(open){ document.getElementById('drawer').classList.toggle('hidden', !open); }\nfunction navigateTo(page){\n  const p = PAGES[page]; if (!p || (p.show && !p.show())) page = 'regDashboard';\n  currentPage = page; _search = '';\n  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === page));\n  document.getElementById('pageTitle').textContent = PAGES[page].title;\n  document.getElementById('pageSubtitle').textContent = PAGES[page].subtitle || '';\n  PAGES[page].render();\n  window.scrollTo(0,0);\n}\n\n/* -------------------------------------------------------------- dashboard */\nfunction renderDashboard(){\n  const P = DB.regProducts;\n  const approved = P.filter(p => p.status === 'APPROVED').length;\n  const inProgress = P.filter(p => !['APPROVED','REJECTED','CANCELLED'].includes(p.status)).length;\n  const queries = P.filter(p => ['AUTHORITY_QUERY','REVISION_REQUIRED'].includes(p.status)).length;\n  const waiting = waitingApproval();\n  const myDrafts = [...DB.formulaControl, ...DB.labelChecklist].filter(x => x.status === 'DRAFT' && (x.createdBy === ME.id || x.updatedBy === ME.id));\n  const tile = (n,l,c) => `<div class=\"card p-4 text-center border-t-4 ${c}\"><div class=\"text-3xl font-bold\">${n}</div><div class=\"text-xs text-ink-mute font-semibold mt-1\">${l}</div></div>`;\n  const row = (x) => {\n    const isF = x.formulaRevision !== undefined;\n    return `<div class=\"flex items-center gap-3 py-2 border-b border-slate-100 last:border-0\">\n      <div class=\"flex-1 min-w-0\"><div class=\"font-semibold text-sm truncate\">${isF?'สูตร':'ฉลาก'} ${esc(isF?x.formulaRevision:x.labelRevision)} · ${esc(productName(x.productId))}</div>\n      <div class=\"text-[11px] text-ink-mute\">${esc(x.id)} · แก้ไขล่าสุดโดย ${esc(x.updatedByName)} · ${fmtDate(x.updatedAt)}</div></div>\n      <button class=\"btn btn-ghost btn-sm\" onclick=\"openRecord('${isF?'formulaControl':'labelChecklist'}','${esc(x.id)}')\">เปิด</button></div>`;\n  };\n  document.getElementById('pageContent').innerHTML = `\n    <div class=\"grid grid-cols-2 md:grid-cols-4 gap-3 mb-5\">\n      ${tile(P.length,'ผลิตภัณฑ์ทั้งหมด','border-t-slate-400')}\n      ${tile(approved,'ได้ อย. แล้ว','border-t-green-500 text-green-700')}\n      ${tile(inProgress,'อยู่ระหว่างดำเนินการ','border-t-amber-500 text-amber-700')}\n      ${tile(queries,'อย. มีคำถาม / ต้องแก้','border-t-orange-500 text-orange-700')}\n    </div>\n    <div class=\"grid md:grid-cols-2 gap-4\">\n      <div class=\"card p-4\"><div class=\"font-bold mb-2\">รอฉันอนุมัติ <span class=\"text-ink-mute font-normal text-sm\">(${waiting.length})</span></div>\n        ${waiting.length ? waiting.map(row).join('') : `<div class=\"text-sm text-ink-mute py-4 text-center\">${ME.canApprove?'ไม่มีงานรออนุมัติ':'บัญชีนี้ไม่มีสิทธิ์อนุมัติ'}</div>`}</div>\n      <div class=\"card p-4\"><div class=\"font-bold mb-2\">ฉบับร่างของฉัน <span class=\"text-ink-mute font-normal text-sm\">(${myDrafts.length})</span></div>\n        ${myDrafts.length ? myDrafts.map(row).join('') : '<div class=\"text-sm text-ink-mute py-4 text-center\">ไม่มีฉบับร่าง</div>'}</div>\n    </div>\n    ${sb8Card(P)}\n    <div class=\"card p-4 mt-4\"><div class=\"font-bold mb-2\">สถานะการขึ้นทะเบียนรายผลิตภัณฑ์</div>\n      ${P.length ? `<div class=\"overflow-x-auto\"><table class=\"dt stack\"><thead><tr><th>ผลิตภัณฑ์</th><th>สถานะ</th><th>แก้ชื่อ สบ.8</th><th>สูตรปัจจุบัน</th><th>ฉลากปัจจุบัน</th></tr></thead><tbody>\n      ${P.map(p => { const f = current('formulaControl',p.id), l = current('labelChecklist',p.id);\n        return `<tr><td data-l=\"ผลิตภัณฑ์\">${esc(p.thaiProductName)}<div class=\"text-[11px] text-ink-mute\">${esc(p.thaiFdaNumber || p.productCode)}</div></td><td data-l=\"สถานะ\">${pill(p.status)}</td><td data-l=\"แก้ชื่อ สบ.8\">${sb8Pill(p)}</td>\n        <td data-l=\"สูตรปัจจุบัน\">${f?esc(f.formulaRevision):'<span class=\"text-red-600 text-xs\">ยังไม่มีสูตรอนุมัติ</span>'}</td>\n        <td data-l=\"ฉลากปัจจุบัน\">${l?esc(l.labelRevision):'<span class=\"text-red-600 text-xs\">ยังไม่มีฉลากอนุมัติ</span>'}</td></tr>`; }).join('')}\n      </tbody></table></div>` : '<div class=\"text-sm text-ink-mute py-4 text-center\">ยังไม่มีผลิตภัณฑ์ เริ่มที่เมนู \"ทะเบียนผลิตภัณฑ์\"</div>'}\n    </div>`;\n}\n\nfunction sb8Card(P){\n  const T = P.filter(p => p.sb8Status); if (!T.length) return '';\n  const n = k => T.filter(p => p.sb8Status === k).length;\n  const done = n('APPROVED'), sub = n('SUBMITTED'), pend = n('PENDING');\n  const w = x => (x / T.length * 100).toFixed(1) + '%';\n  return `<div class=\"card p-4 mt-4\">\n    <div class=\"flex flex-wrap items-baseline justify-between gap-2 mb-2\"><div class=\"font-bold\">การแก้ไขชื่อผลิตภัณฑ์ในระบบ สบ.8</div><div class=\"text-sm text-ink-mute\">อนุมัติแล้ว <b class=\"text-green-700\">${done}</b> จาก ${T.length} รายการ</div></div>\n    <div class=\"flex h-3 rounded-full overflow-hidden bg-slate-100\" role=\"img\" aria-label=\"อนุมัติแล้ว ${done} ยื่นแล้ว ${sub} รอดำเนินการ ${pend}\">\n      <div style=\"width:${w(done)};background:#16a34a\"></div><div style=\"width:${w(sub)};background:#3b82f6\"></div><div style=\"width:${w(pend)};background:#f59e0b\"></div></div>\n    <div class=\"flex flex-wrap gap-x-5 gap-y-1 mt-2 text-[12.5px] text-slate-600\">\n      <span><i class=\"inline-block w-2.5 h-2.5 rounded-full mr-1\" style=\"background:#16a34a\"></i>อนุมัติแล้ว ${done}</span>\n      <span><i class=\"inline-block w-2.5 h-2.5 rounded-full mr-1\" style=\"background:#3b82f6\"></i>ยื่นแก้ไขแล้ว ${sub}</span>\n      <span><i class=\"inline-block w-2.5 h-2.5 rounded-full mr-1\" style=\"background:#f59e0b\"></i>รอดำเนินการ ${pend}</span>\n    </div></div>`;\n}\n\n/* -------------------------------------------------------------- lists */\nconst LIST = {\n  regProducts: {\n    cols: [['id','เลขที่'],['_name','ชื่อผลิตภัณฑ์'],['thaiFdaNumber','เลข อย.'],['status','สถานะ'],['_sb8','แก้ชื่อ สบ.8'],['_formula','สูตรปัจจุบัน']],\n    html: { _name:1, _sb8:1 },\n    cell: (k,x) => k==='_formula' ? (current('formulaControl',x.id)||{}).formulaRevision || '-'\n      : k==='_sb8' ? `<span>${sb8Pill(x)}</span>`\n      : k==='_name' ? `<div class=\"min-w-0\"><div class=\"font-semibold\">${esc(x.thaiProductName)}</div>${x.englishProductName?`<div class=\"text-[12px] text-ink-mute\">${esc(x.englishProductName)}</div>`:''}${x.sb8Status&&x.sb8Status!=='APPROVED'&&x.proposedNameTh?`<div class=\"text-[12px] text-amber-800 mt-0.5\">ชื่อใหม่ที่เสนอ: ${esc(x.proposedNameTh)}</div>`:''}</div>`\n      : undefined,\n    addLabel:'+ เพิ่มผลิตภัณฑ์',\n  },\n  formulaControl: {\n    cols: [['id','เลขที่'],['_product','ผลิตภัณฑ์'],['formulaRevision','Revision'],['status','สถานะ'],['_items','ส่วนประกอบ'],['approvedByName','ผู้อนุมัติ']],\n    cell: (k,x) => k==='_product' ? productName(x.productId) : k==='_items' ? (x.ingredients||[]).length + ' รายการ · 100%' : undefined,\n    addLabel:'+ เพิ่มสูตรใหม่',\n  },\n  labelChecklist: {\n    cols: [['id','เลขที่'],['_product','ผลิตภัณฑ์'],['labelRevision','Revision'],['status','สถานะ'],['_formula','อ้างอิงสูตร'],['_progress','ผลตรวจ']],\n    cell: (k,x) => {\n      if (k==='_product') return productName(x.productId);\n      if (k==='_formula') { const f = DB.formulaControl.find(f => f.id === x.formulaId); return f ? f.formulaRevision + (f.status==='APPROVED'?'':' ('+(STATUS[f.status]||[f.status])[0]+')') : '-'; }\n      if (k==='_progress') { const p = checkProgress(x); return `${p.done}/${p.n}` + (p.failed?` · ไม่ผ่าน ${p.failed}`:''); }\n    },\n    addLabel:'+ ตรวจฉลากใหม่',\n  },\n};\n\nfunction renderList(key){\n  const cfg = LIST[key];\n  const q = _search.trim().toLowerCase();\n  const all = DB[key].slice().sort((a,b) => String(b.id).localeCompare(String(a.id)));\n  const items = q ? all.filter(it => (JSON.stringify(it) + productName(it.productId)).toLowerCase().includes(q)) : all;\n  const cellHtml = (k,x) => {\n    if (k === 'status') return pill(x.status);\n    const custom = cfg.cell(k,x);\n    if (custom !== undefined && cfg.html && cfg.html[k]) return custom;\n    const v = custom !== undefined ? custom : x[k];\n    return v == null || v === '' ? '<span class=\"text-slate-300\">-</span>' : esc(v);\n  };\n  const noProducts = key !== 'regProducts' && !DB.regProducts.length;\n  document.getElementById('pageContent').innerHTML = `\n    <div class=\"flex flex-wrap gap-2 items-center justify-between mb-4 noprint\">\n      <div class=\"flex gap-3 items-center flex-1 min-w-[220px]\">\n        <input id=\"searchBox\" class=\"input max-w-xs\" placeholder=\"ค้นหา...\" value=\"${esc(_search)}\" oninput=\"_search=this.value; renderList('${key}'); document.getElementById('searchBox').focus()\">\n        <span class=\"text-sm text-ink-mute font-medium whitespace-nowrap\">${items.length} รายการ</span>\n      </div>\n      <button class=\"btn btn-primary shadow-sm\" ${noProducts?'disabled title=\"ต้องมีผลิตภัณฑ์ก่อน\"':''} onclick=\"openRecord('${key}')\">${cfg.addLabel}</button>\n    </div>\n    <div class=\"card overflow-hidden\"><div class=\"overflow-x-auto\">\n      <table class=\"dt stack\"><thead><tr>${cfg.cols.map(([,l]) => `<th>${esc(l)}</th>`).join('')}<th></th></tr></thead>\n      <tbody>${items.length ? items.map(x => `<tr class=\"hover:bg-slate-50\">\n        ${cfg.cols.map(([k,l]) => `<td data-l=\"${esc(l)}\">${cellHtml(k,x)}</td>`).join('')}\n        <td class=\"act text-right whitespace-nowrap\">${rowActions(key,x)}</td></tr>`).join('')\n      : `<tr><td colspan=\"${cfg.cols.length+1}\" class=\"text-center text-ink-mute py-8\">${noProducts?'เพิ่มผลิตภัณฑ์ก่อน แล้วจึงเพิ่มสูตรหรือฉลาก':'ยังไม่มีข้อมูล'}</td></tr>`}\n      </tbody></table></div></div>`;\n}\n\nfunction rowActions(key, x){\n  const id = esc(x.id);\n  const locked = key !== 'regProducts' && x.status !== 'DRAFT';\n  let h = `<button class=\"text-brand text-xs font-semibold px-1\" onclick=\"openRecord('${key}','${id}')\">${locked?'ดู':'แก้ไข'}</button>`;\n  if (key !== 'regProducts' && canApprove(x)) h += `<button class=\"text-green-700 text-xs font-semibold px-1 ml-1\" onclick=\"approveRecord('${key}','${id}')\">อนุมัติ</button>`;\n  if (locked) h += `<button class=\"text-blue-700 text-xs font-semibold px-1 ml-1\" onclick=\"reviseRecord('${key}','${id}')\">Revision ใหม่</button>`;\n  if (['DRAFT','CONCEPT'].includes(x.status)) h += `<button class=\"text-red-500 text-xs font-semibold px-1 ml-1\" onclick=\"deleteRecord('${key}','${id}')\">ลบ</button>`;\n  h += attBtn(key, x.id, 'text-slate-500 text-xs font-semibold px-1 ml-1');\n  h += `<button class=\"text-slate-500 text-xs font-semibold px-1 ml-1\" onclick=\"openHistory('${key}','${id}')\">ประวัติ</button>`;\n  return h;\n}\n\n/* -------------------------------------------------------------- forms */\nlet _draft = null, _draftKey = null, _readOnly = false;\n\nfunction openRecord(key, id){\n  const existing = id ? DB[key].find(x => x.id === id) : null;\n  if (id && !existing) return toast('ไม่พบรายการ กรุณาดึงข้อมูลใหม่','error');\n  _draftKey = key;\n  _draft = existing ? JSON.parse(JSON.stringify(existing)) : newDraft(key);\n  _readOnly = key !== 'regProducts' && existing && existing.status !== 'DRAFT';\n  renderForm();\n}\n\nfunction newDraft(key){\n  if (key === 'regProducts') return { brand:'ตรา ปุยแสบปาก', registrationStatus:'CONCEPT' };\n  const pid = DB.regProducts[0] && DB.regProducts[0].id;\n  if (key === 'formulaControl') return { productId:pid, formulaRevision:'Rev.01', ingredients:[{},{}] };\n  const f = pid && current('formulaControl',pid);\n  return { productId:pid, labelRevision:'Rev.01', formulaId: f ? f.id : '', checks:{} };\n}\n\nfunction field(label, inner, hint, full){\n  return `<div class=\"${full?'col-span-full':''}\"><label class=\"label\">${label}</label>${inner}${hint?`<div class=\"text-[11px] text-ink-mute mt-1\">${hint}</div>`:''}</div>`;\n}\nfunction inp(k, opts){\n  opts = opts || {};\n  const v = _draft[k] == null ? '' : _draft[k];\n  const ro = _readOnly ? 'readonly' : '';\n  const type = opts.type || 'text';\n  return `<input class=\"input\" type=\"${type}\" value=\"${esc(v)}\" ${ro} oninput=\"_draft['${k}']=this.value\" placeholder=\"${esc(opts.ph||'')}\">`;\n}\nfunction sel(k, options, onchange){\n  const v = _draft[k] == null ? '' : _draft[k];\n  return `<select class=\"select\" ${_readOnly?'disabled':''} onchange=\"_draft['${k}']=this.value;${onchange||''}\">${options.map(([val,lbl]) => `<option value=\"${esc(val)}\"${String(v)===String(val)?' selected':''}>${esc(lbl)}</option>`).join('')}</select>`;\n}\nconst sec = t => `<div class=\"col-span-full font-bold text-brand text-sm mt-3 mb-1 border-b border-slate-200 pb-1\">${esc(t)}</div>`;\n\nfunction renderForm(){\n  const key = _draftKey, d = _draft, isNew = !d.id;\n  const titles = { regProducts:'ผลิตภัณฑ์', formulaControl:'สูตรผลิตภัณฑ์', labelChecklist:'ตรวจฉลาก' };\n  let body = '';\n  if (key === 'regProducts') {\n    body = sec('ข้อมูลทั่วไปของผลิตภัณฑ์')\n      + field('Product Code <span class=\"text-red-500\">*</span>', inp('productCode',{ph:'เช่น NP-0005'}))\n      + field('แบรนด์ <span class=\"text-red-500\">*</span>', inp('brand'))\n      + field('ชื่อผลิตภัณฑ์ (ภาษาไทย) <span class=\"text-red-500\">*</span>', inp('thaiProductName'))\n      + field('ชื่อผลิตภัณฑ์ (English)', inp('englishProductName'))\n      + sec('การจัดหมวดหมู่ทางกฎหมาย')\n      + field('หมวดหมู่อาหาร (อย.)', inp('regulatoryClassification'), 'ต้องพิจารณาจากสูตร กระบวนการ และวิธีบริโภค ไม่ใช่จากชื่อสินค้าอย่างเดียว', true)\n      + field('สถานะการบริโภค', sel('rawRtcParcookedRteStatus',[['','-- เลือก --'],['RAW','ดิบ (RAW)'],['RTC','พร้อมปรุง (RTC)'],['PAR_COOKED','กึ่งสุก (Par-cooked)'],['RTE','พร้อมบริโภค (RTE)']]))\n      + field('การเก็บรักษา', sel('chilledFrozenStatus',[['','-- เลือก --'],['AMBIENT','อุณหภูมิห้อง (Ambient)'],['CHILLED','แช่เย็น (Chilled)'],['FROZEN','แช่เยือกแข็ง (Frozen)']]))\n      + sec('สถานะการขึ้นทะเบียน อย.')\n      + field('สถานะปัจจุบัน', sel('registrationStatus', PRODUCT_STATUS_ORDER.map(s => [s, STATUS[s][0]]), 'renderForm()'))\n      + field('เลขสารบบอาหาร (อย.)' + (d.registrationStatus==='APPROVED'?' <span class=\"text-red-500\">*</span>':''), inp('thaiFdaNumber',{ph:'เช่น 10-1-12345-5-0001'}))\n      + field('วันที่ได้รับอนุมัติ', inp('approvalDate',{type:'date'}))\n      + sec('การแก้ไขชื่อผลิตภัณฑ์ในระบบ สบ.8')\n      + field('สถานะการแก้ไขชื่อ', sel('sb8Status',[['','ไม่มีการแก้ไขชื่อ'],['PENDING','รอดำเนินการ'],['SUBMITTED','ยื่นแก้ไขแล้ว'],['APPROVED','อนุมัติแล้ว']], 'renderForm()'), 'เมื่ออนุมัติแล้ว ให้เปลี่ยน \"ชื่อผลิตภัณฑ์\" ด้านบนเป็นชื่อใหม่ด้วย')\n      + field('วันที่ สบ.8 อนุมัติ' + (d.sb8Status==='APPROVED'?' <span class=\"text-red-500\">*</span>':''), inp('sb8Date',{type:'date'}))\n      + field('ชื่อจดทะเบียนเดิม (ไทย)', inp('registeredNameTh'))\n      + field('ชื่อจดทะเบียนเดิม (English)', inp('registeredNameEn'))\n      + field('ชื่อที่เสนอใหม่ (ไทย)' + (d.sb8Status?' <span class=\"text-red-500\">*</span>':''), inp('proposedNameTh'))\n      + field('ชื่อที่เสนอใหม่ (English)', inp('proposedNameEn'))\n      + field('เอกสารอ้างอิง', inp('sb8Ref',{ph:'เช่น เลขรับคำขอแก้ไข หรือชื่อเอกสาร'}), '', true)\n      + field('หมายเหตุ', `<textarea class=\"textarea\" rows=\"2\" oninput=\"_draft.note=this.value\">${esc(d.note||'')}</textarea>`, '', true);\n    if (d.id) {\n      const f = current('formulaControl',d.id), l = current('labelChecklist',d.id);\n      body += sec('เอกสารปัจจุบันที่ผูกกับผลิตภัณฑ์')\n        + `<div class=\"col-span-full text-sm\">สูตร: <b>${f?esc(f.formulaRevision)+' ('+esc(f.id)+')':'ยังไม่มีสูตรอนุมัติ'}</b> · ฉลาก: <b>${l?esc(l.labelRevision)+' ('+esc(l.id)+')':'ยังไม่มีฉลากอนุมัติ'}</b></div>`;\n    }\n  } else {\n    const productOpts = DB.regProducts.map(p => [p.id, `${p.thaiProductName} (${p.productCode})`]);\n    if (key === 'formulaControl') {\n      body = field('ผลิตภัณฑ์ <span class=\"text-red-500\">*</span>', sel('productId', productOpts))\n        + field('Revision <span class=\"text-red-500\">*</span>', inp('formulaRevision',{ph:'เช่น Rev.01'}))\n        + sec('ส่วนประกอบ (ต้องรวมกันได้ 100%)') + `<div class=\"col-span-full\">${ingredientTable()}</div>`\n        + field('หมายเหตุ', `<textarea class=\"textarea\" rows=\"2\" ${_readOnly?'readonly':''} oninput=\"_draft.note=this.value\">${esc(d.note||'')}</textarea>`, '', true);\n    } else {\n      const formulas = DB.formulaControl.filter(f => f.productId === d.productId && f.status !== 'OBSOLETE');\n      body = field('ผลิตภัณฑ์ <span class=\"text-red-500\">*</span>', sel('productId', productOpts, \"var f=current('formulaControl',this.value);_draft.formulaId=f?f.id:'';renderForm()\"))\n        + field('Revision ฉลาก <span class=\"text-red-500\">*</span>', inp('labelRevision',{ph:'เช่น Rev.01'}))\n        + field('อ้างอิงสูตร', sel('formulaId', [['','-- เลือกสูตร --'], ...formulas.map(f => [f.id, `${f.formulaRevision} · ${(STATUS[f.status]||[f.status])[0]}`])]), 'อนุมัติฉลากได้เมื่อสูตรที่อ้างอิงเป็นฉบับอนุมัติปัจจุบันเท่านั้น')\n        + field('ลิงก์ไฟล์ Artwork', inp('artworkRef',{ph:'เช่น ลิงก์ Google Drive ของ Artwork ฉบับนี้'}))\n        + sec('รายการตรวจ (' + checkProgress(d).done + '/' + REF.labelCriteria.length + ')') + `<div class=\"col-span-full\">${checklistTable()}</div>`\n        + field('หมายเหตุ', `<textarea class=\"textarea\" rows=\"2\" ${_readOnly?'readonly':''} oninput=\"_draft.note=this.value\">${esc(d.note||'')}</textarea>`, '', true);\n    }\n  }\n\n  const meta = d.id ? `<div class=\"text-[11px] text-ink-mute px-6 pt-3\">สร้างโดย ${esc(d.createdByName)} ${fmtDate(d.createdAt)} · แก้ไขล่าสุด ${esc(d.updatedByName)} ${fmtDate(d.updatedAt)}${d.approvedByName?' · <b class=\"text-green-700\">อนุมัติโดย '+esc(d.approvedByName)+' '+fmtDate(d.approvedAt)+'</b>':''}${d.revisedFrom?' · สร้างจาก '+esc(d.revisedFrom):''}</div>` : '';\n  const lockNote = _readOnly ? `<div class=\"mx-6 mt-3 text-sm bg-slate-100 border border-slate-200 rounded-lg p-3\">🔒 รายการนี้${d.status==='APPROVED'?'อนุมัติแล้ว':'ถูกยกเลิกใช้แล้ว'} แก้ไขไม่ได้ หากต้องการเปลี่ยน ให้กด \"สร้าง Revision ใหม่\"</div>` : '';\n  let buttons = `<button class=\"btn btn-ghost\" onclick=\"closeModal()\">${_readOnly?'ปิด':'ยกเลิก'}</button>`;\n  if (!_readOnly) buttons += `<button class=\"btn btn-primary px-6\" id=\"saveBtn\" onclick=\"saveForm()\">บันทึก</button>`;\n  if (d.id && key !== 'regProducts' && canApprove(d)) buttons += `<button class=\"btn btn-ok\" onclick=\"approveRecord('${key}','${esc(d.id)}')\">อนุมัติ</button>`;\n  if (_readOnly) buttons += `<button class=\"btn btn-primary\" onclick=\"reviseRecord('${key}','${esc(d.id)}')\">สร้าง Revision ใหม่</button>`;\n\n  document.getElementById('modalRoot').innerHTML = `\n    <div class=\"fixed inset-0 bg-slate-900/50 z-40 flex items-start justify-center overflow-y-auto p-2 sm:p-4\" onclick=\"if(event.target===this)closeModal()\">\n      <div class=\"card w-full max-w-4xl my-2 sm:my-4 shadow-2xl border-0\">\n        <div class=\"px-5 sm:px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-3 sticky top-0 bg-white rounded-t-xl z-10\">\n          <div class=\"font-bold text-[15px] min-w-0\">${isNew?'เพิ่ม':''}${titles[key]} ${d.id?'· <span class=\"font-mono text-brand\">'+esc(d.id)+'</span>':''} ${d.status?pill(d.status):''}</div>\n          <button class=\"text-slate-400 hover:text-slate-600 text-2xl leading-none\" onclick=\"closeModal()\" aria-label=\"ปิด\">&times;</button>\n        </div>\n        ${meta}${lockNote}\n        <div class=\"p-5 sm:p-6 grid grid-cols-1 md:grid-cols-2 gap-4\">${body}</div>\n        <div class=\"px-5 sm:px-6 py-4 border-t border-slate-200 flex flex-wrap justify-end gap-2 bg-white rounded-b-xl sticky bottom-0\">${buttons}</div>\n      </div>\n    </div>`;\n}\n\nfunction ingredientTable(){\n  const rows = Array.isArray(_draft.ingredients) ? _draft.ingredients : (_draft.ingredients = []);\n  const total = rows.reduce((s,r) => s + Math.round((parseFloat(r.percentage)||0) * 10000), 0) / 10000;\n  const ok = total === 100;\n  const ro = _readOnly ? 'readonly' : '';\n  return `<div class=\"border border-slate-200 rounded-lg bg-white overflow-hidden\">\n    <div class=\"overflow-x-auto\"><table class=\"dt\"><thead><tr><th style=\"width:45%\">ชื่อส่วนประกอบ</th><th style=\"width:18%\">ร้อยละ (%)</th><th>ที่มา / เลข อย. วัตถุดิบ</th>${_readOnly?'':'<th class=\"w-10\"></th>'}</tr></thead><tbody>\n    ${rows.map((r,i) => `<tr>\n      <td><input class=\"input\" list=\"rmList\" value=\"${esc(r.ingredient||'')}\" ${ro} oninput=\"_draft.ingredients[${i}].ingredient=this.value\"></td>\n      <td><input class=\"input text-right\" type=\"number\" step=\"any\" inputmode=\"decimal\" value=\"${esc(r.percentage==null?'':r.percentage)}\" ${ro} oninput=\"_draft.ingredients[${i}].percentage=this.value;updateTotal()\"></td>\n      <td><input class=\"input\" value=\"${esc(r.note||'')}\" ${ro} oninput=\"_draft.ingredients[${i}].note=this.value\"></td>\n      ${_readOnly?'':`<td class=\"align-middle\"><button class=\"text-red-500 text-xs font-bold\" onclick=\"_draft.ingredients.splice(${i},1);renderForm()\">ลบ</button></td>`}</tr>`).join('')}\n    </tbody></table></div>\n    <datalist id=\"rmList\">${REF.rawMaterials.map(m => `<option value=\"${esc(m.material_name_th)}\">`).join('')}</datalist>\n    <div class=\"flex items-center justify-between px-3 py-2 border-t border-slate-200 bg-slate-50\">\n      ${_readOnly?'<span></span>':`<button class=\"text-brand text-xs font-semibold\" onclick=\"_draft.ingredients.push({});renderForm()\">+ เพิ่มส่วนประกอบ</button>`}\n      <span id=\"totalBox\" class=\"text-sm font-bold ${ok?'text-green-700':'text-red-600'}\">รวม ${total}% ${ok?'✓':'(ต้องเท่ากับ 100%)'}</span>\n    </div></div>`;\n}\nfunction updateTotal(){\n  const total = (_draft.ingredients||[]).reduce((s,r) => s + Math.round((parseFloat(r.percentage)||0) * 10000), 0) / 10000;\n  const box = document.getElementById('totalBox'); if (!box) return;\n  box.className = 'text-sm font-bold ' + (total === 100 ? 'text-green-700' : 'text-red-600');\n  box.textContent = 'รวม ' + total + '% ' + (total === 100 ? '✓' : '(ต้องเท่ากับ 100%)');\n}\n\nfunction checklistTable(){\n  const checks = _draft.checks || (_draft.checks = {});\n  return `<div class=\"border border-slate-200 rounded-lg bg-white divide-y divide-slate-100\">\n    ${REF.labelCriteria.map(c => { const cur = checks[c.id] || {};\n      return `<div class=\"p-3 flex flex-col sm:flex-row sm:items-center gap-2\">\n        <div class=\"flex-1 min-w-0\"><div class=\"font-semibold text-sm\">${c.id}. ${esc(c.item)}</div><div class=\"text-[12px] text-ink-mute\">${esc(c.criterion)}</div>\n          ${cur.result==='FAIL'||cur.note?`<input class=\"input mt-1 text-sm\" placeholder=\"บันทึกสิ่งที่พบ\" value=\"${esc(cur.note||'')}\" ${_readOnly?'readonly':''} oninput=\"setCheckNote(${c.id},this.value)\">`:''}</div>\n        <div class=\"seg shrink-0\">${['PASS','FAIL','NA'].map(v => `<button class=\"${cur.result===v?'on-'+v:''}\" ${_readOnly?'disabled':''} onclick=\"setCheck(${c.id},'${v}')\">${v==='PASS'?'ผ่าน':v==='FAIL'?'ไม่ผ่าน':'N/A'}</button>`).join('')}</div>\n      </div>`; }).join('')}\n  </div>`;\n}\nfunction setCheck(id, v){ const c = _draft.checks[id] || {}; c.result = c.result === v ? '' : v; _draft.checks[id] = c; renderForm(); }\nfunction setCheckNote(id, note){ const c = _draft.checks[id] || {}; c.note = note; _draft.checks[id] = c; }\n\nasync function saveForm(){\n  const key = _draftKey, d = _draft;\n  let reason;\n  if (key === 'regProducts' && d.id && d.status === 'APPROVED') {\n    reason = prompt('ผลิตภัณฑ์นี้ได้ อย. แล้ว กรุณาระบุเหตุผลการแก้ไข (จะถูกบันทึกในประวัติ)');\n    if (!reason) return;\n  }\n  if (key === 'formulaControl') {\n    d.ingredients = (d.ingredients||[]).filter(r => (r.ingredient||'').trim() || r.percentage !== undefined && r.percentage !== '')\n      .map(r => ({ ...r, percentage: r.percentage === '' || r.percentage == null ? NaN : Number(r.percentage) }));\n  }\n  const btn = document.getElementById('saveBtn'); if (btn) { btn.disabled = true; btn.textContent = 'กำลังบันทึก...'; }\n  try {\n    const r = d.id\n      ? await api('PUT', `/api/records/${key}/${encodeURIComponent(d.id)}`, { ...d, reason })\n      : await api('POST', `/api/records/${key}`, d);\n    upsert(key, r.record);\n    toast('บันทึกแล้ว ' + r.record.id + ' ✓');\n    closeModal(); navigateTo(currentPage);\n  } catch (e) {\n    toast(e.message,'error');\n    if (key === 'formulaControl') d.ingredients = d.ingredients.map(r => ({ ...r, percentage: isNaN(r.percentage) ? '' : r.percentage }));\n    if (btn) { btn.disabled = false; btn.textContent = 'บันทึก'; }\n  }\n}\n\nfunction upsert(key, rec){ const list = DB[key]; const i = list.findIndex(x => x.id === rec.id); if (i >= 0) list[i] = rec; else list.push(rec); buildNav(); }\n\nasync function approveRecord(key, id){\n  const rec = DB[key].find(x => x.id === id); if (!rec) return;\n  const what = key === 'formulaControl' ? 'สูตร ' + rec.formulaRevision : 'ฉลาก ' + rec.labelRevision;\n  const reason = prompt(`อนุมัติ${what} ของ ${productName(rec.productId)}\\nฉบับอนุมัติก่อนหน้าจะถูกยกเลิกใช้อัตโนมัติ\\n\\nหมายเหตุการอนุมัติ (ถ้ามี):`, '');\n  if (reason === null) return;\n  try {\n    const r = await api('POST', `/api/records/${key}/${encodeURIComponent(id)}/approve`, { version: rec.version, reason });\n    toast('อนุมัติแล้ว ✓'); closeModal(); await pullAll(); navigateTo(currentPage);\n  } catch (e) { toast(e.message,'error'); }\n}\n\nasync function reviseRecord(key, id){\n  if (!confirm('สร้าง Revision ใหม่เป็นฉบับร่างจากรายการ ' + id + ' ใช่หรือไม่?')) return;\n  try {\n    const r = await api('POST', `/api/records/${key}/${encodeURIComponent(id)}/revise`, {});\n    upsert(key, r.record); closeModal(); navigateTo(currentPage);\n    toast('สร้าง ' + r.record.id + ' แล้ว ✓'); openRecord(key, r.record.id);\n  } catch (e) { toast(e.message,'error'); }\n}\n\nasync function deleteRecord(key, id){\n  if (!confirm('ยืนยันการลบ ' + id + ' ใช่หรือไม่? (ลบได้เฉพาะฉบับร่าง)')) return;\n  try {\n    await api('DELETE', `/api/records/${key}/${encodeURIComponent(id)}`);\n    DB[key] = DB[key].filter(x => x.id !== id); buildNav(); navigateTo(currentPage); toast('ลบแล้ว');\n  } catch (e) { toast(e.message,'error'); }\n}\n\nfunction closeModal(){ document.getElementById('modalRoot').innerHTML = ''; _draft = null; }\n\n/* -------------------------------------------------------------- history / audit */\nconst FIELD_TH = { target:'เป้าหมาย', attachment:'รูปแนบ', material_name_th:'ชื่อไทย', material_name_en:'ชื่ออังกฤษ', category:'หมวด', used_in_sku:'ใช้ใน SKU', allergen_group:'สารก่อภูมิแพ้', fda_or_source:'เลข อย./ที่มา', storage_condition:'การเก็บรักษา', unit:'หน่วย', status_note:'หมายเหตุ', source_revision:'ที่มาข้อมูล', sb8Status:'สถานะ สบ.8', sb8Date:'วันที่ สบ.8 อนุมัติ', sb8Ref:'เอกสารอ้างอิง สบ.8', registeredNameTh:'ชื่อเดิม (ไทย)', registeredNameEn:'ชื่อเดิม (EN)', proposedNameTh:'ชื่อใหม่ (ไทย)', proposedNameEn:'ชื่อใหม่ (EN)', thaiProductName:'ชื่อผลิตภัณฑ์', englishProductName:'ชื่ออังกฤษ', thaiFdaNumber:'เลข อย.', registrationStatus:'สถานะ', status:'สถานะ', productCode:'Product Code' };\nconst ACTION_TH = { ATTACH:'แนบรูป', VOID_ATTACH:'ยกเลิกรูปแนบ', VOID:'ยกเลิกผล KPI', SET_TARGET:'ตั้งเป้าหมาย KPI', IMPORT:'นำเข้าจากเอกสาร', CREATE:'สร้าง', UPDATE:'แก้ไข', DELETE:'ลบ', APPROVE:'อนุมัติ', OBSOLETE:'ยกเลิกใช้', REVISE:'สร้าง Revision', LOGIN:'เข้าสู่ระบบ', SETUP_ADMIN:'ตั้งค่าผู้ดูแล', CREATE_USER:'เพิ่มผู้ใช้', RESET_PASSWORD:'ตั้งรหัสผ่าน', CHANGE_PASSWORD:'เปลี่ยนรหัสผ่าน' };\nfunction auditTable(rows, showRecord){\n  if (!rows.length) return '<div class=\"text-sm text-ink-mute p-6 text-center\">ยังไม่มีประวัติ</div>';\n  return `<div class=\"overflow-x-auto\"><table class=\"dt stack\"><thead><tr><th>เวลา</th><th>ผู้ทำ</th><th>การกระทำ</th>${showRecord?'<th>รายการ</th>':''}<th>รายละเอียด</th></tr></thead><tbody>\n    ${rows.map(a => { const after = a.after_json ? JSON.parse(a.after_json) : null; const before = a.before_json ? JSON.parse(a.before_json) : null;\n      const changed = before && after ? Object.keys(after).filter(k => JSON.stringify(after[k]) !== JSON.stringify(before[k])).map(k => FIELD_TH[k] || k) : [];\n      return `<tr><td data-l=\"เวลา\" class=\"whitespace-nowrap\">${esc(new Date(a.at.replace(' ','T')+'Z').toLocaleString('th-TH',{dateStyle:'short',timeStyle:'short'}))}</td>\n      <td data-l=\"ผู้ทำ\">${esc(a.user_email)}</td><td data-l=\"การกระทำ\">${esc(ACTION_TH[a.action]||a.action)}</td>\n      ${showRecord?`<td data-l=\"รายการ\">${esc(a.record_id||'-')}</td>`:''}\n      <td data-l=\"รายละเอียด\" class=\"text-[12px]\">${changed.length?'เปลี่ยน: '+esc(changed.join(', ')):''}${a.reason?`<div>เหตุผล: ${esc(a.reason)}</div>`:''}</td></tr>`; }).join('')}\n  </tbody></table></div>`;\n}\nasync function openHistory(key, id){\n  try {\n    const r = await api('GET', `/api/audit?collection=${key}&id=${encodeURIComponent(id)}`);\n    document.getElementById('modalRoot').innerHTML = `\n      <div class=\"fixed inset-0 bg-slate-900/50 z-40 flex items-start justify-center overflow-y-auto p-2 sm:p-4\" onclick=\"if(event.target===this)closeModal()\">\n        <div class=\"card w-full max-w-3xl my-4 shadow-2xl border-0\">\n          <div class=\"px-6 py-4 border-b flex justify-between\"><div class=\"font-bold\">ประวัติ ${esc(id)}</div><button class=\"text-2xl text-slate-400\" onclick=\"closeModal()\">&times;</button></div>\n          ${auditTable(r.rows,false)}\n        </div></div>`;\n  } catch (e) { toast(e.message,'error'); }\n}\nasync function renderAudit(){\n  document.getElementById('pageContent').innerHTML = '<div class=\"text-sm text-ink-mute\">กำลังโหลด…</div>';\n  try { const r = await api('GET','/api/audit'); document.getElementById('pageContent').innerHTML = `<div class=\"card overflow-hidden\">${auditTable(r.rows,true)}</div><p class=\"text-[11px] text-ink-mute mt-2\">แสดง 300 รายการล่าสุด</p>`; }\n  catch (e) { document.getElementById('pageContent').innerHTML = `<div class=\"text-red-600 text-sm\">${esc(e.message)}</div>`; }\n}\n\n/* -------------------------------------------------------------- raw materials */\nlet _matFilter = 'all', _matCat = '';\nconst matHasAllergen = m => { const a = (m.allergen_group||'').trim(); return !!a && !/^(ไม่มี|-|none)/i.test(a); };\nconst matNoFda = m => /ยังไม่มี/.test(m.fda_or_source||'');\nconst matFollowUp = m => /⚠|🚩|ต้อง/.test(m.status_note||'');\nconst MAT_FILTERS = [\n  ['all','ทั้งหมด', () => true],\n  ['allergen','มีสารก่อภูมิแพ้', matHasAllergen],\n  ['nofda','ยังไม่มีเลข อย.', matNoFda],\n  ['follow','ต้องติดตาม', matFollowUp],\n];\nfunction matValues(key){ return [...new Set(REF.rawMaterials.map(m => (m[key]||'').trim()).filter(Boolean))].sort((a,b) => a.localeCompare(b,'th')); }\n\nfunction renderMaterials(){\n  _matFilter = 'all'; _matCat = '';\n  document.getElementById('pageContent').innerHTML = `\n    <div class=\"flex flex-wrap gap-2 items-center justify-between mb-3\">\n      <div id=\"matChips\" class=\"flex flex-wrap gap-2\"></div>\n      <button class=\"btn btn-primary shadow-sm\" onclick=\"openMaterial()\">+ เพิ่มวัตถุดิบ</button>\n    </div>\n    <div class=\"flex flex-wrap gap-2 items-center mb-4\">\n      <input id=\"matSearch\" class=\"input flex-1 min-w-[200px] max-w-md\" type=\"search\" placeholder=\"ค้นหาชื่อ รหัส เลข อย. หรือ SKU\" oninput=\"_search=this.value;renderMatGrid()\">\n      <select id=\"matCat\" class=\"select w-auto max-w-[220px]\" onchange=\"_matCat=this.value;renderMatGrid()\"></select>\n      <span id=\"matCount\" class=\"text-sm text-ink-mute font-medium whitespace-nowrap\"></span>\n    </div>\n    <div id=\"matGrid\" class=\"mat-grid\"></div>`;\n  renderMatGrid();\n}\n\nfunction renderMatGrid(){\n  const all = REF.rawMaterials;\n  const q = _search.trim().toLowerCase();\n  const pass = (MAT_FILTERS.find(f => f[0] === _matFilter) || MAT_FILTERS[0])[2];\n  const rows = all.filter(m => pass(m) && (!_matCat || (m.category||'') === _matCat) && (!q || Object.values(m).join(' ').toLowerCase().includes(q)));\n\n  document.getElementById('matChips').innerHTML = MAT_FILTERS.map(([k,l,fn]) =>\n    `<button class=\"fchip${_matFilter===k?' on':''}${k!=='all'&&k!=='allergen'?' warn':''}${k==='allergen'?' alg':''}\" onclick=\"_matFilter='${k}';renderMatGrid()\">${l}<b>${all.filter(fn).length}</b></button>`).join('');\n  const catSel = document.getElementById('matCat');\n  catSel.innerHTML = `<option value=\"\">ทุกหมวด</option>` + matValues('category').map(c => `<option value=\"${esc(c)}\"${c===_matCat?' selected':''}>${esc(c)}</option>`).join('');\n  document.getElementById('matCount').textContent = rows.length === all.length ? `${all.length} รายการ` : `${rows.length} จาก ${all.length} รายการ`;\n\n  document.getElementById('matGrid').innerHTML = rows.length ? rows.map(matCard).join('')\n    : `<div class=\"card p-8 text-center text-ink-mute text-sm\" style=\"grid-column:1/-1\">${all.length ? 'ไม่พบวัตถุดิบตามเงื่อนไขที่เลือก' : 'ยังไม่มีวัตถุดิบ กด \"+ เพิ่มวัตถุดิบ\" เพื่อเริ่ม'}</div>`;\n}\n\nfunction matCard(m){\n  const code = esc(m.material_code);\n  const allergen = matHasAllergen(m);\n  const note = (m.status_note||'').trim();\n  const urgent = /🚩/.test(note);\n  const skus = (m.used_in_sku||'').split(/,\\s*/).map(x => x.trim()).filter(Boolean);\n  const fda = (m.fda_or_source||'').trim();\n  const fdaHtml = !fda || fda === '-' ? '<span class=\"text-slate-400\">ไม่ต้องมี / ไม่ระบุ</span>'\n    : matNoFda(m) ? `<span class=\"text-orange-700 font-semibold\">${esc(fda)}</span>` : `<span class=\"font-mono text-[12.5px]\">${esc(fda)}</span>`;\n  return `<article class=\"card p-4 flex flex-col gap-3 min-w-0\">\n    <div class=\"flex items-start justify-between gap-2\">\n      <div class=\"flex flex-wrap items-center gap-2 min-w-0\">\n        <span class=\"font-mono text-[11px] text-ink-mute\">${code}</span>\n        ${m.category ? `<span class=\"pill bg-slate-100 text-slate-700 border border-slate-200\">${esc(m.category)}</span>` : ''}\n      </div>\n      ${allergen ? `<span class=\"alg-pill\" title=\"สารก่อภูมิแพ้\">${esc(m.allergen_group)}</span>`\n        : `<span class=\"text-[11px] text-slate-400 whitespace-nowrap pt-0.5\">${esc((m.allergen_group||'').trim() === 'ไม่มี*' ? 'ไม่มีสารก่อภูมิแพ้*' : 'ไม่มีสารก่อภูมิแพ้')}</span>`}\n    </div>\n    <div class=\"min-w-0\">\n      <h3 class=\"font-bold text-[16px] leading-snug text-slate-900\">${esc(m.material_name_th)}</h3>\n      ${m.material_name_en ? `<div class=\"text-[13px] text-ink-mute\">${esc(m.material_name_en)}</div>` : ''}\n    </div>\n    <dl class=\"mat-dl\">\n      <dt>เลข อย. / ที่มา</dt><dd>${fdaHtml}</dd>\n      <dt>หน่วย</dt><dd>${esc(m.unit || '-')}</dd>\n      <dt>การเก็บรักษา</dt><dd>${esc(m.storage_condition || '-')}</dd>\n      <dt>ใช้ใน SKU</dt><dd>${skus.length ? `<span class=\"flex flex-wrap gap-1\">${skus.map(x => `<span class=\"sku\">${esc(x)}</span>`).join('')}</span>` : '<span class=\"text-slate-400\">ยังไม่ระบุ</span>'}</dd>\n    </dl>\n    ${note ? `<div class=\"mat-note ${urgent ? 'urgent' : matFollowUp(m) ? 'warn' : ''}\">${esc(note)}</div>` : ''}\n    <div class=\"flex items-center justify-between gap-2 mt-auto pt-2 border-t border-slate-100\">\n      <span class=\"text-[11px] text-slate-400 truncate\">${esc(m.source_revision || '')}</span>\n      <span class=\"flex gap-1 shrink-0\">\n        ${attBtn('rawMaterials', m.material_code, 'btn btn-ghost btn-sm')}\n        <button class=\"btn btn-ghost btn-sm\" onclick=\"openHistory('rawMaterials','${code}')\">ประวัติ</button>\n        <button class=\"btn btn-primary btn-sm\" onclick=\"openMaterial('${code}')\">แก้ไข</button>\n      </span>\n    </div>\n  </article>`;\n}\n\nlet _matCode = null;\nfunction openMaterial(code){\n  const m = code ? REF.rawMaterials.find(x => x.material_code === code) : {};\n  if (!m) return toast('ไม่พบวัตถุดิบ กรุณาดึงข้อมูลใหม่','error');\n  _matCode = code || null;\n  const v = k => esc(m[k] == null ? '' : m[k]);\n  const dl = (id, key) => `<datalist id=\"${id}\">${matValues(key).map(x => `<option value=\"${esc(x)}\">`).join('')}</datalist>`;\n  const f = (label, inner, hint, full) => `<div class=\"${full?'col-span-full':''}\"><label class=\"label\">${label}</label>${inner}${hint?`<div class=\"text-[11px] text-ink-mute mt-1\">${hint}</div>`:''}</div>`;\n  document.getElementById('modalRoot').innerHTML = `\n    <div class=\"fixed inset-0 bg-slate-900/50 z-40 flex items-start justify-center overflow-y-auto p-2 sm:p-4\" onclick=\"if(event.target===this)closeModal()\">\n      <div class=\"card w-full max-w-2xl my-2 sm:my-4 shadow-2xl border-0\">\n        <div class=\"px-5 sm:px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-3 sticky top-0 bg-white rounded-t-xl z-10\">\n          <div class=\"font-bold text-[15px]\">${code ? 'แก้ไขวัตถุดิบ · <span class=\"font-mono text-brand\">'+esc(code)+'</span>' : 'เพิ่มวัตถุดิบ'}</div>\n          <button class=\"text-slate-400 hover:text-slate-600 text-2xl leading-none\" onclick=\"closeModal()\" aria-label=\"ปิด\">&times;</button>\n        </div>\n        <div class=\"p-5 sm:p-6 grid grid-cols-1 sm:grid-cols-2 gap-4\">\n          ${f('ชื่อวัตถุดิบ (ภาษาไทย) <span class=\"text-red-500\">*</span>', `<input id=\"mfTh\" class=\"input\" value=\"${v('material_name_th')}\">`)}\n          ${f('ชื่อวัตถุดิบ (English)', `<input id=\"mfEn\" class=\"input\" value=\"${v('material_name_en')}\">`)}\n          ${f('หมวด', `<input id=\"mfCat\" class=\"input\" list=\"mfCatList\" value=\"${v('category')}\" placeholder=\"เช่น เครื่องปรุงรส\">${dl('mfCatList','category')}`)}\n          ${f('สารก่อภูมิแพ้', `<input id=\"mfAlg\" class=\"input\" list=\"mfAlgList\" value=\"${v('allergen_group')}\" placeholder=\"เช่น ปลา (Fish)\">${dl('mfAlgList','allergen_group')}`, 'เว้นว่างไว้ ระบบจะบันทึกเป็น \"ไม่มี\"')}\n          ${f('เลข อย. / ที่มา', `<input id=\"mfFda\" class=\"input\" value=\"${v('fda_or_source')}\" placeholder=\"เช่น 10-1-12345-5-0001\">`, 'ถ้ายังไม่ได้เลข ให้พิมพ์ \"ยังไม่มีเลข อย.\" เพื่อให้ขึ้นในรายการติดตาม')}\n          ${f('การเก็บรักษา', `<input id=\"mfSto\" class=\"input\" list=\"mfStoList\" value=\"${v('storage_condition')}\" placeholder=\"เช่น อุณหภูมิห้อง แห้ง\">${dl('mfStoList','storage_condition')}`)}\n          ${f('หน่วย', `<input id=\"mfUnit\" class=\"input\" list=\"mfUnitList\" value=\"${v('unit')}\" placeholder=\"เช่น กิโลกรัม\">${dl('mfUnitList','unit')}`)}\n          ${f('ใช้ใน SKU', `<input id=\"mfSku\" class=\"input\" value=\"${v('used_in_sku')}\" placeholder=\"เช่น MC, TD, PY\">`, 'คั่นแต่ละ SKU ด้วยเครื่องหมายจุลภาค (,)')}\n          ${f('หมายเหตุ / สิ่งที่ต้องติดตาม', `<textarea id=\"mfNote\" class=\"textarea\" rows=\"3\">${v('status_note')}</textarea>`, '', true)}\n        </div>\n        <div class=\"px-5 sm:px-6 py-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 bg-white rounded-b-xl sticky bottom-0\">\n          <span>${code ? `<button class=\"btn btn-sm text-red-600 border-red-200 bg-white\" onclick=\"deleteMaterial('${esc(code)}')\">ลบวัตถุดิบนี้</button>` : ''}</span>\n          <span class=\"flex gap-2\"><button class=\"btn btn-ghost\" onclick=\"closeModal()\">ยกเลิก</button><button class=\"btn btn-primary px-6\" id=\"matSaveBtn\" onclick=\"saveMaterial()\">บันทึก</button></span>\n        </div>\n      </div>\n    </div>`;\n  if (!code) document.getElementById('mfTh').focus();\n}\n\nasync function saveMaterial(){\n  const g = id => document.getElementById(id).value;\n  const body = { material_name_th:g('mfTh'), material_name_en:g('mfEn'), category:g('mfCat'), allergen_group:g('mfAlg'),\n    fda_or_source:g('mfFda'), storage_condition:g('mfSto'), used_in_sku:g('mfSku'), status_note:g('mfNote'), unit:g('mfUnit') };\n  const btn = document.getElementById('matSaveBtn'); btn.disabled = true; btn.textContent = 'กำลังบันทึก...';\n  try {\n    const r = _matCode ? await api('PUT', '/api/materials/' + encodeURIComponent(_matCode), body) : await api('POST', '/api/materials', body);\n    const i = REF.rawMaterials.findIndex(x => x.material_code === r.material.material_code);\n    if (i >= 0) REF.rawMaterials[i] = r.material; else REF.rawMaterials.push(r.material);\n    REF.rawMaterials.sort((a,b) => a.material_code.localeCompare(b.material_code));\n    toast('บันทึกแล้ว ' + r.material.material_code + ' ✓'); closeModal(); renderMatGrid();\n  } catch (e) { toast(e.message,'error'); btn.disabled = false; btn.textContent = 'บันทึก'; }\n}\n\nasync function deleteMaterial(code){\n  const m = REF.rawMaterials.find(x => x.material_code === code);\n  if (!confirm('ยืนยันการลบ ' + code + ' ' + (m ? m.material_name_th : '') + ' ใช่หรือไม่?')) return;\n  try {\n    await api('DELETE', '/api/materials/' + encodeURIComponent(code));\n    REF.rawMaterials = REF.rawMaterials.filter(x => x.material_code !== code);\n    toast('ลบแล้ว ' + code); closeModal(); renderMatGrid();\n  } catch (e) { toast(e.message,'error'); }\n}\n\n/* -------------------------------------------------------------- KPI แผนก RA */\nlet KPI = null, _kpiKey = null;\nconst kpiNum = v => Number(v).toLocaleString('th-TH', { maximumFractionDigits: 2 });\nconst kpiVal = (d, v) => kpiNum(v) + (d.unit === '%' ? '%' : ' ' + d.unit);\nfunction kpiPeriodLabel(d, p){\n  if (d.freq === 'M') return new Date(p + '-01T00:00:00').toLocaleDateString('th-TH', { month:'short', year:'2-digit' });\n  if (d.freq === 'Q') return 'ไตรมาส ' + p.slice(6) + '/' + (Number(p.slice(0,4)) + 543);\n  return new Date(p + 'T00:00:00').toLocaleDateString('th-TH', { day:'numeric', month:'short', year:'2-digit' });\n}\nfunction kpiTarget(d){\n  const t = KPI.targets.filter(x => x.kpi_key === d.key).pop();\n  return t ? { value:t.target_value, basis:t.basis_ref, by:t.set_by_name, at:t.set_at } : { value:d.target, basis:null };\n}\nfunction kpiTargetText(d){\n  const t = kpiTarget(d);\n  if (t.value === null || t.value === undefined) return 'ยังไม่กำหนด';\n  if (!t.basis) return d.targetText;\n  return (d.op === 'GE' ? '≥ ' : '≤ ') + kpiVal(d, t.value);\n}\nfunction kpiPass(d, v){ const t = kpiTarget(d).value; if (t === null || t === undefined) return null; return d.op === 'GE' ? v >= t : v <= t; }\nfunction kpiRows(d){ return KPI.results.filter(r => r.kpi_key === d.key && !r.voided_at); }\n/* status of one KPI: periodic = latest period; per-event = every event of the latest year must pass */\nfunction kpiState(d){\n  const rows = kpiRows(d); if (!rows.length) return { s:'none', rows };\n  const latest = rows[0];\n  if (kpiPass(d, latest.value) === null) return { s:'notarget', rows, latest };\n  if (d.freq !== 'E') return { s: kpiPass(d, latest.value) ? 'pass' : 'fail', rows, latest };\n  const year = rows.filter(r => r.period.slice(0,4) === latest.period.slice(0,4));\n  const ok = year.filter(r => kpiPass(d, r.value)).length;\n  return { s: ok === year.length ? 'pass' : 'fail', rows, latest, ok, total: year.length, year: Number(latest.period.slice(0,4)) + 543 };\n}\nconst KPI_PILL = { pass:['ผ่านเป้า','green'], fail:['ไม่ผ่านเป้า','red'], notarget:['รอกำหนดเป้า','amber'], none:['ยังไม่มีข้อมูล','slate'] };\nconst kpiPill = s => `<span class=\"pill ${PILL[KPI_PILL[s][1]]}\">${KPI_PILL[s][0]}</span>`;\nconst kpiCanRecord = () => ME.roles.some(r => ['RA','R&D','QA','MANAGEMENT'].includes(r));\n\nasync function renderKpi(){\n  const box = document.getElementById('pageContent');\n  if (!KPI) box.innerHTML = '<div class=\"text-sm text-ink-mute\">กำลังโหลด…</div>';\n  try { KPI = await api('GET','/api/kpi'); }\n  catch (e) { box.innerHTML = `<div class=\"text-red-600 text-sm\">${esc(e.message)}</div>`; return; }\n  if (currentPage !== 'kpi') return;\n  const states = KPI.defs.map(d => [d, kpiState(d)]);\n  const n = s => states.filter(([,x]) => x.s === s).length;\n  const tile = (v,l,c) => `<div class=\"card p-4 text-center border-t-4 ${c}\"><div class=\"text-3xl font-bold\">${v}</div><div class=\"text-xs text-ink-mute font-semibold mt-1\">${l}</div></div>`;\n  box.innerHTML = `\n    <div class=\"grid grid-cols-2 md:grid-cols-4 gap-3 mb-4\">\n      ${tile(n('pass'),'ผ่านเป้า','border-t-green-500 text-green-700')}\n      ${tile(n('fail'),'ไม่ผ่านเป้า','border-t-red-500 text-red-700')}\n      ${tile(n('notarget'),'มีผลแล้ว รอกำหนดเป้า','border-t-amber-500 text-amber-700')}\n      ${tile(n('none'),'ยังไม่มีข้อมูล','border-t-slate-400')}\n    </div>\n    <div class=\"mat-note mb-4\">ตัวเลขทุกค่าต้องมาจาก Log/เอกสารต้นทางจริง และต้องระบุเอกสารอ้างอิงทุกครั้ง ระบบคำนวณค่า KPI ให้เองจากตัวตั้งและตัวหาร แตะที่ KPI เพื่อดูนิยาม บันทึกผล และย้อนดูที่มาของตัวเลข</div>\n    ${KPI.groups.map((g, i) => `\n      <div class=\"card mb-4 overflow-hidden\">\n        <div class=\"px-4 py-3 bg-slate-50 border-b border-slate-200 font-bold text-sm\">${i+1}. ${esc(g)}</div>\n        ${states.filter(([d]) => d.group === i+1).map(([d, st]) => `\n          <button type=\"button\" class=\"w-full text-left px-4 py-3 border-b border-slate-100 last:border-0 flex items-center gap-3 hover:bg-red-50\" onclick=\"openKpi('${d.key}')\">\n            <div class=\"flex-1 min-w-0\">\n              <div class=\"font-semibold text-sm\">${esc(d.name)}</div>\n              <div class=\"text-[11.5px] text-ink-mute mt-0.5\">เป้า ${esc(kpiTargetText(d))} · ${esc(d.freqText)}</div>\n              ${st.total ? `<div class=\"text-[11.5px] text-ink-mute\">ปี ${st.year}: ผ่านเป้า ${st.ok} จาก ${st.total} รายการ</div>` : ''}\n            </div>\n            <div class=\"text-right shrink-0\">\n              ${st.latest ? `<div class=\"text-lg font-bold leading-tight\">${esc(kpiVal(d, st.latest.value))}</div><div class=\"text-[11px] text-ink-mute mb-1\">${esc(kpiPeriodLabel(d, st.latest.period))}</div>` : ''}\n              ${kpiPill(st.s)}\n            </div>\n          </button>`).join('')}\n      </div>`).join('')}\n    <p class=\"text-[11px] text-ink-mute\">อ้างอิง: Draft KPI แผนก RA — ปุยแสบปาก (14 ตัวชี้วัด ตามหน้าที่ความรับผิดชอบ 7 ข้อ) · เป้าที่ยังไม่มีตัวเลขให้ผู้อนุมัติตั้งจาก Baseline รอบจริง</p>`;\n}\n\nfunction kpiModal(inner, wide){\n  document.getElementById('modalRoot').innerHTML = `\n    <div class=\"fixed inset-0 bg-slate-900/50 z-40 flex items-start justify-center overflow-y-auto p-2 sm:p-4\" onclick=\"if(event.target===this)closeModal()\">\n      <div class=\"card w-full ${wide?'max-w-3xl':'max-w-md'} my-4 shadow-2xl border-0\">${inner}</div></div>`;\n}\nfunction openKpi(key){\n  _kpiKey = key;\n  const d = KPI.defs.find(x => x.key === key), st = kpiState(d), t = kpiTarget(d);\n  const all = KPI.results.filter(r => r.kpi_key === key);\n  const dl = (k, v) => `<dt>${k}</dt><dd>${v}</dd>`;\n  kpiModal(`\n    <div class=\"px-5 py-4 border-b flex justify-between gap-3\"><div><div class=\"font-bold\">${esc(d.name)}</div><div class=\"text-[11.5px] text-ink-mute\">${d.group}. ${esc(KPI.groups[d.group-1])}</div></div><button class=\"text-2xl text-slate-400\" onclick=\"closeModal()\" aria-label=\"ปิด\">&times;</button></div>\n    <div class=\"p-5 space-y-4\">\n      <div class=\"flex items-center gap-3\">${st.latest ? `<div class=\"text-3xl font-bold\">${esc(kpiVal(d, st.latest.value))}</div><div class=\"text-xs text-ink-mute\">${esc(kpiPeriodLabel(d, st.latest.period))}${st.latest.subject?'<br>'+esc(st.latest.subject):''}</div>` : ''}<div class=\"ml-auto\">${kpiPill(st.s)}</div></div>\n      <dl class=\"mat-dl text-sm\" style=\"display:grid;grid-template-columns:auto 1fr;gap:6px 12px\">\n        ${dl('นิยาม/สูตร', esc(d.formula))}\n        ${dl('เป้าหมาย', esc(kpiTargetText(d)) + (t.basis ? `<div class=\"text-[11.5px] text-ink-mute\">ที่มา: ${esc(t.basis)} · ตั้งโดย ${esc(t.by||'-')} · ${fmtDate(t.at)}</div>` : (t.value === null ? `<div class=\"text-[11.5px] text-amber-700\">${esc(d.targetText)}</div>` : '<div class=\"text-[11.5px] text-ink-mute\">ตามเอกสาร Draft KPI</div>')))}\n        ${dl('แหล่งข้อมูล', esc(d.source))}\n        ${dl('ความถี่', esc(d.freqText))}\n      </dl>\n      <div class=\"flex flex-wrap gap-2\">\n        ${kpiCanRecord() ? `<button class=\"btn btn-primary\" onclick=\"openKpiEntry()\">+ บันทึกผล</button>` : ''}\n        ${ME.canApprove ? `<button class=\"btn btn-ghost\" onclick=\"openKpiTarget()\">ตั้งเป้าหมาย</button>` : ''}\n      </div>\n    </div>\n    <div class=\"px-5 pb-2 font-bold text-sm\">ผลที่บันทึก <span class=\"text-ink-mute font-normal\">(${all.length})</span></div>\n    ${all.length ? `<div class=\"overflow-x-auto\"><table class=\"dt stack\"><thead><tr><th>${d.freq==='E'?'วันที่ / เรื่อง':'งวด'}</th><th>ผล</th><th>ที่มาของตัวเลข</th><th>ผู้บันทึก</th><th></th></tr></thead><tbody>\n      ${all.map(r => { const v = !!r.voided_at, p = kpiPass(d, r.value);\n        return `<tr class=\"${v?'opacity-60':''}\">\n          <td data-l=\"${d.freq==='E'?'วันที่ / เรื่อง':'งวด'}\">${esc(kpiPeriodLabel(d, r.period))}${r.subject?`<div class=\"text-[12px]\">${esc(r.subject)}</div>`:''}<div class=\"text-[11px] text-ink-mute\">${esc(r.id)}</div></td>\n          <td data-l=\"ผล\"><div><b class=\"${v?'line-through':''}\">${esc(kpiVal(d, r.value))}</b>${r.denominator!==null?` <span class=\"text-[11.5px] text-ink-mute\">(${kpiNum(r.numerator)} ÷ ${kpiNum(r.denominator)})</span>`:''}\n            <div>${v ? '<span class=\"pill '+PILL.slate+'\">ยกเลิกแล้ว</span>' : p===null ? '' : kpiPill(p?'pass':'fail')}</div></div></td>\n          <td data-l=\"ที่มาของตัวเลข\" class=\"text-[12.5px]\"><div>${esc(r.source_ref)}${r.note?`<div class=\"text-ink-mute\">${esc(r.note)}</div>`:''}${v?`<div class=\"text-red-700\">ยกเลิก: ${esc(r.void_reason)} (${esc(r.voided_by_name||'-')})</div>`:''}</div></td>\n          <td data-l=\"ผู้บันทึก\" class=\"text-[12px]\">${esc(r.created_by_name||'-')}<div class=\"text-ink-mute\">${fmtDate(r.created_at)}</div></td>\n          <td class=\"act text-right\">${attBtn('kpiResults', r.id, 'text-slate-500 text-xs font-semibold px-1')} ${!v && (r.created_by===ME.id || ME.canApprove) ? `<button class=\"text-brand text-xs font-semibold\" onclick=\"voidKpi('${esc(r.id)}')\">ยกเลิก</button>` : ''}</td></tr>`; }).join('')}\n      </tbody></table></div>` : '<div class=\"text-sm text-ink-mute px-5 pb-5\">ยังไม่มีผลที่บันทึก</div>'}\n    <div class=\"p-3\"></div>`, true);\n}\n\nfunction kpiPeriodInput(d){\n  const now = new Date(), y = now.getFullYear(), m = String(now.getMonth()+1).padStart(2,'0'), day = String(now.getDate()).padStart(2,'0');\n  if (d.freq === 'M') return `<input id=\"kpPeriod\" type=\"month\" class=\"input\" max=\"${y}-${m}\" value=\"${y}-${m}\">`;\n  if (d.freq === 'E') return `<input id=\"kpPeriod\" type=\"date\" class=\"input\" max=\"${y}-${m}-${day}\" value=\"${y}-${m}-${day}\">`;\n  const opts = []; let yy = y, q = Math.ceil((now.getMonth()+1)/3);\n  for (let i = 0; i < 8; i++) { opts.push(`<option value=\"${yy}-Q${q}\">ไตรมาส ${q}/${yy+543}</option>`); if (--q === 0) { q = 4; yy--; } }\n  return `<select id=\"kpPeriod\" class=\"select\">${opts.join('')}</select>`;\n}\nfunction openKpiEntry(){\n  const d = KPI.defs.find(x => x.key === _kpiKey);\n  const numField = (id, label) => `<div><label class=\"label\" for=\"${id}\">${esc(label)} <span class=\"text-red-500\">*</span></label><input id=\"${id}\" class=\"input\" type=\"number\" inputmode=\"decimal\" min=\"0\" step=\"any\" oninput=\"kpiPreview()\"></div>`;\n  kpiModal(`<div class=\"p-5 space-y-3\">\n    <div><div class=\"font-bold\">บันทึกผล KPI</div><div class=\"text-sm text-ink-mute\">${esc(d.name)}</div></div>\n    <div><label class=\"label\" for=\"kpPeriod\">${d.freq==='E'?'วันที่':'งวดที่รายงาน'} <span class=\"text-red-500\">*</span></label>${kpiPeriodInput(d)}</div>\n    ${d.freq==='E' ? `<div><label class=\"label\" for=\"kpSubject\">${esc(d.subjectLabel)} <span class=\"text-red-500\">*</span></label><input id=\"kpSubject\" class=\"input\" maxlength=\"200\"></div>` : ''}\n    ${d.kind==='NUMBER' ? numField('kpValue', d.valueLabel + ' (' + d.unit + ')') : numField('kpNum', d.numLabel) + numField('kpDen', d.denLabel)}\n    <div id=\"kpPreview\" class=\"mat-note\">ผล: —</div>\n    <div><label class=\"label\" for=\"kpSource\">เอกสาร/Log อ้างอิงของตัวเลขนี้ <span class=\"text-red-500\">*</span></label><input id=\"kpSource\" class=\"input\" maxlength=\"300\" placeholder=\"${esc(d.source)} เช่น เลขที่เอกสาร / ลำดับใน Log\"><div class=\"text-[11px] text-ink-mute mt-1\">ใช้ย้อนกลับไปตรวจที่มาของตัวเลขตอน Audit</div></div>\n    <div><label class=\"label\" for=\"kpNote\">หมายเหตุ</label><textarea id=\"kpNote\" class=\"textarea\" rows=\"2\" maxlength=\"500\"></textarea></div>\n    <div class=\"flex justify-end gap-2 pt-2\"><button class=\"btn btn-ghost\" onclick=\"openKpi(_kpiKey)\">ยกเลิก</button><button id=\"kpSave\" class=\"btn btn-primary\" onclick=\"saveKpiEntry()\">บันทึก</button></div>\n  </div>`);\n}\nfunction kpiPreview(){\n  const d = KPI.defs.find(x => x.key === _kpiKey), el = document.getElementById('kpPreview'), g = id => { const e = document.getElementById(id); return e && e.value !== '' ? Number(e.value) : NaN; };\n  let v = NaN;\n  if (d.kind === 'NUMBER') v = g('kpValue');\n  else { const a = g('kpNum'), b = g('kpDen'); if (b > 0 && a >= 0 && !(d.kind === 'RATIO' && a > b)) v = d.kind === 'RATIO' ? a / b * 100 : a / b; }\n  if (!(v >= 0)) { el.className = 'mat-note'; el.textContent = 'ผล: —'; return; }\n  v = Math.round(v * 100) / 100;\n  const p = kpiPass(d, v);\n  el.className = 'mat-note' + (p === false ? ' urgent' : '');\n  el.textContent = 'ผล: ' + kpiVal(d, v) + ' · เป้า ' + kpiTargetText(d) + (p === null ? '' : p ? ' · ผ่านเป้า' : ' · ไม่ผ่านเป้า');\n}\nasync function saveKpiEntry(){\n  const d = KPI.defs.find(x => x.key === _kpiKey), v = id => { const e = document.getElementById(id); return e ? e.value : ''; };\n  const btn = document.getElementById('kpSave'); btn.disabled = true;\n  try {\n    await api('POST','/api/kpi/results',{ kpiKey:d.key, period:v('kpPeriod'), subject:v('kpSubject'), numerator:v('kpNum'), denominator:v('kpDen'), value:v('kpValue'), sourceRef:v('kpSource'), note:v('kpNote') });\n    toast('บันทึกผล KPI แล้ว ✓'); await renderKpi(); openKpi(d.key);\n  } catch (e) { toast(e.message,'error'); btn.disabled = false; }\n}\nasync function voidKpi(id){\n  const reason = prompt('ยกเลิกรายการ ' + id + '\\nรายการจะยังอยู่ในประวัติ แต่ไม่นำมาคิด KPI\\nกรุณาระบุเหตุผล'); if (!reason) return;\n  try { await api('POST', `/api/kpi/results/${id}/void`, { reason }); toast('ยกเลิกรายการแล้ว ✓'); await renderKpi(); openKpi(_kpiKey); }\n  catch (e) { toast(e.message,'error'); }\n}\nfunction openKpiTarget(){\n  const d = KPI.defs.find(x => x.key === _kpiKey), t = kpiTarget(d);\n  kpiModal(`<div class=\"p-5 space-y-3\">\n    <div><div class=\"font-bold\">ตั้งเป้าหมาย KPI</div><div class=\"text-sm text-ink-mute\">${esc(d.name)}</div></div>\n    <div class=\"mat-note warn\">เป้าต้องมาจาก Baseline รอบการทำงานจริง หรือมติ/ข้อตกลงกับผู้บริหาร ห้ามตั้งจากการคาดเดา</div>\n    <div><label class=\"label\" for=\"ktValue\">ค่าเป้าหมาย (${d.op==='GE'?'ไม่ต่ำกว่า':'ไม่เกิน'}, ${esc(d.unit)}) <span class=\"text-red-500\">*</span></label><input id=\"ktValue\" class=\"input\" type=\"number\" inputmode=\"decimal\" min=\"0\" step=\"any\" value=\"${t.value===null||t.value===undefined?'':t.value}\"></div>\n    <div><label class=\"label\" for=\"ktBasis\">ที่มาของเป้าหมาย <span class=\"text-red-500\">*</span></label><input id=\"ktBasis\" class=\"input\" maxlength=\"300\" placeholder=\"เช่น รายงานการประชุมผู้บริหาร ครั้งที่ / วันที่\"></div>\n    <div class=\"flex justify-end gap-2 pt-2\"><button class=\"btn btn-ghost\" onclick=\"openKpi(_kpiKey)\">ยกเลิก</button><button class=\"btn btn-primary\" onclick=\"saveKpiTarget()\">บันทึก</button></div>\n  </div>`);\n}\nasync function saveKpiTarget(){\n  try {\n    await api('POST','/api/kpi/targets',{ kpiKey:_kpiKey, value:document.getElementById('ktValue').value, basisRef:document.getElementById('ktBasis').value });\n    toast('ตั้งเป้าหมายแล้ว ✓'); await renderKpi(); openKpi(_kpiKey);\n  } catch (e) { toast(e.message,'error'); }\n}\n\n/* -------------------------------------------------------------- รูปแนบ (image attachments) */\nlet ATT = {}, _att = null;\nconst ATT_TITLE = { regProducts:'ผลิตภัณฑ์', formulaControl:'สูตร', labelChecklist:'ฉลาก', rawMaterials:'วัตถุดิบ', kpiResults:'ผล KPI' };\nasync function loadAttCounts(){ try { ATT = (await api('GET','/api/attachments/counts')).counts || {}; } catch { /* photos are optional: the rest of the app still works */ } }\nfunction attBtn(collection, id, cls){\n  const n = ATT[collection + '|' + id] || 0;\n  return `<button class=\"${cls}\" onclick=\"openAttachments('${collection}','${esc(id)}')\">📎 รูป${n ? ' (' + n + ')' : ''}</button>`;\n}\nasync function openAttachments(collection, id){\n  _att = { collection, id };\n  let r;\n  try { r = await api('GET', `/api/attachments?collection=${collection}&id=${encodeURIComponent(id)}`); }\n  catch (e) { toast(e.message,'error'); return; }\n  const live = r.rows.filter(a => !a.voided_at), dead = r.rows.filter(a => a.voided_at);\n  const src = a => `/api/attachments/${a.id}/file`;\n  const kb = a => Math.max(1, Math.round(a.size / 1024)).toLocaleString('th-TH') + ' KB';\n  document.getElementById('modalRoot').innerHTML = `\n    <div class=\"fixed inset-0 bg-slate-900/50 z-40 flex items-start justify-center overflow-y-auto p-2 sm:p-4\" onclick=\"if(event.target===this)closeAttachments()\">\n      <div class=\"card w-full max-w-3xl my-4 shadow-2xl border-0\">\n        <div class=\"px-5 py-4 border-b flex justify-between gap-3\"><div><div class=\"font-bold\">รูปแนบ ${esc(ATT_TITLE[collection])} ${esc(id)}</div><div class=\"text-[11.5px] text-ink-mute\">${live.length} จาก ${r.max} รูป · รูปที่แนบแล้วแก้หรือลบไม่ได้ ยกเลิกได้พร้อมเหตุผล</div></div><button class=\"text-2xl text-slate-400\" onclick=\"closeAttachments()\" aria-label=\"ปิด\">&times;</button></div>\n        <div class=\"p-5 space-y-4\">\n          ${kpiCanRecord() ? `<div class=\"space-y-2\" style=\"border:1px dashed #d7dcdf;border-radius:12px;padding:12px\">\n            <label class=\"label\" for=\"attFile\">เลือกรูปหรือถ่ายภาพ (เลือกได้หลายรูป)</label>\n            <input id=\"attFile\" type=\"file\" accept=\"image/*\" multiple class=\"input\">\n            <input id=\"attCaption\" class=\"input\" maxlength=\"200\" placeholder=\"คำอธิบายรูป เช่น ฉลากด้านหลัง, COA lot 123 (ไม่บังคับ)\">\n            <div class=\"flex items-center justify-between gap-2\"><span id=\"attMsg\" class=\"text-[12px] text-ink-mute\">ระบบย่อรูปให้อัตโนมัติก่อนอัปโหลด</span><button id=\"attSave\" class=\"btn btn-primary\" onclick=\"uploadAttachments()\">อัปโหลด</button></div>\n          </div>` : ''}\n          ${live.length ? `<div style=\"display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px\">\n            ${live.map(a => `<figure style=\"margin:0;min-width:0\">\n              <button type=\"button\" onclick=\"viewAttachment(${a.id})\" style=\"display:block;width:100%;padding:0;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;background:#f8fafc\" aria-label=\"ดูรูปขนาดเต็ม\">\n                <img src=\"${src(a)}\" alt=\"${esc(a.caption || a.file_name)}\" loading=\"lazy\" style=\"display:block;width:100%;height:130px;object-fit:cover\"></button>\n              <figcaption class=\"text-[12px] mt-1\" style=\"overflow-wrap:anywhere\">${a.caption ? `<div class=\"font-semibold\">${esc(a.caption)}</div>` : ''}\n                <div class=\"text-ink-mute\">${esc(a.created_by_name || '-')} · ${fmtDate(a.created_at)} · ${kb(a)}</div>\n                ${a.created_by === ME.id || ME.canApprove ? `<button class=\"text-brand text-xs font-semibold\" onclick=\"voidAttachment(${a.id})\">ยกเลิกรูปนี้</button>` : ''}</figcaption>\n            </figure>`).join('')}</div>` : '<div class=\"text-sm text-ink-mute text-center py-4\">ยังไม่มีรูปแนบ</div>'}\n          ${dead.length ? `<details class=\"text-[12.5px]\"><summary class=\"text-ink-mute\" style=\"cursor:pointer\">รูปที่ยกเลิกแล้ว (${dead.length})</summary>\n            ${dead.map(a => `<div class=\"py-1 border-b border-slate-100\"><button class=\"text-brand font-semibold\" onclick=\"viewAttachment(${a.id})\">${esc(a.caption || a.file_name)}</button> · ${esc(a.created_by_name || '-')} · ${fmtDate(a.created_at)}<div class=\"text-red-700\">ยกเลิก: ${esc(a.void_reason)} (${esc(a.voided_by_name || '-')})</div></div>`).join('')}</details>` : ''}\n        </div>\n      </div></div>`;\n}\nfunction closeAttachments(){\n  const a = _att; _att = null; closeModal();\n  if (a && a.collection === 'kpiResults' && _kpiKey && currentPage === 'kpi') { renderKpi().then(() => openKpi(_kpiKey)); return; }\n  if (PAGES[currentPage] && currentPage !== 'auditLog' && currentPage !== 'users') PAGES[currentPage].render();\n}\nfunction viewAttachment(id){\n  const d = document.createElement('div');\n  d.style.cssText = 'position:fixed;inset:0;z-index:60;background:rgba(0,0,0,.92);display:flex;align-items:center;justify-content:center;overflow:auto;padding:8px';\n  d.setAttribute('role','dialog'); d.setAttribute('aria-label','รูปขนาดเต็ม แตะเพื่อปิด');\n  d.innerHTML = `<img src=\"/api/attachments/${id}/file\" alt=\"\" style=\"max-width:100%;max-height:100%;object-fit:contain\">`;\n  d.onclick = () => d.remove();\n  document.body.appendChild(d);\n}\n/* shrink a photo in the browser: long side <= 1600 px, JPEG, <= 700 KB */\nasync function attShrink(file){\n  let img, w, h;\n  try { img = await createImageBitmap(file, { imageOrientation:'from-image' }); w = img.width; h = img.height; }\n  catch {\n    img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('เปิดไฟล์รูป \"' + file.name + '\" ไม่ได้')); i.src = URL.createObjectURL(file); });\n    w = img.naturalWidth; h = img.naturalHeight;\n  }\n  if (!w || !h) throw new Error('เปิดไฟล์รูป \"' + file.name + '\" ไม่ได้');\n  for (const [max, q] of [[1600,.8],[1600,.65],[1280,.6],[1024,.55],[800,.5]]) {\n    const s = Math.min(1, max / Math.max(w, h)), c = document.createElement('canvas');\n    c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s));\n    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);\n    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', q));\n    if (blob && blob.size <= 700000) return blob;\n  }\n  throw new Error('ย่อรูป \"' + file.name + '\" ไม่สำเร็จ');\n}\nconst attBase64 = blob => new Promise((res, rej) => { const f = new FileReader(); f.onload = () => res(String(f.result).split(',')[1]); f.onerror = () => rej(new Error('อ่านไฟล์ไม่ได้')); f.readAsDataURL(blob); });\nasync function uploadAttachments(){\n  const files = [...document.getElementById('attFile').files], msg = document.getElementById('attMsg'), btn = document.getElementById('attSave');\n  if (!files.length) { toast('กรุณาเลือกรูปก่อน','error'); return; }\n  const caption = document.getElementById('attCaption').value, a = _att;\n  btn.disabled = true; let ok = 0;\n  for (let i = 0; i < files.length; i++) {\n    msg.textContent = `กำลังอัปโหลดรูปที่ ${i + 1} จาก ${files.length}…`;\n    try {\n      if (!/^image\\//.test(files[i].type || 'image/')) throw new Error('\"' + files[i].name + '\" ไม่ใช่ไฟล์รูป');\n      const blob = await attShrink(files[i]);\n      await api('POST','/api/attachments',{ collection:a.collection, recordId:a.id, fileName:files[i].name, caption, dataBase64: await attBase64(blob) });\n      ok++;\n    } catch (e) { toast(e.message,'error'); }\n  }\n  if (ok) toast(`แนบรูปแล้ว ${ok} รูป ✓`);\n  await loadAttCounts();\n  if (_att === a) openAttachments(a.collection, a.id);\n}\nasync function voidAttachment(id){\n  const reason = prompt('ยกเลิกรูปนี้\\nรูปจะยังอยู่ในประวัติ แต่ไม่แสดงเป็นรูปแนบปัจจุบัน\\nกรุณาระบุเหตุผล'); if (!reason) return;\n  try { await api('POST', `/api/attachments/${id}/void`, { reason }); toast('ยกเลิกรูปแล้ว ✓'); await loadAttCounts(); if (_att) openAttachments(_att.collection, _att.id); }\n  catch (e) { toast(e.message,'error'); }\n}\n\n/* -------------------------------------------------------------- users & account */\nasync function renderUsers(){\n  document.getElementById('pageContent').innerHTML = '<div class=\"text-sm text-ink-mute\">กำลังโหลด…</div>';\n  try {\n    const r = await api('GET','/api/users');\n    document.getElementById('pageContent').innerHTML = `\n      <div class=\"flex justify-end mb-3\"><button class=\"btn btn-primary\" onclick=\"openAddUser()\">+ เพิ่มผู้ใช้</button></div>\n      <div class=\"card overflow-hidden\"><div class=\"overflow-x-auto\"><table class=\"dt stack\"><thead><tr><th>อีเมล</th><th>ชื่อ</th><th>บทบาท (* = อนุมัติได้)</th><th>รหัสผ่าน</th><th></th></tr></thead><tbody>\n      ${r.rows.map(u => `<tr><td data-l=\"อีเมล\">${esc(u.email)}</td><td data-l=\"ชื่อ\">${esc(u.name)}</td><td data-l=\"บทบาท\">${esc(u.roles||'-')}</td>\n        <td data-l=\"รหัสผ่าน\">${u.hasPassword?'<span class=\"text-green-700 text-xs\">ตั้งแล้ว</span>':'<span class=\"text-amber-700 text-xs\">ยังไม่ตั้ง</span>'}</td>\n        <td class=\"act text-right\"><button class=\"text-brand text-xs font-semibold\" onclick=\"resetPassword('${esc(u.id)}','${esc(u.email)}')\">ตั้งรหัสผ่าน</button></td></tr>`).join('')}\n      </tbody></table></div></div>\n      <p class=\"text-[11px] text-ink-mute mt-2\">รายชื่อผู้ใช้ใช้ร่วมกับระบบ QA · ผู้ใช้เข้าสู่ระบบด้วยอีเมล หรือชื่อหน้า @ (เช่น ra)</p>`;\n  } catch (e) { document.getElementById('pageContent').innerHTML = `<div class=\"text-red-600 text-sm\">${esc(e.message)}</div>`; }\n}\nasync function resetPassword(id, email){\n  const pw = prompt('ตั้งรหัสผ่านใหม่ให้ ' + email + ' (อย่างน้อย 8 ตัว)\\nแจ้งรหัสนี้ให้ผู้ใช้ และให้เปลี่ยนเองภายหลัง'); if (!pw) return;\n  try { await api('POST', `/api/users/${encodeURIComponent(id)}/password`, { password: pw }); toast('ตั้งรหัสผ่านแล้ว ✓'); renderUsers(); }\n  catch (e) { toast(e.message,'error'); }\n}\nfunction openAddUser(){\n  document.getElementById('modalRoot').innerHTML = `\n    <div class=\"fixed inset-0 bg-slate-900/50 z-40 flex items-start justify-center overflow-y-auto p-4\" onclick=\"if(event.target===this)closeModal()\">\n      <div class=\"card w-full max-w-md my-6 p-6 space-y-3\">\n        <div class=\"font-bold\">เพิ่มผู้ใช้</div>\n        <div><label class=\"label\">อีเมล</label><input id=\"nuEmail\" class=\"input\" autocapitalize=\"off\"></div>\n        <div><label class=\"label\">ชื่อที่แสดง</label><input id=\"nuName\" class=\"input\"></div>\n        <div><label class=\"label\">บทบาท</label><select id=\"nuRole\" class=\"select\">${['RA','QA','R&D','MANAGEMENT','QC','DCC'].map(r => `<option>${r}</option>`).join('')}</select></div>\n        <label class=\"flex items-center gap-2 text-sm\"><input id=\"nuApprove\" type=\"checkbox\"> อนุมัติสูตร/ฉลากได้</label>\n        <div><label class=\"label\">รหัสผ่านเริ่มต้น (อย่างน้อย 8 ตัว)</label><input id=\"nuPass\" class=\"input\" type=\"text\"></div>\n        <div class=\"flex justify-end gap-2 pt-2\"><button class=\"btn btn-ghost\" onclick=\"closeModal()\">ยกเลิก</button><button class=\"btn btn-primary\" onclick=\"addUser()\">เพิ่ม</button></div>\n      </div></div>`;\n}\nasync function addUser(){\n  const v = id => document.getElementById(id).value;\n  try {\n    await api('POST','/api/users',{ email:v('nuEmail'), name:v('nuName'), role:v('nuRole'), canApprove:document.getElementById('nuApprove').checked, password:v('nuPass') });\n    toast('เพิ่มผู้ใช้แล้ว ✓'); closeModal(); renderUsers();\n  } catch (e) { toast(e.message,'error'); }\n}\nfunction openAccount(){\n  document.getElementById('modalRoot').innerHTML = `\n    <div class=\"fixed inset-0 bg-slate-900/50 z-40 flex items-start justify-center overflow-y-auto p-4\" onclick=\"if(event.target===this)closeModal()\">\n      <div class=\"card w-full max-w-md my-6 p-6 space-y-3\">\n        <div class=\"font-bold\">${esc(ME.name)}</div>\n        <div class=\"text-sm text-ink-mute\">${esc(ME.email)} · ${esc(ME.roles.join(', '))}${ME.canApprove?' · อนุมัติได้':''}</div>\n        <div class=\"border-t pt-3 font-semibold text-sm\">เปลี่ยนรหัสผ่าน</div>\n        <input id=\"pwCur\" class=\"input\" type=\"password\" placeholder=\"รหัสผ่านเดิม\" autocomplete=\"current-password\">\n        <input id=\"pwNew\" class=\"input\" type=\"password\" placeholder=\"รหัสผ่านใหม่ (อย่างน้อย 8 ตัว)\" autocomplete=\"new-password\">\n        <div class=\"flex justify-between gap-2 pt-2\"><button class=\"btn btn-ghost\" onclick=\"doLogout()\">ออกจากระบบ</button>\n          <div class=\"flex gap-2\"><button class=\"btn btn-ghost\" onclick=\"closeModal()\">ปิด</button><button class=\"btn btn-primary\" onclick=\"changePassword()\">บันทึก</button></div></div>\n      </div></div>`;\n}\nasync function changePassword(){\n  try { await api('POST','/api/me/password',{ current:document.getElementById('pwCur').value, next:document.getElementById('pwNew').value }); toast('เปลี่ยนรหัสผ่านแล้ว ✓'); closeModal(); }\n  catch (e) { toast(e.message,'error'); }\n}\n\n/* -------------------------------------------------------------- start */\nwindow.addEventListener('DOMContentLoaded', async () => {\n  document.getElementById('loginPass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });\n  document.getElementById('setupPass2').addEventListener('keydown', e => { if (e.key === 'Enter') doSetup(); });\n  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal(); toggleNav(false); } });\n  try { const r = await api('GET','/api/me'); ME = r.user; showApp(); }\n  catch { showLogin(); }\n});\n</script>\n</body>\n</html>\n","text"],"/manifest.webmanifest":["application/manifest+json","{\n  \"name\": \"Puisabpak Regulatory — อย. / FDA\",\n  \"short_name\": \"Puisabpak RA\",\n  \"start_url\": \"/\",\n  \"scope\": \"/\",\n  \"display\": \"standalone\",\n  \"background_color\": \"#ffffff\",\n  \"theme_color\": \"#b91c1c\",\n  \"lang\": \"th\",\n  \"icons\": [\n    { \"src\": \"/icon-192.png\", \"sizes\": \"192x192\", \"type\": \"image/png\" },\n    { \"src\": \"/icon-512.png\", \"sizes\": \"512x512\", \"type\": \"image/png\" },\n    { \"src\": \"/icon.svg\", \"sizes\": \"any\", \"type\": \"image/svg+xml\" }\n  ]\n}\n","text"],"/icon.svg":["image/svg+xml","<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 64 64\"><rect width=\"64\" height=\"64\" rx=\"14\" fill=\"#b91c1c\"/><path d=\"M20 18h17a10 10 0 0 1 0 20H27v10h-7z\" fill=\"#fff\"/><rect x=\"27\" y=\"25\" width=\"10\" height=\"6\" rx=\"3\" fill=\"#b91c1c\"/><circle cx=\"46\" cy=\"46\" r=\"6\" fill=\"#fde68a\"/></svg>\n","text"],"/icon-192.png":["image/png","iVBORw0KGgoAAAANSUhEUgAAAMAAAADACAYAAABS3GwHAAAFJUlEQVR4nO3d0XHbRhiF0V+elCG3kQoydjcpJt04kwrShtSH86BIQ0skBZC7WGDvOc8ekg/3w4KUKD/Uzvx4fPw5+jXQz/fn54fRr+HU0Bdj7FSNjWLzJzZ6rtk6hs2ezPBZY6sQuj+J4XOP3iF0e3DDp6VeITR/UMOnp9YhfGn5YMZPb6031qQmw2eEFqfB3SeA8TNKi+3dFYDxM9q9G7w5AONnL+7Z4k0BGD97c+smVwdg/OzVLdtcFYDxs3drN7o4AOPnKNZsdVEAxs/RLN3spwEYP0e1ZLtNfxUCjuZqAK7+HN1nG74YgPEzi2tbdgtEtLMBuPozm0ubdgIQ7UMArv7M6ty2nQBE+yUAV39m937jTgCivQXg6k+K0607AYgmAKJ9qXL7Q57XzTsBiCYAogmAaAIg2oM3wCRzAhBNAEQTANEEQDQBEE0ARBMA0QRANAEQTQBEEwDRBEA0ARBNAEQTANEEQDQBEO230S9ga9+enro87t9fv3Z/jqVOXwvXxX0lcvQ4RxDEZW6BAnx7eooMf4m4W6BkpxE4FV44AUI5EV4IIJhbIwFQ2aeBAKiq3AgEwJvECATAL9IiEAAfJEUgAM5KiUAAXJQQgQC4avYIBEA0AfCpmU8BAbDIrBEIgGgCIJoAWGzG2yABEM03wjpr8c2rPV15vz09TfVtMgF00nIkr4+1pxBmIYDGel4dhdCe9wANbXVrMNMtyGgCYLWZTiABNLL1Vdkp0IYAiCaABkZdjZ0C9xMA0QRANAEQTQBEE0ADoz4Xn+nz+FEEQDQBNLL11djVvw0BsNpMP38QQENbXZVd/dvx69CNvY6zx1XS8NsTQCctQzD8fgTQ2Wzjnen+v8p7AMIJgMVmu/pXCYBwAiCaAFhkxtufKgGwwKzjrxIA4QTAVTNf/asEwBWzj79KAFyQMP4qAXBGyvirBMA7SeOvEgAn0sZfJQD+lzj+KgFQueOv8n2AaMnDf+UECGX8L5wAQYz+IwEEMPzLBNDI6chGfw/Y4JcTQAcGeBzeBBNNAEQTANEEQDRvgjnrj3///PTf/PP7Xxu8kr4EwJslo7/0748agwBYPfxrj3G0ELwHCNdi/D0frzcBBOs11iNFIIBQvUd6lAgEEGircR4hAgGE2XqUe49AAEFGjXHPEQggxOgRjn7+SwRANAEE2MvVdy+v45QAiCYAoglgcnu77djb6xEA0QRANAEQTQBEEwDRBEA0ARBNAEQTwOT29iX1vb0eARAt7s+i+MvNnHICBNjLbcdeXscpARBNACFGX31HP/8lAggyaoR7HX+VAOJsPcY9j79KAJG2GuXex18lgFi9x3mE8VcJIFqvkR5l/FUCiNd6rEcaf1XVw4/Hx5+jXwT7cM8X1o82/FcPVVUi4L2E/yPs+/PzQ9zvArHM0ce9lPcARBMA0QRAtC9VL28GRr8Q2NLr5p0ARBMA0d4CcBtEitOtOwGI9ksATgFm937jTgCifQjAKcCszm3bCUC0swE4BZjNpU07AYh2MQCnALO4tuWrJ4AIOLrPNuwWiGifBuAU4KiWbHfRCSACjmbpZhffAomAo1iz1VXvAUTA3q3d6Oo3wSJgr27Z5k2fAomAvbl1kzd/DCoC9uKeLd71cwARMNq9G7z7B2EiYJQW22s6Xn9jlC20vOg2/VUIpwG9td5Yt8E6DWip18W1+xVbCNyj913FZrcsQmCNrW6nN79nFwLXbP0+cuibVjFQNfbDk919aiOKue3tk8L/AIZpidXHw9FoAAAAAElFTkSuQmCC","b64"],"/icon-512.png":["image/png","iVBORw0KGgoAAAANSUhEUgAAAgAAAAIACAYAAAD0eNT6AAAQAUlEQVR4nO3d0XEbRxqFUUilMKg0NgKXnY2DcTZSOQKnIeWhfaBpgRQIYAbT3X/3Ped9d4Gma+83PZT84URJX56efoz+DABH+OP79w+jPwO/8kMZxMADPBMIYzj0Dow9wDaioD0H3IDBBziWIDieAz2AwQfoSxA8zgHuZPQBahAD+zi0DYw+QG1i4H4O6gajDzAnMXCdw3mH4QdYgxC4zKGcMfoAaxMDPzmIk+EHSCMEwgPA8ANkSw6ByC9u+AE4lxgCUV/Y8ANwTVIIRHxRww/AFgkh8HH0B2jN+AOwVcJ2LFs4CT88ANpb9TZguS9l+AFoYbUQWOoVgPEHoJXVNmaJmlnthwJAbSvcBkx/A2D8Aehthe2ZOgBW+AEAMKfZN2jKK4zZDx2Atcz4SmC6GwDjD0A1M27TVAEw4wEDkGG2jZriymK2QwUg2wyvBMrfABh/AGYzw3aVDoAZDhAALqm+YWUDoPrBAcAtlbesZABUPjAA2KLqppULgKoHBQB7Vdy2UgFQ8YAA4AjVNq5MAFQ7GAA4WqWtKxEAlQ4EAFqqsnnDA6DKQQBALxW2b2gAVDgAABhh9AYOC4DRXxwARhu5hUMCwPgDwLNRm9g9AIw/ALw2Yhu7BoDxB4DLem9ktwAw/gBwXc+t7BIAxh8A7tNrM4f/PQAAQH/NA8DTPwBs02M7mwaA8QeAfVpvaLMAMP4A8JiWW+p3AAAgUJMA8PQPAMdotamHB4DxB4BjtdjWQwPA+ANAG0dvrN8BAIBAhwWAp38AaOvIrT0kAIw/APRx1OZ6BQAAgR4OAE//ANDXEdvrBgAAAj0UAJ7+AWCMRzd4dwAYfwAY65Et9goAAALtCgBP/wBQw95NdgMAAIE2B4CnfwCoZc82uwEAgECbAsDTPwDUtHWj3QAAQKC7A8DTPwDUtmWr3QAAQKC7AsDTPwDM4d7NdgMAAIEEAAAEuhkArv8BYC73bLcbAAAIdDUAPP0DwJxubbgbAAAIJAAAINC7AeD6HwDmdm3L3QAAQCABAACBLgaA638AWMN7m+4GAAACCQAACPRLALj+B4C1XNp2NwAAEEgAAEAgAQAAgV4FgPf/ALCmtxvvBgAAAgkAAAgkAAAg0H8B4P0/AKztfOvdAABAIAEAAIEEAAAEEgAAEOjj6eQXAAEgxcvmuwEAgEACAAACCQAACCQAACCQAACAQAIAAAIJAAAI9MHfAQAAedwAAEAgAQAAgQQAAAQSAAAQSAAAQCABAACBBAAABBIAABBIAABAIAEAAIEEAAAEEgAAEEgAAEAgAQAAgQQAAAQSAAAQSAAAQCABAACBBAAABBIAABBIAABAIAEAAIEEAAAEEgAAEEgAAEAgAQAAgQQAAAQSAAAQSAAAQCABAACBBAAABBIAABBIAABAIAEAAIEEAAAEEgAAEEgAAEAgAQAAgQQAAAQSAAAQSAAAQKBPoz8A2X7/9m30R2ju6+fPu/+zCefzqEfOF5IJABjMyD/m2vmJA3ifAIDODH4/b89aEMBPH748Pf0Y/SHIZQwZSRCQzA0AEOs8QMUAaQQAwEkMkMcfAwR44/dv37yeYnkCAOAdQoCVCQCAG4QAKxIAAHcSAqxEAABsJARYgQAA2EkIMDMBAPAgEcCMBADAAdwGMBsBAHAgEcAsBADAwdwGMAMBANCICKAyAQDQkAigKgEA0JhXAlQkAAA6EQFUIgAAOhIBVCEAADoTAVQgAAAGEAGMJgAABhEBjCQAAAYSAYwiAAAGEwGMIAAAChAB9CYAAIoQAfQkAAAKEQH0IgAAihEB9CAAACCQAAAoyC0ArQkAgKJEAC0JAIDCRACtCAAACCQAAIpzC0ALAgBgAiKAowkAAAgkAAAm4RaAIwkAgImIAI4iAAAgkAAAmIxbAI4gAAAgkAAAmJBbAB4lAAAgkAAAmJRbAB4hAAAgkAAAmJhbAPYSAAAQSAAATM4tAHsIAAAIJAAAFuAWgK0EAAAEEgAAEEgAACzCawC2EAAAEOjT6A8A3O/r58+jP8JNnkJhDh++PD39GP0hyGUsrpth8G/xM+5vhX9uaM8NABS00v+Bv3wXIQC1CAAoZKXhf0sIQC1+CRCKWHn8z6V8T6hOAMBgXz9/jhvFxO/ck1sW7iEAYKD0EUz//jCSAIBBjN8z5wBjCAAYwOi95jygPwEAnRm7y5zLsfweALcIAAAIJACgI0+51zkf6EcAQCfG7T7OCfoQAAAQSABAB55qt3Fe0J4AAIBAAgAa8zS7j3N7nD8KyDUCAAACCQAACCQAACCQAICGvMd+jPODdgQAAAQSAAAQSAAAQCABAACBBAAABBIAABBIAABAIAEAAIEEADTkX8byGOcH7QgAAAgkAAAgkAAAgEACABrzHnsf5/Y4/zIlrhEAABBIAEAHnma3cV7QngAAgEACADrxVHsf5wR9CADoyLhd53ygHwEAAIEEAHTmKfcy53IsfwSQWwQADGDsXnMe0J8AgEGM3jPnAGMIABgoffzSvz+M9Gn0B4B0LyOY9M7W8LeV9M8S+7kBgCJSRjHle0J1bgCgkJVvAww/1CIAoKCVQsDwQ00CAAp7O54zBIHBH2uGf0aoQQDARIwrcBS/BAgAgQQAwCJc/7OFAACAQAIAAAIJAIAFuP5nKwEAAIEEAMDkPP2zhwAAgEACAGBinv7ZSwAAQCABADApT/88QgAAQCABADAhT/88SgAAQCABADAZT/8cQQAAQCABADART/8cRQAATML4cyQBAACBBADABDz9czQBAFCc8acFAQAAgQQAQGGe/mlFAAAUZfxpSQAAFGT8aU0AAEAgAQBQjKd/ehAAAIUYf3oRAABFGH96EgAABRh/ehMAAIMZf0YQAAADGX9GEQAAgxh/RhIAAAMYf0YTAACdGX8qEAAAHRl/qhAAAJ0Yfyr5NPoDAKzO8FORGwCAhow/VQkAgEaMP5V5BQBwMMPPDNwAABzI+DMLNwAABzD8zMYNAMCDjD8zcgMAsJPhZ2YCAGAjw88KBADAnQw/KxEAADcYflYkAADeYfhZmQAAeMPwk0AAAJyMPnkEABDL6JNMAEBjb0fm92/fBn0SDD78JACgM0HQj8GH9wkAGOzaSImD24w87CMAoDDjBrTiXwYEAIEEAAAEEgAAEEgAAEAgAQAAgQQAAAQSAAAQSAAAQCABAACBBAAABBIAABBIAABAIAEAAIEEAAAE8q8DBijut3/+3Pyf+ft/fzX4JKxEAAAUsmfs7/3vEQWcEwAAAx01+Hv+twRBNgEAMEDP4b/1GYRAJgEA0EmF0b/k/HOJgRwCAKCxqsN/iVuBHAIAoJGZhv8tIbA+fw8AQAMzj/+5Vb4Hv3IDAHCgFQfTbcCa3AAAHGTF8T+3+vdLIwAADpAyjinfM4FXAAAPSBxErwTW4AYAYKfE8T+X/v1nJwAAdjB+z5zDvAQAwEZG7zXnMScBALCBsbvMucxHAADcychd53zmIgAA7mDc7uOc5iEAACCQAAC4wVPtNs5rDgIA4Apjto9zq08AALzDiD3G+dUmAAAgkAAAuMDT6zGcY10CAOANo3Us51mTAACAQAIA4Iyn1Tacaz0CAAACCQCAf3lKbcv51iIAACCQAACAQAIA4OR6uhfnXIcAAIBAAgCI56m0L+ddgwAAgEACAAACCQAACCQAgGjeR4/h3McTAAAQSAAAQCABAACBBAAABBIAQCy/iDaW8x9LAABAIAEAAIEEAAAEEgAAEEgAAEAgAQAAgQQAAAQSAAAQSAAAQCABAACBBAAABBIAABBIAACx/v7fX6M/QjTnP5YAAIBAAgAAAgkAAAgkAAAgkAAAovlFtDGc+3gCAAACCQAACCQAACCQAADieR/dl/Ou4dPoD0C2r58/j/4IAJHcAACcPJX24pzrEAAAEEgAAEAgAQDwL9fTbTnfWgQAAAQSAABnPKW24VzrEQAAEEgAALzhafVYzrMmAQBwgdE6hnOsSwAAQCABAPAOT6+PcX61CQCAK4zYPs6tPgEAcIMx28Z5zUEAAEAgAQBwB0+193FO8xAAAHcybtc5n7kIAIANjNxlzmU+AgBgI2P3mvOYkwAA2MHoPXMO8xIAADulj1/695/dhy9PTz9GfwiA2f32z5+jP0I3hn8NbgAADpAyiinfM4EAADjI6uO4+vdL4xUAQAMrvRIw/Gv6+Mf37x9GfwiA1awymqt8D1774/v3D59GfwiAVb2M54y3AYZ/fQIAoLGZQsDw5xAAAJ2cj2ulGDD6mQQAwAAVbgUMfzYBADDQ2xFuGQQGn3MCAKCQSyO9JwqMPbcIAIDijDktfDydnv884OgPAgC097L5/ipgAAgkAAAgkAAAgEACAAAC/RcAfhEQANZ2vvVuAAAgkAAAgEACAAACvQoAvwcAAGt6u/FuAAAgkAAAgEACAAAC/RIAfg8AANZyadvdAABAIAEAAIEuBoDXAACwhvc23Q0AAAQSAAAQ6N0A8BoAAOZ2bcvdAABAIAEAAIGuBoDXAAAwp1sb7gYAAALdDAC3AAAwl3u22w0AAAQSAAAQ6K4A8BoAAOZw72a7AQCAQHcHgFsAAKhty1a7AQCAQJsCwC0AANS0daPdAABAoM0B4BYAAGrZs81uAAAg0K4AcAsAADXs3WQ3AAAQaHcAuAUAgLEe2eKHbgBEAACM8egGewUAAIEeDgC3AADQ1xHb6wYAAAIdEgBuAQCgj6M297AbABEAAG0dubVeAQBAoEMDwC0AALRx9MYefgMgAgDgWC22tckrABEAAMdotal+BwAAAjULALcAAPCYllva9AZABADAPq03tPkrABEAANv02E6/AwAAgboEgFsAALhPr83sdgMgAgDgup5b2fUVgAgAgMt6b2T33wEQAQDw2ohtHPJLgCIAAJ6N2sRhfwpABACQbuQWDv1jgCIAgFSjN3D43wMw+gAAoLcK2zc8AE6nGgcBAD1U2bwSAXA61TkQAGil0taVCYDTqdbBAMCRqm1cqQA4neodEAA8quK2lQuA06nmQQHAHlU3rWQAnE51DwwA7lV5y8oGwOlU++AA4JrqG1Y6AE6n+gcIAG/NsF3lP+C5L09PP0Z/BgB4zwzD/6L8DcC5mQ4WgCyzbdRUAXA6zXfAAKxvxm2a7gOf80oAgJFmHP4X090AnJv54AGY2+wbNHUAnE7z/wAAmM8K2zP9FzjnlQAALa0w/C+mvwE4t9IPBoBaVtuYpb7MObcBABxhteF/seSXOicEANhj1eF/sdQrgEtW/wECcLyE7Vj+C55zGwDANQnD/yLmi54TAgCcSxr+F3Ff+JwQAMiWOPwvYr/4OSEAkCV5+F/EH8A5IQCwNsP/k4N4hxgAWIPRv8yh3CAEAOZk+K9zOBuIAYDajP79HNROYgCgBqO/j0M7gBgA6MvoP84BNiAIAI5l8I/nQDsQBADbGPz2HPAgogDgmbEfw6EXJRCAVRj4mv4PYRj9wA1oA0kAAAAASUVORK5CYII=","b64"]};
const STATIC_CACHE = new Map();
function serveStatic(request) {
  const path = new URL(request.url).pathname;
  const key = STATIC_FILES[path] ? path : '/index.html';
  let body = STATIC_CACHE.get(key);
  if (!body) {
    const [, content, kind] = STATIC_FILES[key];
    body = kind === 'b64' ? Uint8Array.from(atob(content), (c) => c.charCodeAt(0)) : content;
    STATIC_CACHE.set(key, body);
  }
  return new Response(body, { headers: {
    'content-type': STATIC_FILES[key][0],
    'cache-control': key === '/index.html' ? 'no-cache' : 'public, max-age=86400',
    'x-content-type-options': 'nosniff',
  } });
}

// ---------------------------------------------------------------- entry

export default {
  async fetch(request, env)                    {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return serveStatic(request);
    try {
      return await handleApi(request, env, url);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: { code: e.code, message: e.message } }, e.status);
      const message = String((e         )?.message || e);
      // D1 trigger messages (second line of defence) are shown to the user as conflicts
      if (message.includes('LOCKED:')) return json({ error: { code: 'LOCKED', message: message.split('LOCKED:')[1].trim() } }, 409);
      console.error('API_ERROR', url.pathname, message);
      return json({ error: { code: 'INTERNAL', message: 'เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่' } }, 500);
    }
  },
}                               ;

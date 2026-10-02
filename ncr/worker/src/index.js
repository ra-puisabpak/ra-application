// Puisabpak NCR e-Form API (Cloudflare Worker + D1)
// Adds over the previous version: login + roles, enforced workflow, audit trail,
// server-generated NCR numbers, paging/search, and a restricted supplier reply link.

const SESSION_HOURS = 12;
const SUPPLIER_LINK_DAYS = 14;
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

const ROLES = ['QA_MANAGER', 'FSTL', 'QC', 'SUPERVISOR', 'VIEWER'];
const WRITERS = new Set(['QA_MANAGER', 'FSTL', 'QC', 'SUPERVISOR']);
const QA = new Set(['QA_MANAGER', 'FSTL']);

// Fields any writer may set while the NCR is still open.
const NCR_BASE = [
  'source_type', 'source_ref', 'nc_description', 'immediate_action', 'lot_no', 'product_lot_no',
  'found_date', 'found_time', 'hold_location', 'reported_by', 'assignee', 'target_date',
  'defect_qty', 'defect_unit', 'photo_urls', 'process_ref', 'material_code', 'material_name',
  'supplier_id', 'supplier_name', 'parameter_id', 'parameter_name', 'critical_limit',
  'actual_result', 'visual_check', 'allergen', 'shipped_status', 'shipped_qty', 'shipped_customer',
  'root_cause', 'corrective_action', 'preventive_action', 'reply_date', 'related_capa_id',
];
// Fields only QA Manager / Food Safety Team Leader may set.
const NCR_QA = ['severity', 'disposition', 'disposition_reason', 'recall_required',
  'verification_result', 'verification_note', 'status', 'status_reason'];
// Supplier reply links: what the supplier may see and write, per document type.
const FISHBONE = ['fishbone_man', 'fishbone_machine', 'fishbone_material', 'fishbone_method',
  'fishbone_environment', 'fishbone_measurement'];
const SUPPLIER = {
  ncr: {
    table: 'ncr_records', pk: 'ncr_id',
    view: ['ncr_id', 'issue_date', 'found_date', 'source_type', 'severity', 'material_code', 'material_name',
      'supplier_name', 'lot_no', 'product_lot_no', 'nc_description', 'immediate_action', 'defect_qty',
      'defect_unit', 'photo_urls', 'target_date', 'status', 'root_cause', 'corrective_action',
      'preventive_action', 'supplier_reply_by', 'supplier_reply_at'],
    write: ['root_cause', 'corrective_action', 'preventive_action', 'target_date'],
    required: { root_cause: 'สาเหตุของปัญหา', corrective_action: 'การแก้ไข' },
    nextStatus: 'Pending Verification',
    locked: (r) => r.status === 'Closed' || r.status === 'Cancelled',
  },
  capa: {
    table: 'capa_actions', pk: 'capa_id',
    view: ['capa_id', 'source_ref', 'severity_label', 'description', 'detail', 'target_date', 'status',
      'why1', 'why2', 'why3', 'why4', 'why5', 'root_cause_summary', ...FISHBONE, 'containment_action',
      'corrective_action', 'preventive_action', 'responsible_person', 'supplier_reply_by', 'supplier_reply_at'],
    write: ['why1', 'why2', 'why3', 'why4', 'why5', 'root_cause_summary', ...FISHBONE, 'containment_action',
      'corrective_action', 'preventive_action', 'target_date', 'responsible_person'],
    required: { root_cause_summary: 'สรุปสาเหตุ', corrective_action: 'การแก้ไข' },
    nextStatus: 'Verification',
    locked: (r) => String(r.status).startsWith('Closed') || r.status === 'Cancelled',
  },
};

const CAPA_BASE = ['description', 'detail', 'priority', 'severity_label', 'responsible_person',
  'target_date', 'actual_completion', 'why1', 'why2', 'why3', 'why4', 'why5', 'root_cause_summary',
  'root_cause_analysis', 'fishbone_man', 'fishbone_machine', 'fishbone_material', 'fishbone_method',
  'fishbone_environment', 'fishbone_measurement', 'containment_action', 'corrective_action',
  'preventive_action', 'effectiveness_criteria', 'effectiveness_check_date', 'status'];
const CAPA_QA = ['effectiveness_result'];

// ---------- helpers ----------
const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const unhex = (s) => new Uint8Array(s.match(/.{2}/g).map((h) => parseInt(h, 16)));
const sha256 = async (s) => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
const nowIso = () => new Date().toISOString();
const bkk = () => new Date(Date.now() + 7 * 3600e3).toISOString(); // Asia/Bangkok wall clock
const today = () => bkk().slice(0, 10);
const blank = (v) => v === undefined || v === null || String(v).trim() === '';
const nz = (v) => (blank(v) ? null : v);

function randomToken(bytes = 32) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function hashPassword(password, saltHex) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: unhex(saltHex), iterations: 100000 }, key, 256);
  return hex(bits);
}
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
function passwordProblem(pw) {
  if (typeof pw !== 'string' || pw.length < 8) return 'รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร';
  return null;
}

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new HttpError(status, message); };

async function audit(DB, actor, actorType, action, entity, entityId, changes) {
  await DB.prepare(
    'INSERT INTO audit_log (ts,actor,actor_type,action,entity,entity_id,changes) VALUES (?,?,?,?,?,?,?)'
  ).bind(nowIso(), actor, actorType, action, entity, entityId ?? null,
    changes ? JSON.stringify(changes) : null).run();
}
function diff(before, after, fields) {
  const out = {};
  for (const k of fields) {
    const a = before?.[k] ?? null, b = after[k] ?? null;
    if (String(a ?? '') !== String(b ?? '')) out[k] = { from: a, to: b };
  }
  return out;
}

async function nextId(DB, table, col, prefix) {
  const yymm = bkk().slice(2, 4) + bkk().slice(5, 7);
  const like = `${prefix}-${yymm}-%`;
  const row = await DB.prepare(`SELECT ${col} AS id FROM ${table} WHERE ${col} LIKE ? ORDER BY ${col} DESC LIMIT 1`)
    .bind(like).first();
  const n = row ? parseInt(row.id.split('-').pop(), 10) + 1 : 1;
  return `${prefix}-${yymm}-${String(n).padStart(3, '0')}`;
}

// ---------- auth ----------
async function currentUser(req, DB) {
  const h = req.headers.get('Authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  if (!token) fail(401, 'กรุณาเข้าสู่ระบบ');
  const row = await DB.prepare(
    `SELECT u.username, u.display_name, u.role, s.expires_at, s.token_hash
       FROM sessions s JOIN users u ON u.username = s.username
      WHERE s.token_hash = ? AND u.active = 1`
  ).bind(await sha256(token)).first();
  if (!row || row.expires_at < nowIso()) fail(401, 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
  return row;
}
const need = (user, set, msg = 'ไม่มีสิทธิ์ทำรายการนี้') => { if (!set.has(user.role)) fail(403, msg); };

async function createUser(DB, { username, display_name, role, password }, by) {
  username = String(username || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) fail(400, 'ชื่อผู้ใช้ต้องเป็น a-z 0-9 . _ - ยาว 3–32 ตัว');
  if (!ROLES.includes(role)) fail(400, 'บทบาทไม่ถูกต้อง');
  if (blank(display_name)) fail(400, 'กรุณาระบุชื่อที่แสดง');
  const p = passwordProblem(password);
  if (p) fail(400, p);
  if (await DB.prepare('SELECT 1 FROM users WHERE username=?').bind(username).first()) fail(409, 'มีชื่อผู้ใช้นี้แล้ว');
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  await DB.prepare(
    'INSERT INTO users (username,display_name,role,pass_hash,salt,created_by) VALUES (?,?,?,?,?,?)'
  ).bind(username, String(display_name).trim(), role, await hashPassword(password, salt), salt, by).run();
  await audit(DB, by, by === 'setup' ? 'system' : 'user', 'create', 'user', username, { role });
  return username;
}

// ---------- NCR rules ----------
function closeProblems(r) {
  const p = [];
  if (blank(r.immediate_action)) p.push('การแก้ไขเบื้องต้น');
  if (blank(r.disposition)) p.push('การตัดสินใจจัดการสินค้า');
  if (blank(r.disposition_reason)) p.push('เหตุผลของการตัดสินใจ');
  if (r.severity !== 'Minor') {
    if (blank(r.root_cause)) p.push('สาเหตุที่แท้จริง');
    if (blank(r.corrective_action)) p.push('การปฏิบัติการแก้ไข');
  }
  if (r.source_type === 'CCP') {
    if (blank(r.critical_limit)) p.push('ค่าวิกฤต');
    if (blank(r.actual_result)) p.push('ค่าที่วัดได้');
  }
  if (r.shipped_status === 'SHIPPED' && (r.recall_required === null || r.recall_required === undefined)) {
    p.push('ผลการพิจารณาเรียกคืน (สินค้าส่งมอบแล้ว)');
  }
  if (r.verification_result !== 'Effective') p.push('ผลการทวนสอบต้องเป็น Effective');
  return p;
}

// ---------- router ----------
export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const method = req.method;
    const origin = req.headers.get('Origin');
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
    const cors = {
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Setup-Key',
      'Vary': 'Origin',
    };
    if (origin && allowed.includes(origin)) cors['Access-Control-Allow-Origin'] = origin;
    const json = (data, status = 200) => new Response(JSON.stringify(data), {
      status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors },
    });

    if (method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const DB = env.DB;
    if (!DB) return json({ error: 'Database not connected' }, 503);

    try {
      const body = async () => {
        try { const b = await req.json(); if (b && typeof b === 'object') return b; } catch { /* fall through */ }
        fail(400, 'รูปแบบข้อมูลไม่ถูกต้อง');
      };

      if (path === '/api/health') return json({ ok: true, ts: nowIso() });

      // ----- first-time setup: creates the first QA Manager, only while no user exists -----
      if (method === 'POST' && path === '/api/setup') {
        if (blank(env.SETUP_KEY) || !safeEqual(req.headers.get('X-Setup-Key') || '', env.SETUP_KEY)) fail(403, 'Setup key ไม่ถูกต้อง');
        const { n } = await DB.prepare('SELECT COUNT(*) AS n FROM users').first();
        if (n > 0) fail(409, 'ตั้งค่าระบบไปแล้ว');
        const b = await body();
        const username = await createUser(DB, { ...b, role: 'QA_MANAGER' }, 'setup');
        return json({ success: true, username }, 201);
      }

      // ----- login / logout -----
      if (method === 'POST' && path === '/api/login') {
        const b = await body();
        const username = String(b.username || '').trim().toLowerCase();
        const u = await DB.prepare('SELECT * FROM users WHERE username=? AND active=1').bind(username).first();
        const bad = () => fail(401, 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
        if (!u) bad();
        if (u.locked_until && u.locked_until > nowIso()) fail(429, `บัญชีถูกล็อกชั่วคราว ลองใหม่ใน ${LOCK_MINUTES} นาที`);
        const okPw = safeEqual(await hashPassword(String(b.password || ''), u.salt), u.pass_hash);
        if (!okPw) {
          const failed = u.failed_count + 1;
          const lock = failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60e3).toISOString() : null;
          await DB.prepare('UPDATE users SET failed_count=?, locked_until=? WHERE username=?')
            .bind(lock ? 0 : failed, lock, username).run();
          if (lock) await audit(DB, username, 'user', 'lockout', 'user', username, null);
          bad();
        }
        const token = randomToken();
        const expires = new Date(Date.now() + SESSION_HOURS * 3600e3).toISOString();
        await DB.batch([
          DB.prepare('UPDATE users SET failed_count=0, locked_until=NULL WHERE username=?').bind(username),
          DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(nowIso()),
          DB.prepare('INSERT INTO sessions (token_hash,username,expires_at) VALUES (?,?,?)')
            .bind(await sha256(token), username, expires),
        ]);
        await audit(DB, username, 'user', 'login', 'user', username, null);
        return json({ token, expires_at: expires, user: { username, display_name: u.display_name, role: u.role } });
      }

      // ----- supplier link endpoints (the token is the only credential; no login) -----
      const sup = path.match(/^\/api\/supplier\/([A-Za-z0-9_-]{20,})$/);
      if (sup) {
        const link = await DB.prepare('SELECT * FROM supplier_links WHERE token_hash=?').bind(await sha256(sup[1])).first();
        const cfg = link && SUPPLIER[link.entity];
        if (!cfg || link.revoked || link.expires_at < nowIso()) fail(404, 'ลิงก์ไม่ถูกต้องหรือหมดอายุ กรุณาติดต่อฝ่าย QA');
        const doc = await DB.prepare(`SELECT * FROM ${cfg.table} WHERE ${cfg.pk}=?`).bind(link.entity_id).first();
        if (!doc) fail(404, 'ไม่พบเอกสาร');
        const locked = cfg.locked(doc);
        if (method === 'GET') {
          return json({ type: link.entity, ...Object.fromEntries(cfg.view.map((k) => [k, doc[k] ?? null])),
            can_reply: !locked, link_expires_at: link.expires_at });
        }
        if (method === 'POST') {
          if (locked) fail(409, 'เอกสารนี้ปิดแล้ว ไม่สามารถแก้ไขคำตอบได้');
          const b = await body();
          const by = String(b.replied_by || '').trim().slice(0, 120);
          if (by.length < 2) fail(400, 'กรุณาระบุชื่อผู้ตอบ');
          const missing = Object.entries(cfg.required).filter(([k]) => blank(b[k])).map(([, label]) => label);
          if (missing.length) fail(400, `กรุณากรอก: ${missing.join(', ')}`);
          const next = {};
          for (const k of cfg.write) next[k] = blank(b[k]) ? null : String(b[k]).slice(0, 4000);
          const changes = diff(doc, next, cfg.write);
          const ts = nowIso();
          const extra = { supplier_reply_by: by, supplier_reply_at: ts, status: cfg.nextStatus, updated_at: ts, updated_by: `supplier:${by}` };
          if (link.entity === 'ncr') extra.reply_date = today();
          const all = { ...next, ...extra };
          const keys = Object.keys(all);
          await DB.batch([
            DB.prepare(`UPDATE ${cfg.table} SET ${keys.map((k) => `${k}=?`).join(',')} WHERE ${cfg.pk}=?`)
              .bind(...keys.map((k) => all[k]), link.entity_id),
            DB.prepare('UPDATE supplier_links SET last_used_at=? WHERE token_hash=?').bind(ts, link.token_hash),
          ]);
          await audit(DB, by, 'supplier', 'supplier_reply', link.entity, link.entity_id,
            { ...changes, status: { from: doc.status, to: cfg.nextStatus } });
          return json({ success: true });
        }
      }

      // ===== everything below requires a logged-in user =====
      if (!path.startsWith('/api/')) fail(404, 'Not found');
      const user = await currentUser(req, DB);

      if (method === 'GET' && path === '/api/me') {
        return json({ username: user.username, display_name: user.display_name, role: user.role });
      }
      if (method === 'POST' && path === '/api/logout') {
        await DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(user.token_hash).run();
        return json({ success: true });
      }
      if (method === 'POST' && path === '/api/me/password') {
        const b = await body();
        const u = await DB.prepare('SELECT * FROM users WHERE username=?').bind(user.username).first();
        if (!safeEqual(await hashPassword(String(b.current_password || ''), u.salt), u.pass_hash)) fail(403, 'รหัสผ่านปัจจุบันไม่ถูกต้อง');
        const p = passwordProblem(b.new_password);
        if (p) fail(400, p);
        const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
        await DB.batch([
          DB.prepare('UPDATE users SET pass_hash=?, salt=? WHERE username=?').bind(await hashPassword(b.new_password, salt), salt, user.username),
          DB.prepare('DELETE FROM sessions WHERE username=? AND token_hash<>?').bind(user.username, user.token_hash),
        ]);
        await audit(DB, user.username, 'user', 'change_password', 'user', user.username, null);
        return json({ success: true });
      }

      // ----- user administration (QA Manager) -----
      if (path === '/api/users') {
        need(user, new Set(['QA_MANAGER']));
        if (method === 'GET') {
          const { results } = await DB.prepare('SELECT username,display_name,role,active,created_at FROM users ORDER BY username').all();
          return json(results);
        }
        if (method === 'POST') {
          const username = await createUser(DB, await body(), user.username);
          return json({ success: true, username }, 201);
        }
      }
      const um = path.match(/^\/api\/users\/([a-z0-9._-]+)$/);
      if (um && method === 'PATCH') {
        need(user, new Set(['QA_MANAGER']));
        const target = await DB.prepare('SELECT * FROM users WHERE username=?').bind(um[1]).first();
        if (!target) fail(404, 'ไม่พบผู้ใช้');
        const b = await body();
        const sets = [], vals = [], ch = {};
        if ('role' in b) { if (!ROLES.includes(b.role)) fail(400, 'บทบาทไม่ถูกต้อง'); sets.push('role=?'); vals.push(b.role); ch.role = { from: target.role, to: b.role }; }
        if ('display_name' in b && !blank(b.display_name)) { sets.push('display_name=?'); vals.push(String(b.display_name).trim()); }
        if ('active' in b) {
          const act = b.active ? 1 : 0;
          if (!act && target.username === user.username) fail(400, 'ไม่สามารถปิดบัญชีของตนเองได้');
          sets.push('active=?'); vals.push(act); ch.active = { from: target.active, to: act };
        }
        if ('password' in b) {
          const p = passwordProblem(b.password);
          if (p) fail(400, p);
          const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
          sets.push('pass_hash=?', 'salt=?', 'failed_count=0', 'locked_until=NULL');
          vals.push(await hashPassword(b.password, salt), salt); ch.password = 'reset';
        }
        if (!sets.length) fail(400, 'ไม่มีข้อมูลให้แก้ไข');
        if (target.role === 'QA_MANAGER' && ((b.role && b.role !== 'QA_MANAGER') || b.active === false || b.active === 0)) {
          const { n } = await DB.prepare("SELECT COUNT(*) AS n FROM users WHERE role='QA_MANAGER' AND active=1 AND username<>?").bind(target.username).first();
          if (n === 0) fail(400, 'ต้องมี QA Manager ที่ใช้งานได้อย่างน้อย 1 คน');
        }
        vals.push(target.username);
        const stmts = [DB.prepare(`UPDATE users SET ${sets.join(',')} WHERE username=?`).bind(...vals)];
        if ('password' in b || b.active === false || b.active === 0) stmts.push(DB.prepare('DELETE FROM sessions WHERE username=?').bind(target.username));
        await DB.batch(stmts);
        await audit(DB, user.username, 'user', 'update', 'user', target.username, ch);
        return json({ success: true });
      }

      // ----- audit trail (QA only) -----
      if (method === 'GET' && path === '/api/audit') {
        need(user, QA);
        const id = url.searchParams.get('entity_id');
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10) || 100, 500);
        const q = id
          ? DB.prepare('SELECT * FROM audit_log WHERE entity_id=? ORDER BY id DESC LIMIT ?').bind(id, limit)
          : DB.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?').bind(limit);
        return json((await q.all()).results);
      }

      // ----- NCR list -----
      if (method === 'GET' && path === '/api/ncr') {
        const sp = url.searchParams;
        const where = ['1=1'], p = [];
        for (const k of ['status', 'severity', 'source_type']) if (sp.get(k)) { where.push(`${k}=?`); p.push(sp.get(k)); }
        if (sp.get('q')) {
          where.push('(ncr_id LIKE ? OR nc_description LIKE ? OR lot_no LIKE ? OR product_lot_no LIKE ? OR supplier_name LIKE ? OR material_name LIKE ?)');
          const like = `%${sp.get('q')}%`; p.push(like, like, like, like, like, like);
        }
        const limit = Math.min(parseInt(sp.get('limit') || '50', 10) || 50, 200);
        const offset = Math.max(parseInt(sp.get('offset') || '0', 10) || 0, 0);
        const w = where.join(' AND ');
        const { n } = await DB.prepare(`SELECT COUNT(*) AS n FROM ncr_records WHERE ${w}`).bind(...p).first();
        const { results } = await DB.prepare(
          `SELECT * FROM ncr_records WHERE ${w} ORDER BY issue_date DESC, ncr_id DESC LIMIT ? OFFSET ?`
        ).bind(...p, limit, offset).all();
        return json({ total: n, limit, offset, items: results });
      }

      // ----- NCR create -----
      if (method === 'POST' && path === '/api/ncr') {
        need(user, WRITERS);
        const b = await body();
        if (blank(b.nc_description)) fail(400, 'กรุณาระบุรายละเอียดปัญหา');
        const rec = {};
        for (const k of NCR_BASE) rec[k] = nz(b[k]);
        rec.severity = ['Critical', 'Major', 'Minor'].includes(b.severity) ? b.severity : 'Major';
        rec.source_type = rec.source_type || 'IN_PROCESS';
        rec.shipped_status = rec.shipped_status || 'NOT_SHIPPED';
        rec.reported_by = rec.reported_by || user.display_name;
        const cols = [...NCR_BASE, 'severity'];
        for (let attempt = 0; ; attempt++) {
          const ncr_id = await nextId(DB, 'ncr_records', 'ncr_id', 'NCR');
          try {
            await DB.prepare(
              `INSERT INTO ncr_records (ncr_id,issue_date,status,created_by,updated_by,created_at,updated_at,${cols.join(',')})
               VALUES (?,?,?,?,?,?,?,${cols.map(() => '?').join(',')})`
            ).bind(ncr_id, today(), 'Open', user.username, user.username, nowIso(), nowIso(), ...cols.map((k) => rec[k])).run();
            await audit(DB, user.username, 'user', 'create', 'ncr', ncr_id, { severity: rec.severity, source_type: rec.source_type });
            return json({ success: true, ncr_id }, 201);
          } catch (e) {
            if (attempt < 3 && /UNIQUE|PRIMARY/i.test(e.message)) continue;
            if (/CHECK constraint/i.test(e.message)) fail(400, 'ค่าที่เลือกไม่อยู่ในรายการที่กำหนด');
            throw e;
          }
        }
      }

      // ----- supplier links for an NCR or a CAPA -----
      const lm = path.match(/^\/api\/(ncr|capa)\/([^/]+)\/supplier-link(\/revoke)?$/);
      if (lm && method === 'POST') {
        need(user, WRITERS);
        const entity = lm[1], cfg = SUPPLIER[entity], id = decodeURIComponent(lm[2]);
        const doc = await DB.prepare(`SELECT ${cfg.pk}, status FROM ${cfg.table} WHERE ${cfg.pk}=?`).bind(id).first();
        if (!doc) fail(404, 'ไม่พบเอกสาร');
        const revoke = DB.prepare('UPDATE supplier_links SET revoked=1 WHERE entity=? AND entity_id=?').bind(entity, id);
        if (lm[3]) {
          await revoke.run();
          await audit(DB, user.username, 'user', 'revoke_supplier_link', entity, id, null);
          return json({ success: true });
        }
        if (cfg.locked(doc)) fail(409, 'เอกสารปิดแล้ว ไม่สามารถสร้างลิงก์ได้');
        const token = randomToken();
        const expires = new Date(Date.now() + SUPPLIER_LINK_DAYS * 86400e3).toISOString();
        await DB.batch([
          revoke, // only one live link per document
          DB.prepare('INSERT INTO supplier_links (token_hash,entity,entity_id,created_by,expires_at) VALUES (?,?,?,?,?)')
            .bind(await sha256(token), entity, id, user.username, expires),
        ]);
        await audit(DB, user.username, 'user', 'create_supplier_link', entity, id, { expires_at: expires });
        return json({ token, expires_at: expires }, 201);
      }

      // ----- NCR read / update -----
      const nm = path.match(/^\/api\/ncr\/([^/]+)$/);
      if (nm) {
        const id = decodeURIComponent(nm[1]);
        const row = await DB.prepare('SELECT * FROM ncr_records WHERE ncr_id=?').bind(id).first();
        if (!row) fail(404, 'ไม่พบ NCR');
        if (method === 'GET') return json(row);
        if (method === 'PATCH') {
          need(user, WRITERS);
          const b = await body();
          for (const k of ['ncr_id', 'issue_date', 'created_by', 'created_at']) {
            if (k in b && String(b[k]) !== String(row[k])) fail(400, `ไม่อนุญาตให้แก้ไข ${k}`);
          }
          const locked = row.status === 'Closed' || row.status === 'Cancelled';
          if (locked) {
            // The only change allowed on a closed record is a reopen by the QA Manager, with a reason.
            if (user.role !== 'QA_MANAGER' || b.status !== 'Open' || blank(b.status_reason)) {
              fail(409, 'NCR ปิดแล้ว แก้ไขไม่ได้ (QA Manager เปิดใหม่ได้โดยระบุเหตุผล)');
            }
            await DB.prepare(
              `UPDATE ncr_records SET status='Open', status_reason=?, closed_date=NULL, closed_by=NULL, days_open=NULL,
                 verification_result='Pending', verified_by=NULL, verified_at=NULL, updated_at=?, updated_by=? WHERE ncr_id=?`
            ).bind(String(b.status_reason), nowIso(), user.username, id).run();
            await audit(DB, user.username, 'user', 'reopen', 'ncr', id, { status: { from: row.status, to: 'Open' }, reason: b.status_reason });
            return json({ success: true, ncr_id: id });
          }

          const next = {};
          for (const k of NCR_BASE) if (k in b) next[k] = nz(b[k]);
          for (const k of NCR_QA) {
            if (!(k in b)) continue;
            if (String(b[k] ?? '') === String(row[k] ?? '')) continue; // unchanged values are fine from anyone
            if (!QA.has(user.role)) fail(403, `เฉพาะ QA Manager / FSTL เท่านั้นที่แก้ไข ${k} ได้`);
            next[k] = k === 'recall_required' ? (b[k] === null || b[k] === '' ? null : (b[k] ? 1 : 0)) : nz(b[k]);
          }
          if (!Object.keys(next).length) fail(400, 'ไม่มีข้อมูลให้แก้ไข');
          if ('nc_description' in next && blank(next.nc_description)) fail(400, 'รายละเอียดปัญหาห้ามว่าง');

          const ts = nowIso();
          if ('disposition' in next) { next.dispositioned_by = user.username; next.dispositioned_at = ts; }
          if ('verification_result' in next) {
            next.verified_by = next.verification_result === 'Pending' ? null : user.username;
            next.verified_at = next.verification_result === 'Pending' ? null : ts;
          }
          const merged = { ...row, ...next };
          if (next.status === 'Closed') {
            if (user.role !== 'QA_MANAGER') fail(403, 'เฉพาะ QA Manager เท่านั้นที่ปิด NCR ได้');
            const p = closeProblems(merged);
            if (p.length) fail(422, `ยังปิด NCR ไม่ได้ ข้อมูลไม่ครบ: ${p.join(', ')}`);
            next.closed_by = user.username;
            next.closed_date = today();
            next.days_open = Math.max(0, Math.round((Date.parse(next.closed_date) - Date.parse(row.issue_date)) / 86400e3));
          }
          if (next.status === 'Cancelled' && blank(merged.status_reason)) fail(422, 'กรุณาระบุเหตุผลที่ยกเลิก');

          const keys = Object.keys(next);
          const changes = diff(row, next, keys);
          if (!Object.keys(changes).length) return json({ success: true, ncr_id: id, unchanged: true });
          const stmts = [DB.prepare(
            `UPDATE ncr_records SET ${keys.map((k) => `${k}=?`).join(',')}, updated_at=?, updated_by=? WHERE ncr_id=?`
          ).bind(...keys.map((k) => next[k]), ts, user.username, id)];
          if (next.status === 'Closed' || next.status === 'Cancelled') {
            stmts.push(DB.prepare("UPDATE supplier_links SET revoked=1 WHERE entity='ncr' AND entity_id=?").bind(id));
          }
          try { await DB.batch(stmts); } catch (e) {
            if (/CHECK constraint/i.test(e.message)) fail(400, 'ค่าที่เลือกไม่อยู่ในรายการที่กำหนด');
            throw e;
          }
          await audit(DB, user.username, 'user', next.status === 'Closed' ? 'close' : 'update', 'ncr', id, changes);
          return json({ success: true, ncr_id: id });
        }
      }

      // ----- CAPA -----
      if (method === 'GET' && path === '/api/capa') {
        const where = ['1=1'], p = [];
        if (url.searchParams.get('ncr_id')) { where.push("source_ref=? AND source='NCR'"); p.push(url.searchParams.get('ncr_id')); }
        if (url.searchParams.get('status')) { where.push('status=?'); p.push(url.searchParams.get('status')); }
        const { results } = await DB.prepare(`SELECT * FROM capa_actions WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT 200`).bind(...p).all();
        return json(results);
      }
      if (method === 'POST' && path === '/api/capa') {
        need(user, WRITERS);
        const b = await body();
        if (blank(b.description)) fail(400, 'กรุณาระบุรายละเอียด CAPA');
        const cols = CAPA_BASE.filter((k) => k !== 'status');
        const capa_id = await nextId(DB, 'capa_actions', 'capa_id', 'CAPA');
        try {
          await DB.prepare(
            `INSERT INTO capa_actions (capa_id,source,source_ref,status,created_by,updated_by,created_at,updated_at,${cols.join(',')})
             VALUES (?,?,?,?,?,?,?,?,${cols.map(() => '?').join(',')})`
          ).bind(capa_id, nz(b.source) || 'NCR', nz(b.source_ref), 'Open', user.username, user.username, nowIso(), nowIso(),
            ...cols.map((k) => (k === 'priority' ? (nz(b[k]) || 'MEDIUM') : nz(b[k])))).run();
        } catch (e) {
          if (/CHECK constraint/i.test(e.message)) fail(400, 'ค่าที่เลือกไม่อยู่ในรายการที่กำหนด');
          throw e;
        }
        await audit(DB, user.username, 'user', 'create', 'capa', capa_id, { source_ref: nz(b.source_ref) });
        return json({ success: true, capa_id }, 201);
      }
      const cm = path.match(/^\/api\/capa\/([^/]+)$/);
      if (cm) {
        const id = decodeURIComponent(cm[1]);
        const row = await DB.prepare('SELECT * FROM capa_actions WHERE capa_id=?').bind(id).first();
        if (!row) fail(404, 'ไม่พบ CAPA');
        if (method === 'GET') return json(row);
        if (method === 'PATCH') {
          need(user, WRITERS);
          if (String(row.status).startsWith('Closed') || row.status === 'Cancelled') fail(409, 'CAPA ปิดแล้ว แก้ไขไม่ได้');
          const b = await body();
          const next = {};
          for (const k of CAPA_BASE) if (k in b) next[k] = nz(b[k]);
          for (const k of CAPA_QA) if (k in b && String(b[k] ?? '') !== String(row[k] ?? '')) {
            if (!QA.has(user.role)) fail(403, `เฉพาะ QA Manager / FSTL เท่านั้นที่แก้ไข ${k} ได้`);
            next[k] = nz(b[k]);
          }
          if (!Object.keys(next).length) fail(400, 'ไม่มีข้อมูลให้แก้ไข');
          const ts = nowIso();
          if ('effectiveness_result' in next && next.effectiveness_result && next.effectiveness_result !== 'Pending') {
            next.verified_by = user.username; next.verified_date = today();
          }
          const closing = typeof next.status === 'string' && next.status.startsWith('Closed') && next.status !== row.status;
          if (closing) {
            if (user.role !== 'QA_MANAGER') fail(403, 'เฉพาะ QA Manager เท่านั้นที่ปิด CAPA ได้');
            const m = { ...row, ...next };
            const miss = [];
            if (blank(m.root_cause_summary) && blank(m.root_cause_analysis)) miss.push('สาเหตุที่แท้จริง');
            if (blank(m.corrective_action)) miss.push('การปฏิบัติการแก้ไข');
            if (blank(m.effectiveness_result) || m.effectiveness_result === 'Pending') miss.push('ผลการทวนสอบประสิทธิผล');
            if (miss.length) fail(422, `ยังปิด CAPA ไม่ได้ ข้อมูลไม่ครบ: ${miss.join(', ')}`);
            next.closed_by = user.username; next.closed_date = today();
            next.approved_by = user.username; next.approved_date = today();
          }
          const keys = Object.keys(next);
          const changes = diff(row, next, keys);
          if (!Object.keys(changes).length) return json({ success: true, unchanged: true });
          try {
            const stmts = [DB.prepare(`UPDATE capa_actions SET ${keys.map((k) => `${k}=?`).join(',')}, updated_at=?, updated_by=? WHERE capa_id=?`)
              .bind(...keys.map((k) => next[k]), ts, user.username, id)];
            if (closing || next.status === 'Cancelled') {
              stmts.push(DB.prepare("UPDATE supplier_links SET revoked=1 WHERE entity='capa' AND entity_id=?").bind(id));
            }
            await DB.batch(stmts);
          } catch (e) {
            if (/CHECK constraint/i.test(e.message)) fail(400, 'ค่าที่เลือกไม่อยู่ในรายการที่กำหนด');
            throw e;
          }
          await audit(DB, user.username, 'user', closing ? 'close' : 'update', 'capa', id, changes);
          return json({ success: true });
        }
      }

      fail(404, `Not found: ${method} ${path}`);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(`[ERR] ${method} ${path}:`, e.message);
      return json({ error: 'เกิดข้อผิดพลาดภายในระบบ' }, 500);
    }
  },
};

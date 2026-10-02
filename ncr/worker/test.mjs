// Local end-to-end test of the Worker against an in-memory SQLite standing in for D1.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker from './src/index.js';

const db = new DatabaseSync(':memory:');
db.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));

const stmt = (sql, args = []) => ({
  bind: (...a) => stmt(sql, a),
  first: async () => db.prepare(sql).get(...args) ?? null,
  all: async () => ({ results: db.prepare(sql).all(...args) }),
  run: async () => { db.prepare(sql).run(...args); return { success: true }; },
});
const DB = { prepare: (sql) => stmt(sql), batch: async (list) => { for (const s of list) await s.run(); } };
const env = { DB, SETUP_KEY: 'setup-secret', ALLOWED_ORIGINS: 'https://app.example' };

let pass = 0, failed = 0;
const call = async (method, path, { token, body, headers = {} } = {}) => {
  const res = await worker.fetch(new Request('https://api.example' + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  }), env);
  const text = await res.text();
  let j; try { j = JSON.parse(text); } catch { j = text; }
  return { status: res.status, j, res };
};
const check = (name, cond, extra) => {
  if (cond) { pass++; console.log('  ok  ', name); }
  else { failed++; console.log('  FAIL', name, extra !== undefined ? JSON.stringify(extra) : ''); }
};

let r;
r = await call('GET', '/api/ncr');
check('list without login is refused', r.status === 401, r);
r = await call('POST', '/api/ncr', { body: { nc_description: 'x' } });
check('create without login is refused', r.status === 401, r);
r = await call('PATCH', '/api/ncr/NCR-0000-001', { body: { status: 'Closed' } });
check('patch without login is refused', r.status === 401, r);

r = await call('POST', '/api/setup', { body: { username: 'qam', display_name: 'QA Manager', password: 'password1' }, headers: { 'X-Setup-Key': 'wrong' } });
check('setup with wrong key is refused', r.status === 403, r);
r = await call('POST', '/api/setup', { body: { username: 'qam', display_name: 'QA Manager', password: 'password1' }, headers: { 'X-Setup-Key': 'setup-secret' } });
check('setup creates first QA manager', r.status === 201, r);
r = await call('POST', '/api/setup', { body: { username: 'qa2', display_name: 'X', password: 'password1' }, headers: { 'X-Setup-Key': 'setup-secret' } });
check('setup cannot run twice', r.status === 409, r);

r = await call('POST', '/api/login', { body: { username: 'qam', password: 'nope' } });
check('wrong password is refused', r.status === 401, r);
r = await call('POST', '/api/login', { body: { username: 'qam', password: 'password1' } });
check('login works', r.status === 200 && r.j.token, r);
const qa = r.j.token;

r = await call('POST', '/api/users', { token: qa, body: { username: 'qc1', display_name: 'QC One', role: 'QC', password: 'password2' } });
check('QA manager creates QC user', r.status === 201, r);
r = await call('POST', '/api/login', { body: { username: 'qc1', password: 'password2' } });
const qc = r.j.token;
r = await call('POST', '/api/users', { token: qc, body: { username: 'x1', display_name: 'X', role: 'QA_MANAGER', password: 'password3' } });
check('QC cannot create users', r.status === 403, r);
r = await call('GET', '/api/audit', { token: qc });
check('QC cannot read audit log', r.status === 403, r);

r = await call('POST', '/api/ncr', { token: qc, body: { nc_description: 'พบเศษพลาสติกในพริกแห้ง', source_type: 'RM_RECEIVING', severity: 'Major', supplier_name: 'ABC Supply', material_name: 'พริกแห้ง', lot_no: 'L001', defect_qty: 20, defect_unit: 'kg', ncr_id: 'HACK-1' } });
check('QC creates NCR with server-made number', r.status === 201 && /^NCR-\d{4}-001$/.test(r.j.ncr_id), r);
const id = r.j.ncr_id;
r = await call('POST', '/api/ncr', { token: qc, body: { nc_description: 'second' } });
check('second NCR gets next number', r.status === 201 && r.j.ncr_id.endsWith('-002'), r);
r = await call('POST', '/api/ncr', { token: qc, body: { nc_description: 'bad', source_type: 'NOPE' } });
check('invalid source type is refused', r.status === 400, r);

r = await call('PATCH', `/api/ncr/${id}`, { token: qc, body: { issue_date: '2020-01-01' } });
check('issue date cannot be changed', r.status === 400, r);
r = await call('PATCH', `/api/ncr/${id}`, { token: qc, body: { disposition: 'RELEASE' } });
check('QC cannot set disposition', r.status === 403, r);
r = await call('PATCH', `/api/ncr/${id}`, { token: qc, body: { status: 'Closed' } });
check('QC cannot close', r.status === 403, r);
r = await call('PATCH', `/api/ncr/${id}`, { token: qa, body: { status: 'Closed' } });
check('QA cannot close incomplete NCR', r.status === 422, r);
r = await call('PATCH', `/api/ncr/${id}`, { token: qc, body: { immediate_action: 'กักทั้ง Lot', hold_location: 'HOLD-1' } });
check('QC updates base fields', r.status === 200, r);

// supplier link
r = await call('POST', `/api/ncr/${id}/supplier-link`, { token: qc });
check('supplier link created', r.status === 201 && r.j.token.length > 40, r);
const tok1 = r.j.token;
r = await call('POST', `/api/ncr/${id}/supplier-link`, { token: qc });
const tok = r.j.token;
r = await call('GET', `/api/supplier/${tok1}`);
check('older link is revoked when a new one is made', r.status === 404, r);
r = await call('GET', `/api/supplier/${tok}`);
check('supplier sees limited fields only', r.status === 200 && r.j.ncr_id === id && r.j.type === 'ncr' && !('hold_location' in r.j) && !('disposition' in r.j) && !('created_by' in r.j) && !('assignee' in r.j), r);
r = await call('GET', '/api/supplier/' + 'A'.repeat(43));
check('unknown supplier token is refused', r.status === 404, r);
r = await call('GET', '/api/ncr', { token: tok });
check('supplier token is not a login', r.status === 401, r);
r = await call('POST', `/api/supplier/${tok}`, { body: { root_cause: 'x', corrective_action: 'y' } });
check('supplier reply needs a name', r.status === 400, r);
r = await call('POST', `/api/supplier/${tok}`, { body: { root_cause: 'ตะแกรงคัดแยกชำรุด', corrective_action: 'เปลี่ยนตะแกรง', preventive_action: 'ตรวจทุกกะ', replied_by: 'สมชาย QA Supplier', status: 'Closed', severity: 'Minor', disposition: 'RELEASE' } });
check('supplier reply accepted', r.status === 200, r);
r = await call('GET', `/api/ncr/${id}`, { token: qa });
check('reply stored, status moved, extra fields ignored', r.j.root_cause === 'ตะแกรงคัดแยกชำรุด' && r.j.status === 'Pending Verification' && r.j.severity === 'Major' && r.j.disposition === null && r.j.supplier_reply_by === 'สมชาย QA Supplier', r.j);

// close
r = await call('PATCH', `/api/ncr/${id}`, { token: qa, body: { disposition: 'RETURN_SUPPLIER', disposition_reason: 'ไม่ผ่านข้อกำหนด', verification_result: 'Effective', verified_by: 'someone-else', closed_by: 'someone-else' } });
check('QA sets disposition and verification', r.status === 200, r);
r = await call('PATCH', `/api/ncr/${id}`, { token: qa, body: { status: 'Closed', closed_date: '1999-01-01' } });
check('QA closes complete NCR', r.status === 200, r);
r = await call('GET', `/api/ncr/${id}`, { token: qa });
check('server stamps who verified and closed', r.j.verified_by === 'qam' && r.j.closed_by === 'qam' && r.j.dispositioned_by === 'qam' && r.j.closed_date !== '1999-01-01' && r.j.days_open === 0, r.j);
r = await call('PATCH', `/api/ncr/${id}`, { token: qc, body: { nc_description: 'changed' } });
check('closed NCR is locked', r.status === 409, r);
r = await call('POST', `/api/supplier/${tok}`, { body: { root_cause: 'a', corrective_action: 'b', replied_by: 'zz' } });
check('supplier link dies when NCR closes', r.status === 404, r);
r = await call('PATCH', `/api/ncr/${id}`, { token: qa, body: { status: 'Open' } });
check('reopen needs a reason', r.status === 409, r);
r = await call('PATCH', `/api/ncr/${id}`, { token: qa, body: { status: 'Open', status_reason: 'พบปัญหาซ้ำ' } });
check('QA manager reopens with reason', r.status === 200, r);

// shipped product needs a recall decision, CCP needs limits
r = await call('POST', '/api/ncr', { token: qc, body: { nc_description: 'CCP เบี่ยงเบน', source_type: 'CCP', severity: 'Critical', shipped_status: 'SHIPPED', immediate_action: 'กัก' } });
const id2 = r.j.ncr_id;
await call('PATCH', `/api/ncr/${id2}`, { token: qa, body: { severity: 'Critical', disposition: 'DESTROY', disposition_reason: 'ไม่ปลอดภัย', root_cause: 'rc', corrective_action: 'ca', verification_result: 'Effective' } });
r = await call('PATCH', `/api/ncr/${id2}`, { token: qa, body: { status: 'Closed' } });
check('CCP + shipped NCR needs limits and recall decision', r.status === 422 && r.j.error.includes('ค่าวิกฤต') && r.j.error.includes('เรียกคืน'), r);

// CAPA
r = await call('POST', '/api/capa', { token: qc, body: { description: 'CAPA for ' + id, source_ref: id } });
check('CAPA created', r.status === 201 && /^CAPA-\d{4}-001$/.test(r.j.capa_id), r);
const capa = r.j.capa_id;
r = await call('PATCH', `/api/capa/${capa}`, { token: qa, body: { status: 'Closed Effective' } });
check('CAPA cannot close incomplete', r.status === 422, r);
r = await call('PATCH', `/api/capa/${capa}`, { token: qc, body: { effectiveness_result: 'Effective' } });
check('QC cannot verify CAPA', r.status === 403, r);
r = await call('POST', `/api/capa/${capa}/supplier-link`, { token: qc });
check('CAPA supplier link created', r.status === 201, r);
const ctok = r.j.token;
r = await call('GET', `/api/supplier/${ctok}`);
check('CAPA link shows the CAPA only', r.status === 200 && r.j.type === 'capa' && r.j.capa_id === capa && !('created_by' in r.j), r);
r = await call('POST', `/api/supplier/${ctok}`, { body: { root_cause_summary: 'สรุปสาเหตุ', why1: 'w1', corrective_action: 'ca', replied_by: 'Supplier B', status: 'Closed Effective', effectiveness_result: 'Effective' } });
check('CAPA supplier reply accepted', r.status === 200, r);
r = await call('GET', `/api/capa/${capa}`, { token: qa });
check('CAPA reply stored, cannot self-verify', r.j.status === 'Verification' && r.j.why1 === 'w1' && r.j.effectiveness_result === null && r.j.supplier_reply_by === 'Supplier B', r.j);
r = await call('POST', `/api/capa/${capa}/supplier-link/revoke`, { token: qc });
r = await call('GET', `/api/supplier/${ctok}`);
check('revoked CAPA link stops working', r.status === 404, r);
r = await call('PATCH', `/api/capa/${capa}`, { token: qa, body: { effectiveness_result: 'Effective' } });
r = await call('PATCH', `/api/capa/${capa}`, { token: qa, body: { status: 'Closed Effective' } });
check('QA closes complete CAPA', r.status === 200, r);
r = await call('GET', `/api/capa/${capa}`, { token: qa });
check('server stamps CAPA verifier and closer', r.j.verified_by === 'qam' && r.j.closed_by === 'qam' && r.j.approved_by === 'qam', r.j);

// audit, paging, lockout, CORS, logout
r = await call('GET', `/api/audit?entity_id=${id}`, { token: qa });
check('audit trail has full history', r.status === 200 && r.j.some((a) => a.action === 'supplier_reply' && a.actor_type === 'supplier') && r.j.some((a) => a.action === 'close') && r.j.some((a) => a.action === 'reopen'), r.j.map((a) => a.action));
r = await call('GET', '/api/ncr?limit=1&q=CCP', { token: qc });
check('search and paging', r.status === 200 && r.j.total === 1 && r.j.items.length === 1, r.j);
for (let i = 0; i < 5; i++) await call('POST', '/api/login', { body: { username: 'qc1', password: 'bad' } });
r = await call('POST', '/api/login', { body: { username: 'qc1', password: 'password2' } });
check('account locks after 5 bad passwords', r.status === 429, r);
r = await call('GET', '/api/health', { headers: { Origin: 'https://evil.example' } });
check('unknown origin gets no CORS header', !r.res.headers.get('Access-Control-Allow-Origin'));
r = await call('GET', '/api/health', { headers: { Origin: 'https://app.example' } });
check('allowed origin gets CORS header', r.res.headers.get('Access-Control-Allow-Origin') === 'https://app.example');
r = await call('DELETE', `/api/ncr/${id}`, { token: qa });
check('no delete route', r.status === 404, r);
await call('POST', '/api/logout', { token: qa });
r = await call('GET', '/api/me', { token: qa });
check('logout ends the session', r.status === 401, r);

console.log(`\n${pass} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

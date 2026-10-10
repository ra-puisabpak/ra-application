// One-off: attach the product photos the RA user sent in chat to the product records.
// Idempotent: a photo already attached (same SHA-256) to the same product is skipped.
import fs from 'node:fs';
const { CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: account } = process.env;
const db = '19d30663-7eab-4ba6-aacb-ec8013566665';
const USER = { id: 'bootstrap-ra', email: 'ra@puisabpak.local' };
const REASON = 'นำเข้ารูปสินค้าที่ผู้ใช้ส่งในแชต (ดำเนินการโดย Claude ตามคำขอ)';
async function q(sql, params = []) {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${db}/query`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ sql, params }),
  });
  const j = await r.json();
  if (!j.success) throw new Error(JSON.stringify(j.errors));
  return j.result[0].results;
}
const items = JSON.parse(fs.readFileSync(new URL('./import.json', import.meta.url)));
for (const x of items) {
  const prod = await q("SELECT id FROM reg_records WHERE collection = 'regProducts' AND id = ?", [x.recordId]);
  if (!prod.length) { console.log('SKIP no product', x.recordId); continue; }
  let id = (await q("SELECT id FROM reg_attachments WHERE collection = 'regProducts' AND record_id = ? AND sha256 = ? AND voided_at IS NULL", [x.recordId, x.sha256]))[0]?.id;
  if (!id) {
    id = (await q(
      "INSERT INTO reg_attachments (collection, record_id, file_name, mime, size, sha256, caption, data, thumb, created_by) VALUES ('regProducts', ?, ?, 'image/jpeg', ?, ?, 'รูปสินค้า', ?, ?, ?) RETURNING id",
      [x.recordId, `รูปสินค้า-${x.recordId}.jpg`, x.size, x.sha256, x.data, x.thumb, USER.id]))[0].id;
    await q("INSERT INTO reg_audit (user_id, user_email, action, collection, record_id, after_json, reason) VALUES (?, ?, 'ATTACH', 'regProducts', ?, ?, ?)",
      [USER.id, USER.email, x.recordId, JSON.stringify({ attachment: id, fileName: `รูปสินค้า-${x.recordId}.jpg`, size: x.size, sha256: x.sha256, caption: 'รูปสินค้า' }), REASON]);
  }
  await q("INSERT INTO reg_attachment_covers (collection, record_id, attachment_id, set_by) VALUES ('regProducts', ?, ?, ?)", [x.recordId, id, USER.id]);
  await q("INSERT INTO reg_audit (user_id, user_email, action, collection, record_id, after_json, reason) VALUES (?, ?, 'SET_COVER', 'regProducts', ?, ?, ?)",
    [USER.id, USER.email, x.recordId, JSON.stringify({ attachment: id }), REASON]);
  console.log('OK', x.recordId, 'attachment', id);
}

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


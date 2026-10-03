/* -------------------------------------------------------------- รูปแนบ (image attachments) */
let ATT = {}, ATT_IDS = {}, _att = null;
const ATT_TITLE = { regProducts:'ผลิตภัณฑ์', formulaControl:'สูตร', labelChecklist:'ฉลาก', rawMaterials:'วัตถุดิบ', kpiResults:'ผล KPI' };
async function loadAttCounts(){
  try {
    const r = await api('GET','/api/attachments/counts'); ATT = r.counts || {}; ATT_IDS = r.ids || {};
    if (r.needThumb && r.needThumb.length && kpiCanRecord()) attBackfillThumbs(r.needThumb.slice(0, 8));
  } catch { /* photos are optional: the rest of the app still works */ }
}
/* thumbnails shown directly on cards and rows: tap one to see it full size, "+n" opens the full list */
function attStrip(collection, id, size, max){
  const ids = ATT_IDS[collection + '|' + id] || []; if (!ids.length) return '';
  const show = ids.length > max ? ids.slice(0, max - 1) : ids, more = ids.length - show.length;
  const box = `flex:0 0 auto;width:${size}px;height:${size}px;border-radius:8px;border:1px solid #e2e8f0;overflow:hidden;padding:0;background:#f1f5f9`;
  return `<div style="display:flex;flex-wrap:wrap;gap:6px;flex-basis:100%">${show.map(a =>
    `<button type="button" style="${box}" onclick="event.stopPropagation();viewAttachment(${a},'${collection}','${esc(id)}')" aria-label="ดูรูปแนบ"><img src="/api/attachments/${a}/thumb" alt="" loading="lazy" style="display:block;width:100%;height:100%;object-fit:cover"></button>`).join('')}${more ?
    `<button type="button" style="${box};font-size:13px;font-weight:700;color:#475569" onclick="event.stopPropagation();openAttachments('${collection}','${esc(id)}')" aria-label="ดูรูปทั้งหมด ${ids.length} รูป">+${more}</button>` : ''}</div>`;
}
/* photos stored before previews existed: make the preview once, in the background */
async function attBackfillThumbs(ids){
  for (const id of ids) {
    try {
      const blob = await (await fetch(`/api/attachments/${id}/file`, { credentials:'same-origin' })).blob();
      await api('POST', `/api/attachments/${id}/thumb`, { thumbBase64: await attBase64(await attThumb(blob)) });
    } catch { /* try again next time */ }
  }
}
function attBtn(collection, id, cls){
  const n = ATT[collection + '|' + id] || 0;
  return `<button class="${cls}" onclick="openAttachments('${collection}','${esc(id)}')">📎 รูป${n ? ' (' + n + ')' : ''}</button>`;
}
async function openAttachments(collection, id){
  _att = { collection, id };
  let r;
  try { r = await api('GET', `/api/attachments?collection=${collection}&id=${encodeURIComponent(id)}`); }
  catch (e) { toast(e.message,'error'); return; }
  const live = r.rows.filter(a => !a.voided_at), dead = r.rows.filter(a => a.voided_at);
  const src = a => `/api/attachments/${a.id}/file`;
  const kb = a => Math.max(1, Math.round(a.size / 1024)).toLocaleString('th-TH') + ' KB';
  document.getElementById('modalRoot').innerHTML = `
    <div class="fixed inset-0 bg-slate-900/50 z-40 flex items-start justify-center overflow-y-auto p-2 sm:p-4" onclick="if(event.target===this)closeAttachments()">
      <div class="card w-full max-w-3xl my-4 shadow-2xl border-0">
        <div class="px-5 py-4 border-b flex justify-between gap-3"><div><div class="font-bold">รูปแนบ ${esc(ATT_TITLE[collection])} ${esc(id)}</div><div class="text-[11.5px] text-ink-mute">${live.length} จาก ${r.max} รูป · รูปที่แนบแล้วแก้หรือลบไม่ได้ ยกเลิกได้พร้อมเหตุผล</div></div><button class="text-2xl text-slate-400" onclick="closeAttachments()" aria-label="ปิด">&times;</button></div>
        <div class="p-5 space-y-4">
          ${kpiCanRecord() ? `<div class="space-y-2" style="border:1px dashed #d7dcdf;border-radius:12px;padding:12px">
            <label class="label" for="attFile">เลือกรูปหรือถ่ายภาพ (เลือกได้หลายรูป)</label>
            <input id="attFile" type="file" accept="image/*" multiple class="input">
            <input id="attCaption" class="input" maxlength="200" placeholder="คำอธิบายรูป เช่น ฉลากด้านหลัง, COA lot 123 (ไม่บังคับ)">
            <div class="flex items-center justify-between gap-2"><span id="attMsg" class="text-[12px] text-ink-mute">ระบบย่อรูปให้อัตโนมัติก่อนอัปโหลด</span><button id="attSave" class="btn btn-primary" onclick="uploadAttachments()">อัปโหลด</button></div>
          </div>` : ''}
          ${live.length ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px">
            ${live.map(a => `<figure style="margin:0;min-width:0">
              <button type="button" onclick="viewAttachment(${a.id},'${collection}','${esc(id)}')" style="display:block;width:100%;padding:0;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;background:#f8fafc" aria-label="ดูรูปขนาดเต็ม">
                <img src="/api/attachments/${a.id}/thumb" alt="${esc(a.caption || a.file_name)}" loading="lazy" style="display:block;width:100%;height:130px;object-fit:cover"></button>
              <figcaption class="text-[12px] mt-1" style="overflow-wrap:anywhere">${a.caption ? `<div class="font-semibold">${esc(a.caption)}</div>` : ''}
                <div class="text-ink-mute">${esc(a.created_by_name || '-')} · ${fmtDate(a.created_at)} · ${kb(a)}</div>
                ${a.created_by === ME.id || ME.canApprove ? `<button class="text-brand text-xs font-semibold" onclick="voidAttachment(${a.id})">ยกเลิกรูปนี้</button>` : ''}</figcaption>
            </figure>`).join('')}</div>` : '<div class="text-sm text-ink-mute text-center py-4">ยังไม่มีรูปแนบ</div>'}
          ${dead.length ? `<details class="text-[12.5px]"><summary class="text-ink-mute" style="cursor:pointer">รูปที่ยกเลิกแล้ว (${dead.length})</summary>
            ${dead.map(a => `<div class="py-1 border-b border-slate-100"><button class="text-brand font-semibold" onclick="viewAttachment(${a.id})">${esc(a.caption || a.file_name)}</button> · ${esc(a.created_by_name || '-')} · ${fmtDate(a.created_at)}<div class="text-red-700">ยกเลิก: ${esc(a.void_reason)} (${esc(a.voided_by_name || '-')})</div></div>`).join('')}</details>` : ''}
        </div>
      </div></div>`;
}
function closeAttachments(){
  const a = _att; _att = null; closeModal();
  if (a && a.collection === 'kpiResults' && _kpiKey && currentPage === 'kpi') { renderKpi().then(() => openKpi(_kpiKey)); return; }
  if (PAGES[currentPage] && currentPage !== 'auditLog' && currentPage !== 'users') PAGES[currentPage].render();
}
function viewAttachment(id, collection, recordId){
  const ids = (collection && ATT_IDS[collection + '|' + recordId]) || [];
  let i = Math.max(0, ids.indexOf(id));
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;inset:0;z-index:60;background:rgba(0,0,0,.92);display:flex;align-items:center;justify-content:center;overflow:hidden;padding:8px';
  d.setAttribute('role','dialog'); d.setAttribute('aria-label','รูปขนาดเต็ม');
  const nav = 'position:absolute;top:50%;transform:translateY(-50%);width:44px;height:64px;border:0;border-radius:10px;background:rgba(255,255,255,.18);color:#fff;font-size:28px';
  const draw = () => {
    const cur = ids.length ? ids[i] : id;
    d.innerHTML = `<img src="/api/attachments/${cur}/file" alt="" style="max-width:100%;max-height:100%;object-fit:contain">
      <button type="button" data-x aria-label="ปิด" style="position:absolute;top:10px;right:10px;width:44px;height:44px;border:0;border-radius:999px;background:rgba(255,255,255,.18);color:#fff;font-size:24px">&times;</button>
      ${ids.length > 1 ? `<button type="button" data-p aria-label="รูปก่อนหน้า" style="${nav};left:8px">&#8249;</button><button type="button" data-n aria-label="รูปถัดไป" style="${nav};right:8px">&#8250;</button>
      <div style="position:absolute;bottom:12px;left:0;right:0;text-align:center;color:#fff;font-size:13px">${i + 1} / ${ids.length}</div>` : ''}`;
  };
  d.onclick = e => {
    if (e.target.hasAttribute('data-p')) { i = (i - 1 + ids.length) % ids.length; draw(); }
    else if (e.target.hasAttribute('data-n')) { i = (i + 1) % ids.length; draw(); }
    else d.remove();
  };
  draw(); document.body.appendChild(d);
}
/* resize a photo in the browser to JPEG: tries each [long side px, quality] until it fits the byte limit */
async function attResize(file, steps, limit){
  const name = file.name || 'รูป';
  let img, w, h;
  try { img = await createImageBitmap(file, { imageOrientation:'from-image' }); w = img.width; h = img.height; }
  catch {
    img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('เปิดไฟล์รูป "' + name + '" ไม่ได้')); i.src = URL.createObjectURL(file); });
    w = img.naturalWidth; h = img.naturalHeight;
  }
  if (!w || !h) throw new Error('เปิดไฟล์รูป "' + name + '" ไม่ได้');
  for (const [max, q] of steps) {
    const s = Math.min(1, max / Math.max(w, h)), c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s));
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', q));
    if (blob && blob.size <= limit) return blob;
  }
  throw new Error('ย่อรูป "' + name + '" ไม่สำเร็จ');
}
const attShrink = file => attResize(file, [[1600,.8],[1600,.65],[1280,.6],[1024,.55],[800,.5]], 700000); // stored photo
const attThumb = file => attResize(file, [[360,.7],[320,.55],[240,.5]], 55000);                           // preview for lists
const attBase64 = blob => new Promise((res, rej) => { const f = new FileReader(); f.onload = () => res(String(f.result).split(',')[1]); f.onerror = () => rej(new Error('อ่านไฟล์ไม่ได้')); f.readAsDataURL(blob); });
async function uploadAttachments(){
  const files = [...document.getElementById('attFile').files], msg = document.getElementById('attMsg'), btn = document.getElementById('attSave');
  if (!files.length) { toast('กรุณาเลือกรูปก่อน','error'); return; }
  const caption = document.getElementById('attCaption').value, a = _att;
  btn.disabled = true; let ok = 0;
  for (let i = 0; i < files.length; i++) {
    msg.textContent = `กำลังอัปโหลดรูปที่ ${i + 1} จาก ${files.length}…`;
    try {
      if (!/^image\//.test(files[i].type || 'image/')) throw new Error('"' + files[i].name + '" ไม่ใช่ไฟล์รูป');
      const blob = await attShrink(files[i]);
      let thumbBase64 = ''; try { thumbBase64 = await attBase64(await attThumb(blob)); } catch { /* preview is optional */ }
      await api('POST','/api/attachments',{ collection:a.collection, recordId:a.id, fileName:files[i].name, caption, dataBase64: await attBase64(blob), thumbBase64 });
      ok++;
    } catch (e) { toast(e.message,'error'); }
  }
  if (ok) toast(`แนบรูปแล้ว ${ok} รูป ✓`);
  await loadAttCounts();
  if (_att === a) openAttachments(a.collection, a.id);
}
async function voidAttachment(id){
  const reason = prompt('ยกเลิกรูปนี้\nรูปจะยังอยู่ในประวัติ แต่ไม่แสดงเป็นรูปแนบปัจจุบัน\nกรุณาระบุเหตุผล'); if (!reason) return;
  try { await api('POST', `/api/attachments/${id}/void`, { reason }); toast('ยกเลิกรูปแล้ว ✓'); await loadAttCounts(); if (_att) openAttachments(_att.collection, _att.id); }
  catch (e) { toast(e.message,'error'); }
}


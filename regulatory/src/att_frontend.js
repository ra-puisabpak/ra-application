/* -------------------------------------------------------------- รูปแนบ (image attachments) */
let ATT = {}, _att = null;
const ATT_TITLE = { regProducts:'ผลิตภัณฑ์', formulaControl:'สูตร', labelChecklist:'ฉลาก', rawMaterials:'วัตถุดิบ', kpiResults:'ผล KPI' };
async function loadAttCounts(){ try { ATT = (await api('GET','/api/attachments/counts')).counts || {}; } catch { /* photos are optional: the rest of the app still works */ } }
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
              <button type="button" onclick="viewAttachment(${a.id})" style="display:block;width:100%;padding:0;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;background:#f8fafc" aria-label="ดูรูปขนาดเต็ม">
                <img src="${src(a)}" alt="${esc(a.caption || a.file_name)}" loading="lazy" style="display:block;width:100%;height:130px;object-fit:cover"></button>
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
function viewAttachment(id){
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;inset:0;z-index:60;background:rgba(0,0,0,.92);display:flex;align-items:center;justify-content:center;overflow:auto;padding:8px';
  d.setAttribute('role','dialog'); d.setAttribute('aria-label','รูปขนาดเต็ม แตะเพื่อปิด');
  d.innerHTML = `<img src="/api/attachments/${id}/file" alt="" style="max-width:100%;max-height:100%;object-fit:contain">`;
  d.onclick = () => d.remove();
  document.body.appendChild(d);
}
/* shrink a photo in the browser: long side <= 1600 px, JPEG, <= 700 KB */
async function attShrink(file){
  let img, w, h;
  try { img = await createImageBitmap(file, { imageOrientation:'from-image' }); w = img.width; h = img.height; }
  catch {
    img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('เปิดไฟล์รูป "' + file.name + '" ไม่ได้')); i.src = URL.createObjectURL(file); });
    w = img.naturalWidth; h = img.naturalHeight;
  }
  if (!w || !h) throw new Error('เปิดไฟล์รูป "' + file.name + '" ไม่ได้');
  for (const [max, q] of [[1600,.8],[1600,.65],[1280,.6],[1024,.55],[800,.5]]) {
    const s = Math.min(1, max / Math.max(w, h)), c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s));
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', q));
    if (blob && blob.size <= 700000) return blob;
  }
  throw new Error('ย่อรูป "' + file.name + '" ไม่สำเร็จ');
}
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
      await api('POST','/api/attachments',{ collection:a.collection, recordId:a.id, fileName:files[i].name, caption, dataBase64: await attBase64(blob) });
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


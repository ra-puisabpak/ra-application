/* -------------------------------------------------------------- ทะเบียนผลิตภัณฑ์: การ์ดรูปสินค้า */
const CONSUME_TH = { RAW:'ดิบ (RAW)', RTC:'พร้อมปรุง (RTC)', PAR_COOKED:'กึ่งสุก (Par-cooked)', RTE:'พร้อมบริโภค (RTE)' };
const STORAGE_TH = { AMBIENT:'อุณหภูมิห้อง (Ambient)', CHILLED:'แช่เย็น (Chilled)', FROZEN:'แช่เยือกแข็ง (Frozen)' };
function renderProducts(){
  const q = _search.trim().toLowerCase();
  const all = DB.regProducts.slice().sort((a,b) => String(a.productCode).localeCompare(String(b.productCode), 'th', { numeric:true }));
  const items = q ? all.filter(p => JSON.stringify(p).toLowerCase().includes(q)) : all;
  const card = p => {
    const cov = attCover('regProducts', p.id), n = ATT['regProducts|' + p.id] || 0;
    return `<button type="button" class="card" style="display:flex;flex-direction:column;text-align:left;overflow:hidden;padding:0;min-width:0" onclick="openProduct('${esc(p.id)}')">
      <div style="position:relative;aspect-ratio:1/1;background:#f8fafc;border-bottom:1px solid #eef2f6">
        ${cov ? `<img src="/api/attachments/${cov}/thumb" alt="" loading="lazy" style="display:block;width:100%;height:100%;object-fit:cover">`
          : `<div style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;color:#94a3b8"><span style="font-size:34px">🫙</span><span style="font-size:12px">ยังไม่มีรูปสินค้า</span></div>`}
        ${n > 1 ? `<span style="position:absolute;right:6px;bottom:6px;background:rgba(15,23,42,.7);color:#fff;font-size:11px;font-weight:700;border-radius:999px;padding:1px 8px">${n} รูป</span>` : ''}
      </div>
      <div style="padding:10px 10px 12px;display:flex;flex-direction:column;gap:4px;min-width:0;flex:1">
        <div class="font-semibold" style="font-size:14px;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(p.thaiProductName)}</div>
        <div class="text-[11.5px] text-ink-mute" style="overflow-wrap:anywhere">${esc(p.productCode)}${p.thaiFdaNumber ? ' · อย. ' + esc(p.thaiFdaNumber) : ''}</div>
        <div style="margin-top:auto;padding-top:4px">${pill(p.status)}</div>
      </div></button>`;
  };
  document.getElementById('pageContent').innerHTML = `
    <div class="flex flex-wrap gap-2 items-center justify-between mb-4 noprint">
      <div class="flex gap-3 items-center flex-1 min-w-[220px]">
        <input id="searchBox" class="input max-w-xs" placeholder="ค้นหาชื่อ รหัส หรือเลข อย." value="${esc(_search)}" oninput="_search=this.value; renderProducts(); document.getElementById('searchBox').focus()">
        <span class="text-sm text-ink-mute font-medium whitespace-nowrap">${items.length} รายการ</span>
      </div>
      <button class="btn btn-primary shadow-sm" onclick="openRecord('regProducts')">${LIST.regProducts.addLabel}</button>
    </div>
    ${items.length ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px">${items.map(card).join('')}</div>`
      : '<div class="card p-8 text-center text-ink-mute text-sm">ยังไม่มีข้อมูล</div>'}`;
}
function openProduct(id){
  const p = product(id); if (!p) { toast('ไม่พบรายการ กรุณาดึงข้อมูลใหม่','error'); return; }
  const cov = attCover('regProducts', id), all = ATT_IDS['regProducts|' + id] || [];
  const f = current('formulaControl', id), l = current('labelChecklist', id);
  const row = (k, v) => v ? `<dt>${k}</dt><dd>${v}</dd>` : '';
  const sb8 = p.sb8Status ? `${sb8Pill(p)}${p.proposedNameTh ? `<div class="text-[12.5px] mt-1">ชื่อใหม่: ${esc(p.proposedNameTh)}${p.proposedNameEn ? ' / ' + esc(p.proposedNameEn) : ''}</div>` : ''}${p.registeredNameTh ? `<div class="text-[12px] text-ink-mute">ชื่อเดิม: ${esc(p.registeredNameTh)}</div>` : ''}${p.sb8Ref ? `<div class="text-[12px] text-ink-mute">อ้างอิง: ${esc(p.sb8Ref)}</div>` : ''}` : '';
  document.getElementById('modalRoot').innerHTML = `
    <div class="fixed inset-0 bg-slate-900/50 z-40 flex items-start justify-center overflow-y-auto p-2 sm:p-4" onclick="if(event.target===this)closeModal()">
      <div class="card w-full max-w-2xl my-4 shadow-2xl border-0 overflow-hidden">
        <div class="px-5 py-3 border-b flex justify-between items-center gap-3"><div class="text-[12px] text-ink-mute">${esc(p.id)}</div><button class="text-2xl text-slate-400" onclick="closeModal()" aria-label="ปิด">&times;</button></div>
        ${cov ? `<button type="button" onclick="viewAttachment(${cov},'regProducts','${esc(id)}')" style="display:block;width:100%;padding:0;border:0;background:#f8fafc" aria-label="ดูรูปขนาดเต็ม">
            <img src="/api/attachments/${cov}/file" alt="${esc(p.thaiProductName)}" style="display:block;width:100%;max-height:420px;object-fit:contain"></button>` : ''}
        <div class="p-5 space-y-4">
          ${all.length > 1 ? attStrip('regProducts', id, 60, 6) : ''}
          <div>
            <div class="flex flex-wrap items-center gap-2 mb-1">${pill(p.status)}<span class="text-[12px] text-ink-mute">${esc(p.productCode)}</span></div>
            <h3 class="font-bold text-lg leading-snug">${esc(p.thaiProductName)}</h3>
            ${p.englishProductName ? `<div class="text-sm text-ink-mute">${esc(p.englishProductName)}</div>` : ''}
          </div>
          <dl class="mat-dl text-sm" style="display:grid;grid-template-columns:auto 1fr;gap:6px 14px">
            ${row('เลขสารบบอาหาร', p.thaiFdaNumber ? `<span class="font-mono">${esc(p.thaiFdaNumber)}</span>` : '<span class="text-slate-400">ยังไม่มี</span>')}
            ${row('วันที่ได้รับอนุมัติ', p.approvalDate ? fmtDate(p.approvalDate) : '')}
            ${row('แบรนด์', esc(p.brand))}
            ${row('หมวดหมู่อาหาร (อย.)', esc(p.regulatoryClassification))}
            ${row('สถานะการบริโภค', esc(CONSUME_TH[p.rawRtcParcookedRteStatus] || p.rawRtcParcookedRteStatus))}
            ${row('การเก็บรักษา', esc(STORAGE_TH[p.chilledFrozenStatus] || p.chilledFrozenStatus))}
            ${row('สูตรปัจจุบัน', f ? `<button class="text-brand font-semibold" onclick="openRecord('formulaControl','${esc(f.id)}')">${esc(f.formulaRevision)} (${esc(f.id)})</button>` : '<span class="text-red-600 text-xs">ยังไม่มีสูตรอนุมัติ</span>')}
            ${row('ฉลากปัจจุบัน', l ? `<button class="text-brand font-semibold" onclick="openRecord('labelChecklist','${esc(l.id)}')">${esc(l.labelRevision)} (${esc(l.id)})</button>` : '<span class="text-red-600 text-xs">ยังไม่มีฉลากอนุมัติ</span>')}
            ${row('แก้ชื่อ สบ.8', sb8)}
            ${row('หมายเหตุ', p.note ? esc(p.note) : '')}
            ${row('แก้ไขล่าสุด', `${esc(p.updatedByName || '-')} · ${fmtDate(p.updatedAt)}`)}
          </dl>
          <div class="flex flex-wrap gap-2 pt-1">
            <button class="btn btn-primary" onclick="openRecord('regProducts','${esc(id)}')">แก้ไขข้อมูล</button>
            <button class="btn btn-ghost" onclick="openAttachments('regProducts','${esc(id)}','product')">📎 ${all.length ? 'จัดการรูป (' + all.length + ')' : 'เพิ่มรูปสินค้า'}</button>
            <button class="btn btn-ghost" onclick="openHistory('regProducts','${esc(id)}')">ประวัติ</button>
            ${['DRAFT','CONCEPT'].includes(p.status) ? `<button class="btn btn-ghost" onclick="closeModal();deleteRecord('regProducts','${esc(id)}')">ลบ</button>` : ''}
          </div>
        </div>
      </div></div>`;
}


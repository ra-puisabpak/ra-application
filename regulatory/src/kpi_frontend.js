/* -------------------------------------------------------------- KPI แผนก RA */
let KPI = null, _kpiKey = null;
const kpiNum = v => Number(v).toLocaleString('th-TH', { maximumFractionDigits: 2 });
const kpiVal = (d, v) => kpiNum(v) + (d.unit === '%' ? '%' : ' ' + d.unit);
function kpiPeriodLabel(d, p){
  if (d.freq === 'M') return new Date(p + '-01T00:00:00').toLocaleDateString('th-TH', { month:'short', year:'2-digit' });
  if (d.freq === 'Q') return 'ไตรมาส ' + p.slice(6) + '/' + (Number(p.slice(0,4)) + 543);
  return new Date(p + 'T00:00:00').toLocaleDateString('th-TH', { day:'numeric', month:'short', year:'2-digit' });
}
function kpiTarget(d){
  const t = KPI.targets.filter(x => x.kpi_key === d.key).pop();
  return t ? { value:t.target_value, basis:t.basis_ref, by:t.set_by_name, at:t.set_at } : { value:d.target, basis:null };
}
function kpiTargetText(d){
  const t = kpiTarget(d);
  if (t.value === null || t.value === undefined) return 'ยังไม่กำหนด';
  if (!t.basis) return d.targetText;
  return (d.op === 'GE' ? '≥ ' : '≤ ') + kpiVal(d, t.value);
}
function kpiPass(d, v){ const t = kpiTarget(d).value; if (t === null || t === undefined) return null; return d.op === 'GE' ? v >= t : v <= t; }
function kpiRows(d){ return KPI.results.filter(r => r.kpi_key === d.key && !r.voided_at); }
/* status of one KPI: periodic = latest period; per-event = every event of the latest year must pass */
function kpiState(d){
  const rows = kpiRows(d); if (!rows.length) return { s:'none', rows };
  const latest = rows[0];
  if (kpiPass(d, latest.value) === null) return { s:'notarget', rows, latest };
  if (d.freq !== 'E') return { s: kpiPass(d, latest.value) ? 'pass' : 'fail', rows, latest };
  const year = rows.filter(r => r.period.slice(0,4) === latest.period.slice(0,4));
  const ok = year.filter(r => kpiPass(d, r.value)).length;
  return { s: ok === year.length ? 'pass' : 'fail', rows, latest, ok, total: year.length, year: Number(latest.period.slice(0,4)) + 543 };
}
const KPI_PILL = { pass:['ผ่านเป้า','green'], fail:['ไม่ผ่านเป้า','red'], notarget:['รอกำหนดเป้า','amber'], none:['ยังไม่มีข้อมูล','slate'] };
const kpiPill = s => `<span class="pill ${PILL[KPI_PILL[s][1]]}">${KPI_PILL[s][0]}</span>`;
const kpiCanRecord = () => ME.roles.some(r => ['RA','R&D','QA','MANAGEMENT'].includes(r));

async function renderKpi(){
  const box = document.getElementById('pageContent');
  if (!KPI) box.innerHTML = '<div class="text-sm text-ink-mute">กำลังโหลด…</div>';
  try { KPI = await api('GET','/api/kpi'); }
  catch (e) { box.innerHTML = `<div class="text-red-600 text-sm">${esc(e.message)}</div>`; return; }
  if (currentPage !== 'kpi') return;
  const states = KPI.defs.map(d => [d, kpiState(d)]);
  const n = s => states.filter(([,x]) => x.s === s).length;
  const tile = (v,l,c) => `<div class="card p-4 text-center border-t-4 ${c}"><div class="text-3xl font-bold">${v}</div><div class="text-xs text-ink-mute font-semibold mt-1">${l}</div></div>`;
  box.innerHTML = `
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
      ${tile(n('pass'),'ผ่านเป้า','border-t-green-500 text-green-700')}
      ${tile(n('fail'),'ไม่ผ่านเป้า','border-t-red-500 text-red-700')}
      ${tile(n('notarget'),'มีผลแล้ว รอกำหนดเป้า','border-t-amber-500 text-amber-700')}
      ${tile(n('none'),'ยังไม่มีข้อมูล','border-t-slate-400')}
    </div>
    <div class="mat-note mb-4">ตัวเลขทุกค่าต้องมาจาก Log/เอกสารต้นทางจริง และต้องระบุเอกสารอ้างอิงทุกครั้ง ระบบคำนวณค่า KPI ให้เองจากตัวตั้งและตัวหาร แตะที่ KPI เพื่อดูนิยาม บันทึกผล และย้อนดูที่มาของตัวเลข</div>
    ${KPI.groups.map((g, i) => `
      <div class="card mb-4 overflow-hidden">
        <div class="px-4 py-3 bg-slate-50 border-b border-slate-200 font-bold text-sm">${i+1}. ${esc(g)}</div>
        ${states.filter(([d]) => d.group === i+1).map(([d, st]) => `
          <button type="button" class="w-full text-left px-4 py-3 border-b border-slate-100 last:border-0 flex items-center gap-3 hover:bg-red-50" onclick="openKpi('${d.key}')">
            <div class="flex-1 min-w-0">
              <div class="font-semibold text-sm">${esc(d.name)}</div>
              <div class="text-[11.5px] text-ink-mute mt-0.5">เป้า ${esc(kpiTargetText(d))} · ${esc(d.freqText)}</div>
              ${st.total ? `<div class="text-[11.5px] text-ink-mute">ปี ${st.year}: ผ่านเป้า ${st.ok} จาก ${st.total} รายการ</div>` : ''}
            </div>
            <div class="text-right shrink-0">
              ${st.latest ? `<div class="text-lg font-bold leading-tight">${esc(kpiVal(d, st.latest.value))}</div><div class="text-[11px] text-ink-mute mb-1">${esc(kpiPeriodLabel(d, st.latest.period))}</div>` : ''}
              ${kpiPill(st.s)}
            </div>
          </button>`).join('')}
      </div>`).join('')}
    <p class="text-[11px] text-ink-mute">อ้างอิง: Draft KPI แผนก RA — ปุยแสบปาก (14 ตัวชี้วัด ตามหน้าที่ความรับผิดชอบ 7 ข้อ) · เป้าที่ยังไม่มีตัวเลขให้ผู้อนุมัติตั้งจาก Baseline รอบจริง</p>`;
}

function kpiModal(inner, wide){
  document.getElementById('modalRoot').innerHTML = `
    <div class="fixed inset-0 bg-slate-900/50 z-40 flex items-start justify-center overflow-y-auto p-2 sm:p-4" onclick="if(event.target===this)closeModal()">
      <div class="card w-full ${wide?'max-w-3xl':'max-w-md'} my-4 shadow-2xl border-0">${inner}</div></div>`;
}
function openKpi(key){
  _kpiKey = key;
  const d = KPI.defs.find(x => x.key === key), st = kpiState(d), t = kpiTarget(d);
  const all = KPI.results.filter(r => r.kpi_key === key);
  const dl = (k, v) => `<dt>${k}</dt><dd>${v}</dd>`;
  kpiModal(`
    <div class="px-5 py-4 border-b flex justify-between gap-3"><div><div class="font-bold">${esc(d.name)}</div><div class="text-[11.5px] text-ink-mute">${d.group}. ${esc(KPI.groups[d.group-1])}</div></div><button class="text-2xl text-slate-400" onclick="closeModal()" aria-label="ปิด">&times;</button></div>
    <div class="p-5 space-y-4">
      <div class="flex items-center gap-3">${st.latest ? `<div class="text-3xl font-bold">${esc(kpiVal(d, st.latest.value))}</div><div class="text-xs text-ink-mute">${esc(kpiPeriodLabel(d, st.latest.period))}${st.latest.subject?'<br>'+esc(st.latest.subject):''}</div>` : ''}<div class="ml-auto">${kpiPill(st.s)}</div></div>
      <dl class="mat-dl text-sm" style="display:grid;grid-template-columns:auto 1fr;gap:6px 12px">
        ${dl('นิยาม/สูตร', esc(d.formula))}
        ${dl('เป้าหมาย', esc(kpiTargetText(d)) + (t.basis ? `<div class="text-[11.5px] text-ink-mute">ที่มา: ${esc(t.basis)} · ตั้งโดย ${esc(t.by||'-')} · ${fmtDate(t.at)}</div>` : (t.value === null ? `<div class="text-[11.5px] text-amber-700">${esc(d.targetText)}</div>` : '<div class="text-[11.5px] text-ink-mute">ตามเอกสาร Draft KPI</div>')))}
        ${dl('แหล่งข้อมูล', esc(d.source))}
        ${dl('ความถี่', esc(d.freqText))}
      </dl>
      <div class="flex flex-wrap gap-2">
        ${kpiCanRecord() ? `<button class="btn btn-primary" onclick="openKpiEntry()">+ บันทึกผล</button>` : ''}
        ${ME.canApprove ? `<button class="btn btn-ghost" onclick="openKpiTarget()">ตั้งเป้าหมาย</button>` : ''}
      </div>
    </div>
    <div class="px-5 pb-2 font-bold text-sm">ผลที่บันทึก <span class="text-ink-mute font-normal">(${all.length})</span></div>
    ${all.length ? `<div class="overflow-x-auto"><table class="dt stack"><thead><tr><th>${d.freq==='E'?'วันที่ / เรื่อง':'งวด'}</th><th>ผล</th><th>ที่มาของตัวเลข</th><th>ผู้บันทึก</th><th></th></tr></thead><tbody>
      ${all.map(r => { const v = !!r.voided_at, p = kpiPass(d, r.value);
        return `<tr class="${v?'opacity-60':''}">
          <td data-l="${d.freq==='E'?'วันที่ / เรื่อง':'งวด'}">${esc(kpiPeriodLabel(d, r.period))}${r.subject?`<div class="text-[12px]">${esc(r.subject)}</div>`:''}<div class="text-[11px] text-ink-mute">${esc(r.id)}</div></td>
          <td data-l="ผล"><div><b class="${v?'line-through':''}">${esc(kpiVal(d, r.value))}</b>${r.denominator!==null?` <span class="text-[11.5px] text-ink-mute">(${kpiNum(r.numerator)} ÷ ${kpiNum(r.denominator)})</span>`:''}
            <div>${v ? '<span class="pill '+PILL.slate+'">ยกเลิกแล้ว</span>' : p===null ? '' : kpiPill(p?'pass':'fail')}</div></div></td>
          <td data-l="ที่มาของตัวเลข" class="text-[12.5px]"><div>${esc(r.source_ref)}${r.note?`<div class="text-ink-mute">${esc(r.note)}</div>`:''}${v?`<div class="text-red-700">ยกเลิก: ${esc(r.void_reason)} (${esc(r.voided_by_name||'-')})</div>`:''}</div></td>
          <td data-l="ผู้บันทึก" class="text-[12px]">${esc(r.created_by_name||'-')}<div class="text-ink-mute">${fmtDate(r.created_at)}</div></td>
          <td class="act text-right">${!v && (r.created_by===ME.id || ME.canApprove) ? `<button class="text-brand text-xs font-semibold" onclick="voidKpi('${esc(r.id)}')">ยกเลิก</button>` : ''}</td></tr>`; }).join('')}
      </tbody></table></div>` : '<div class="text-sm text-ink-mute px-5 pb-5">ยังไม่มีผลที่บันทึก</div>'}
    <div class="p-3"></div>`, true);
}

function kpiPeriodInput(d){
  const now = new Date(), y = now.getFullYear(), m = String(now.getMonth()+1).padStart(2,'0'), day = String(now.getDate()).padStart(2,'0');
  if (d.freq === 'M') return `<input id="kpPeriod" type="month" class="input" max="${y}-${m}" value="${y}-${m}">`;
  if (d.freq === 'E') return `<input id="kpPeriod" type="date" class="input" max="${y}-${m}-${day}" value="${y}-${m}-${day}">`;
  const opts = []; let yy = y, q = Math.ceil((now.getMonth()+1)/3);
  for (let i = 0; i < 8; i++) { opts.push(`<option value="${yy}-Q${q}">ไตรมาส ${q}/${yy+543}</option>`); if (--q === 0) { q = 4; yy--; } }
  return `<select id="kpPeriod" class="select">${opts.join('')}</select>`;
}
function openKpiEntry(){
  const d = KPI.defs.find(x => x.key === _kpiKey);
  const numField = (id, label) => `<div><label class="label" for="${id}">${esc(label)} <span class="text-red-500">*</span></label><input id="${id}" class="input" type="number" inputmode="decimal" min="0" step="any" oninput="kpiPreview()"></div>`;
  kpiModal(`<div class="p-5 space-y-3">
    <div><div class="font-bold">บันทึกผล KPI</div><div class="text-sm text-ink-mute">${esc(d.name)}</div></div>
    <div><label class="label" for="kpPeriod">${d.freq==='E'?'วันที่':'งวดที่รายงาน'} <span class="text-red-500">*</span></label>${kpiPeriodInput(d)}</div>
    ${d.freq==='E' ? `<div><label class="label" for="kpSubject">${esc(d.subjectLabel)} <span class="text-red-500">*</span></label><input id="kpSubject" class="input" maxlength="200"></div>` : ''}
    ${d.kind==='NUMBER' ? numField('kpValue', d.valueLabel + ' (' + d.unit + ')') : numField('kpNum', d.numLabel) + numField('kpDen', d.denLabel)}
    <div id="kpPreview" class="mat-note">ผล: —</div>
    <div><label class="label" for="kpSource">เอกสาร/Log อ้างอิงของตัวเลขนี้ <span class="text-red-500">*</span></label><input id="kpSource" class="input" maxlength="300" placeholder="${esc(d.source)} เช่น เลขที่เอกสาร / ลำดับใน Log"><div class="text-[11px] text-ink-mute mt-1">ใช้ย้อนกลับไปตรวจที่มาของตัวเลขตอน Audit</div></div>
    <div><label class="label" for="kpNote">หมายเหตุ</label><textarea id="kpNote" class="textarea" rows="2" maxlength="500"></textarea></div>
    <div class="flex justify-end gap-2 pt-2"><button class="btn btn-ghost" onclick="openKpi(_kpiKey)">ยกเลิก</button><button id="kpSave" class="btn btn-primary" onclick="saveKpiEntry()">บันทึก</button></div>
  </div>`);
}
function kpiPreview(){
  const d = KPI.defs.find(x => x.key === _kpiKey), el = document.getElementById('kpPreview'), g = id => { const e = document.getElementById(id); return e && e.value !== '' ? Number(e.value) : NaN; };
  let v = NaN;
  if (d.kind === 'NUMBER') v = g('kpValue');
  else { const a = g('kpNum'), b = g('kpDen'); if (b > 0 && a >= 0 && !(d.kind === 'RATIO' && a > b)) v = d.kind === 'RATIO' ? a / b * 100 : a / b; }
  if (!(v >= 0)) { el.className = 'mat-note'; el.textContent = 'ผล: —'; return; }
  v = Math.round(v * 100) / 100;
  const p = kpiPass(d, v);
  el.className = 'mat-note' + (p === false ? ' urgent' : '');
  el.textContent = 'ผล: ' + kpiVal(d, v) + ' · เป้า ' + kpiTargetText(d) + (p === null ? '' : p ? ' · ผ่านเป้า' : ' · ไม่ผ่านเป้า');
}
async function saveKpiEntry(){
  const d = KPI.defs.find(x => x.key === _kpiKey), v = id => { const e = document.getElementById(id); return e ? e.value : ''; };
  const btn = document.getElementById('kpSave'); btn.disabled = true;
  try {
    await api('POST','/api/kpi/results',{ kpiKey:d.key, period:v('kpPeriod'), subject:v('kpSubject'), numerator:v('kpNum'), denominator:v('kpDen'), value:v('kpValue'), sourceRef:v('kpSource'), note:v('kpNote') });
    toast('บันทึกผล KPI แล้ว ✓'); await renderKpi(); openKpi(d.key);
  } catch (e) { toast(e.message,'error'); btn.disabled = false; }
}
async function voidKpi(id){
  const reason = prompt('ยกเลิกรายการ ' + id + '\nรายการจะยังอยู่ในประวัติ แต่ไม่นำมาคิด KPI\nกรุณาระบุเหตุผล'); if (!reason) return;
  try { await api('POST', `/api/kpi/results/${id}/void`, { reason }); toast('ยกเลิกรายการแล้ว ✓'); await renderKpi(); openKpi(_kpiKey); }
  catch (e) { toast(e.message,'error'); }
}
function openKpiTarget(){
  const d = KPI.defs.find(x => x.key === _kpiKey), t = kpiTarget(d);
  kpiModal(`<div class="p-5 space-y-3">
    <div><div class="font-bold">ตั้งเป้าหมาย KPI</div><div class="text-sm text-ink-mute">${esc(d.name)}</div></div>
    <div class="mat-note warn">เป้าต้องมาจาก Baseline รอบการทำงานจริง หรือมติ/ข้อตกลงกับผู้บริหาร ห้ามตั้งจากการคาดเดา</div>
    <div><label class="label" for="ktValue">ค่าเป้าหมาย (${d.op==='GE'?'ไม่ต่ำกว่า':'ไม่เกิน'}, ${esc(d.unit)}) <span class="text-red-500">*</span></label><input id="ktValue" class="input" type="number" inputmode="decimal" min="0" step="any" value="${t.value===null||t.value===undefined?'':t.value}"></div>
    <div><label class="label" for="ktBasis">ที่มาของเป้าหมาย <span class="text-red-500">*</span></label><input id="ktBasis" class="input" maxlength="300" placeholder="เช่น รายงานการประชุมผู้บริหาร ครั้งที่ / วันที่"></div>
    <div class="flex justify-end gap-2 pt-2"><button class="btn btn-ghost" onclick="openKpi(_kpiKey)">ยกเลิก</button><button class="btn btn-primary" onclick="saveKpiTarget()">บันทึก</button></div>
  </div>`);
}
async function saveKpiTarget(){
  try {
    await api('POST','/api/kpi/targets',{ kpiKey:_kpiKey, value:document.getElementById('ktValue').value, basisRef:document.getElementById('ktBasis').value });
    toast('ตั้งเป้าหมายแล้ว ✓'); await renderKpi(); openKpi(_kpiKey);
  } catch (e) { toast(e.message,'error'); }
}


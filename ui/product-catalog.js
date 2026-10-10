// Product Registration gallery: product photo cards backed by the RA master data (D1).
// Each SKU links its label-approval row, allergen-matrix row and Product Master record.
const PRODUCT_CATALOG = [
  { sku: 'PSP01', th: 'น้ำพริกหมูเสวย', en: 'Ground Pork Chilli Paste', image: 'PSP01.jpg', label: '09' },
  { sku: 'PSP02', th: 'น้ำพริกปลาย่างพลัส', en: 'Grilled Fish Chilli Paste', image: 'PSP02.jpg', label: '10', allergen: 'PY' },
  { sku: 'PSP04', th: 'น้ำพริกเห็ดหอม มังสวิรัติ', en: 'Shiitake Mushroom Chilli Paste (Vegetarian)', image: 'PSP04.jpg', label: '08', allergen: 'HH', tag: 'มังสวิรัติ' },
  { sku: 'PSP05', th: 'พริกผัดน้ำมันมะกอก สูตรเผ็ด', en: 'Chilli Olive Oil — Spicy', image: 'PSP05.jpg', allergen: 'OO-S', tag: 'มังสวิรัติ' },
  { sku: 'PSP07', th: 'น้ำพริกเห็ดหอม สูตรเจ', en: 'Shiitake Mushroom Chilli Paste (เจ)', image: 'PSP07.jpg', label: '02', tag: 'เจ' },
  { sku: 'PSP12', th: 'น้ำพริกเผ็ดแมคเคอเรล', en: 'Spicy Mackerel Chilli Paste', image: 'PSP12.jpg', label: '07', allergen: 'MC' },
  { sku: 'PSP14', th: 'น้ำพริกตาแดงมันกุ้ง', en: 'Shrimp Red Hot Chilli Paste', image: 'PSP14.jpg', label: '06', allergen: 'TD' },
  { sku: 'PSP15', th: 'พริกคั่วป่น', en: 'Ground Roasted Chili 100%', image: 'PSP15.jpg', label: '03', allergen: 'CP' },
  { sku: 'PSP17', th: 'พริกผัดน้ำมันมะกอก', en: 'Chilli Olive Oil — Original', image: 'PSP17.jpg', allergen: 'OO-O', tag: 'มังสวิรัติ' },
  { sku: 'PSP18', th: 'น้ำพริกปลาร้าพริกสด', en: 'Pickled Fish Chilli Paste', image: 'PSP18.jpg', allergen: 'PR' },
  { sku: 'PSP80', th: 'น้ำปลาหวาน', en: 'Nam Pla Whan Sab — Sweet Fish Sauce', image: 'PSP80.jpg', label: '04', allergen: 'NPW' },
  { sku: 'PSP89', th: 'พริกผัดน้ำมันงา', en: 'Chilli Sesame Oil', image: 'PSP89.jpg', label: '05', allergen: 'SO', tag: 'มังสวิรัติ' },
  { sku: 'PSP90', th: 'พริกน้ำมันธัญพืช', en: 'Olive Nut Crunch', label: '01' },
];

const ALLERGEN_COLUMNS = [['fish', 'ปลา'], ['crustacean', 'สัตว์น้ำมีเปลือกแข็ง'], ['soy_gluten', 'ถั่วเหลือง/กลูเตน'], ['sesame', 'งา']];
const LABEL_STATUS_TEXT = { HOLD: 'รอแก้ฉลาก', APPROVED: 'อนุมัติฉลากแล้ว', REVIEW: 'กำลังตรวจ' };
const productGallery = { items: [], filter: '' };

const normCode = (value) => String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const productImage = (item) => item.image
  ? '<img src="product-images/' + esc(item.image) + '" alt="' + esc(item.th) + '" loading="lazy">'
  : '<div class="pg-noimg">ยังไม่มีรูปสินค้า</div>';

async function loadProducts() {
  const [products, labels, compliance, allergens, issues] = await Promise.allSettled(
    ['/products', '/ra/label-approval', '/ra/sku-compliance', '/ra/allergen-matrix', '/ra/label-issues'].map((path) => api(path)),
  );
  const rows = (result) => (result.status === 'fulfilled' ? result.value.data || [] : []);
  const records = rows(products);
  const labelBySku = new Map(rows(labels).map((r) => [String(r.sku), r]));
  const complianceBySku = new Map(rows(compliance).map((r) => [normCode(r.sku), r]));
  const allergenBySku = new Map(rows(allergens).map((r) => [String(r.sku), r]));
  const issueRows = rows(issues);
  const recordByCode = new Map(records.map((r) => [normCode(r.productCode), r]));

  const items = PRODUCT_CATALOG.map((item) => ({
    ...item,
    labelRow: item.label ? labelBySku.get(item.label) : undefined,
    compliance: complianceBySku.get(item.sku),
    allergenRow: item.allergen ? allergenBySku.get(item.allergen) : undefined,
    issues: issueRows.filter((i) => String(i.affected_skus || '').includes(item.sku) || String(i.affected_skus || '').includes('ทั้ง')),
    record: recordByCode.get(item.sku),
  }));
  const known = new Set(PRODUCT_CATALOG.map((item) => item.sku));
  for (const record of records) {
    if (!known.has(normCode(record.productCode))) {
      items.push({ sku: record.productCode, th: record.thaiName, en: record.englishName || '', issues: [], record });
    }
  }
  productGallery.items = items;
  if (products.status === 'rejected') showError(products.reason.message);
  renderProductGallery();
}

function renderProductGallery() {
  document.getElementById('productDetail').classList.add('hidden');
  document.getElementById('productPanel').classList.add('hidden');
  const grid = document.getElementById('products');
  grid.classList.remove('hidden');
  const q = productGallery.filter.trim().toLowerCase();
  const items = productGallery.items.filter((item) => !q || [item.sku, item.th, item.en].join(' ').toLowerCase().includes(q));
  document.getElementById('productGalleryCount').textContent = items.length + ' / ' + productGallery.items.length + ' รายการ';
  grid.innerHTML = items.map((item, index) => {
    const status = item.labelRow ? item.labelRow.status : '';
    const issueCount = item.compliance ? Number(item.compliance.issue_count || 0) : null;
    return '<button class="pg-card" onclick="openProductCard(' + productGallery.items.indexOf(item) + ')">'
      + '<div class="pg-img">' + productImage(item) + (item.tag ? '<span class="pg-tag">' + esc(item.tag) + '</span>' : '') + '</div>'
      + '<div class="pg-body"><span class="pg-sku">' + esc(item.sku) + '</span><b>' + esc(item.th) + '</b><small>' + esc(item.en) + '</small>'
      + '<div class="pg-badges">'
      + (status ? '<span class="pg-badge ' + (status === 'HOLD' ? 'warn' : 'ok') + '">' + esc(LABEL_STATUS_TEXT[status] || status) + '</span>' : '')
      + (issueCount !== null ? '<span class="pg-badge ' + (issueCount ? 'risk' : 'ok') + '">' + (issueCount ? issueCount + ' ประเด็นฉลาก' : 'ไม่มีประเด็น') + '</span>' : '')
      + '<span class="pg-badge ' + (item.record ? 'info' : 'muted') + '">' + (item.record ? esc(item.record.state) : 'ยังไม่เปิดทะเบียน') + '</span>'
      + '</div></div></button>';
  }).join('') || '<div class="card muted">ไม่พบสินค้าที่ค้นหา</div>';
}

function filterProductGallery(value) {
  productGallery.filter = value;
  renderProductGallery();
}

function openProductCard(index) {
  const item = productGallery.items[index];
  if (!item) return;
  document.getElementById('products').classList.add('hidden');
  const panel = document.getElementById('productDetail');
  panel.classList.remove('hidden');
  const label = item.labelRow;
  const allergenBadges = item.allergenRow
    ? ALLERGEN_COLUMNS.filter(([key]) => String(item.allergenRow[key] || '').trim()).map(([, text]) => '<span class="pg-badge risk">' + esc(text) + '</span>').join('') || '<span class="pg-badge ok">ไม่มีสารก่อภูมิแพ้หลัก</span>'
    : '<span class="muted">ยังไม่มีข้อมูลใน Allergen Matrix</span>';
  const row = (name, value) => value ? '<div class="pg-row"><span>' + esc(name) + '</span><b>' + esc(value) + '</b></div>' : '';
  panel.innerHTML = '<button class="btn secondary" onclick="renderProductGallery()">← กลับไปหน้ารวมสินค้า</button>'
    + '<div class="pg-detail">'
    + '<div class="pg-detail-img">' + productImage(item) + '</div>'
    + '<div><span class="pg-sku">' + esc(item.sku) + '</span><h2>' + esc(item.th) + '</h2><p class="muted">' + esc(item.en) + (item.tag ? ' · ' + esc(item.tag) : '') + '</p>'
    + '<div class="card"><div class="section-title">ทะเบียน / Product Master</div>'
    + (item.record
      ? row('สถานะ', item.record.state) + row('Revision', item.record.revision) + row('Site', item.record.siteId)
        + '<button class="btn" onclick="openProduct(\'' + esc(item.record.id) + '\')">เปิดงานทะเบียน</button>'
      : '<p class="muted">ยังไม่มีเรคคอร์ดใน Product Master สำหรับ SKU นี้</p><button class="btn" onclick="prefillProduct(' + index + ')">เปิดทะเบียนสินค้านี้</button>')
    + '</div></div></div>'
    + '<div class="pg-grid2">'
    + '<div class="card"><div class="section-title">การอนุมัติฉลาก</div>'
    + (label
      ? row('สถานะ', LABEL_STATUS_TEXT[label.status] || label.status) + row('ประเด็นหลัก', label.key_issue) + row('สิ่งที่ต้องตรวจ', label.check_action) + row('หลักฐานที่ต้องใช้', label.required_evidence) + row('แนวทาง', label.guidance)
      : '<p class="muted">ยังไม่มีข้อมูลใน Label Approval Matrix</p>')
    + '</div>'
    + '<div class="card"><div class="section-title">สารก่อภูมิแพ้</div><div class="pg-badges">' + allergenBadges + '</div>'
    + (item.allergenRow && item.allergenRow.note ? '<p class="muted">' + esc(item.allergenRow.note) + '</p>' : '') + '</div>'
    + '</div>'
    + '<div class="card"><div class="section-title">ประเด็นฉลากที่ต้องแก้ (' + item.issues.length + ')</div>'
    + (item.issues.map((issue) => '<div class="task"><div><b>' + esc(issue.issue) + '</b><small class="muted" style="display:block">' + esc(issue.status || '') + ' · ผู้รับผิดชอบ: ' + esc(issue.owner || '-') + '</small><small style="display:block">' + esc(issue.next_action || '') + '</small></div></div>').join('') || '<p class="muted">ไม่มีประเด็นค้าง</p>')
    + '</div>';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function prefillProduct(index) {
  const item = productGallery.items[index];
  document.getElementById('newCode').value = item.sku;
  document.getElementById('newThai').value = item.th;
  document.getElementById('newEnglish').value = item.en;
  const form = document.getElementById('productCreate');
  form.open = true;
  form.scrollIntoView({ behavior: 'smooth' });
}

// Master data for Puisabpak. Starter lists — edit to match the factory's own registers.
// Material, supplier and parameter fields accept free text; these lists only offer suggestions.

// Process steps (draft, generic chilli-paste flow — confirm against the HACCP flow diagram).
export const PROCESSES = [
  { code: 'PC0001', label: 'การรับวัตถุดิบและบรรจุภัณฑ์' },
  { code: 'PC0002', label: 'การจัดเก็บวัตถุดิบ' },
  { code: 'PC0003', label: 'การล้างและคัดแยก' },
  { code: 'PC0004', label: 'การเตรียมวัตถุดิบ (หั่น บด สับ สไลด์)' },
  { code: 'PC0005', label: 'การชั่งส่วนผสม' },
  { code: 'PC0006', label: 'การทอด เจียว คั่ว' },
  { code: 'PC0007', label: 'การผัดและกวน (ให้ความร้อน)' },
  { code: 'PC0008', label: 'การบรรจุและปิดฝา' },
  { code: 'PC0009', label: 'การพักให้เย็น' },
  { code: 'PC0010', label: 'การติดฉลากและพิมพ์วันที่' },
  { code: 'PC0011', label: 'การตรวจจับโลหะ' },
  { code: 'PC0012', label: 'การบรรจุกล่องและจัดเก็บสินค้า' },
  { code: 'PC0013', label: 'การขนส่ง' },
]

// Check parameters (draft).
export const PARAMETERS = [
  { code: 'PR0001', label: 'ผลตรวจรับวัตถุดิบ / COA' },
  { code: 'PR0002', label: 'อุณหภูมิห้องหรือตู้เก็บวัตถุดิบ' },
  { code: 'PR0003', label: 'อุณหภูมิใจกลางขณะให้ความร้อน' },
  { code: 'PR0004', label: 'น้ำหนักบรรจุ' },
  { code: 'PR0005', label: 'การปิดผนึกฝา' },
  { code: 'PR0006', label: 'ฉลากและวันหมดอายุ' },
  { code: 'PR0007', label: 'การตรวจจับโลหะ' },
  { code: 'PR0008', label: 'สิ่งแปลกปลอม' },
]

// Approved suppliers — add from the approved supplier list.
export const SUPPLIERS = []

// Finished products, numbered by the last digits of the food serial number (เลขสารบบอาหาร).
export const MATERIALS = [
  { code: 'FG0001', label: 'น้ำพริกปลาร้าพริกสด' },
  { code: 'FG0002', label: 'น้ำพริกตาแดงมันกุ้ง' },
  { code: 'FG0003', label: 'น้ำพริกเห็ดหอมมังสวิรัติ' },
  { code: 'FG0004', label: 'น้ำพริกหมูเสวย' },
  { code: 'FG0005', label: 'น้ำพริกปลาย่างพลัส' },
  { code: 'FG0006', label: 'น้ำปลาหวานแซ่บ' },
  { code: 'FG0007', label: 'พริกผัดน้ำมันมะกอก สูตรออริจินัล' },
  { code: 'FG0008', label: 'น้ำพริกเผ็ดแมคเคอเรล' },
  { code: 'FG0009', label: 'พริกผัดน้ำมันมะกอก สูตรเผ็ด' },
  { code: 'FG0010', label: 'พริกผัดน้ำมันงา' },
  { code: 'FG0011', label: 'พริกคั่วป่น 100%' },
  { code: 'FG0012', label: 'น้ำพริกเห็ดหอม (สูตรเจ)' },
]

export const ALLERGENS = ['ปลา', 'กุ้ง/สัตว์น้ำมีเปลือก', 'งา', 'ถั่วเหลือง', 'ถั่วลิสง', 'กลูเตน', 'นม', 'ไข่']

export const SOURCE_OPTIONS = [
  { value: 'RM_RECEIVING', label: 'รับวัตถุดิบ' },
  { value: 'IN_PROCESS', label: 'ระหว่างผลิต' },
  { value: 'CCP', label: 'CCP เบี่ยงเบน' },
  { value: 'FINAL_QC', label: 'สินค้าสำเร็จรูป' },
  { value: 'WAREHOUSE', label: 'คลังสินค้า' },
  { value: 'COMPLAINT', label: 'ข้อร้องเรียน' },
  { value: 'AUDIT', label: 'ตรวจติดตาม' },
  { value: 'MAINTENANCE', label: 'ซ่อมบำรุง' },
  { value: 'FOOD_DEFENSE', label: 'Food Defense' },
  { value: 'FOOD_FRAUD', label: 'Food Fraud' },
  { value: 'OTHER', label: 'อื่นๆ' },
]
export const SOURCE_TH = Object.fromEntries(SOURCE_OPTIONS.map((o) => [o.value, o.label]))

export const DISPOSITION_OPTIONS = [
  { value: 'RELEASE', label: 'ปล่อยตามสภาพ' },
  { value: 'REWORK', label: 'ทำซ้ำ / แปรรูปใหม่' },
  { value: 'SORT', label: 'คัดแยก' },
  { value: 'DOWNGRADE', label: 'ลดเกรด' },
  { value: 'RETURN_SUPPLIER', label: 'คืนผู้ขาย' },
  { value: 'DESTROY', label: 'ทำลาย' },
  { value: 'RECALL', label: 'เรียกคืน' },
]
export const DISPOSITION_TH = Object.fromEntries(DISPOSITION_OPTIONS.map((o) => [o.value, o.label]))

export const byCode = (arr) => Object.fromEntries(arr.map((x) => [x.code, x.label]))
export const codeOf = (arr, label) => (arr.find((x) => x.label === label) || {}).code || ''

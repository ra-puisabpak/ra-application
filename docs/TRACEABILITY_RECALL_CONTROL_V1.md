# Traceability & Recall Control V1

## Purpose
ควบคุมความสามารถในการสอบกลับ Product/Batch/Lot และเชื่อมเหตุการณ์ที่เกี่ยวข้องกับการผลิต การปล่อยสินค้า การกระจายสินค้า Hold, Withdrawal และ Recall

## Traceability chain
Raw Material / Ingredient → Production Batch → Packing / Finished Product → Release → Distribution

## Event control
ระบบรองรับเหตุการณ์ RECEIPT, PRODUCTION, PACKING, RELEASE, DISTRIBUTION, HOLD, WITHDRAWAL และ RECALL โดยแต่ละ link สามารถผูก Evidence ได้

## Recall control
Recall Case ต้องระบุ Product และ Batch/Lot ที่ได้รับผลกระทบ พร้อมสถานะ OPEN → ASSESSMENT → ACTION → VERIFICATION → CLOSED และสามารถเชื่อม Nonconformity/CAPA ได้

## Rules
- Traceability ที่จำเป็นต้องมี node/link ครบก่อนถือว่าสมบูรณ์
- หากข้อมูลสอบกลับไม่ครบ ให้สถานะ INCOMPLETE และระบุ node ที่ขาด
- Recall ต้องมี audit/evidence trail
- การกำหนดขอบเขต Batch/Lot ที่ได้รับผลกระทบต้องอ้างอิงข้อมูลจริงในระบบ ไม่อนุมาน
- โมดูลนี้ไม่กำหนด shelf life, critical limit หรือเกณฑ์กฎหมายใหม่

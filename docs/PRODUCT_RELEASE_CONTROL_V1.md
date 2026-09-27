# Product Release Control V1

## Purpose
ควบคุมการปล่อยสินค้า/Batch หลังจากผ่าน Regulatory Release Gate โดยเชื่อม Regulatory, QC, QA, Nonconformity/CAPA และ Traceability

## Release sequence
Product → Batch/Lot → Regulatory Release → QC Evidence → QA Review → Required Records → Nonconformity/CAPA Check → Traceability → Release Decision → Audit Evidence

## Control rules
- สินค้า/Batch ต้องระบุ Product ID และ Batch/Lot No.
- ต้องผ่าน Regulatory Release State = RELEASED ก่อนเข้าสู่การปล่อยสินค้า
- ต้องมีหลักฐาน QC ที่ตรวจสอบแล้ว
- ต้องมีการทบทวนโดย QA
- ต้องไม่มี Nonconformity หรือ CAPA ที่ยังเป็นอุปสรรคต่อการปล่อย
- ต้องมีข้อมูล Traceability ครบตามระบบที่กำหนด
- หากเงื่อนไขใดไม่ครบ ระบบต้องคงสถานะ HOLD และแสดง blocker
- การตัดสินใจปล่อยต้องสามารถตรวจสอบย้อนกลับได้ผ่าน Audit Evidence

## Scope
โมดูลนี้เป็น control contract ระดับระบบ ไม่กำหนด Critical Limit, Specification, Sampling Plan หรือเกณฑ์ทางกฎหมายใหม่ หากข้อมูลต้นทางไม่ได้กำหนดไว้

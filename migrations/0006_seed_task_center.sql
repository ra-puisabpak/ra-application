INSERT OR IGNORE INTO tasks (id, title, module, record_type, record_id, action, owner_id, due_date, status, priority)
SELECT 'task-bootstrap-ra-products', 'ตรวจ Product Master', 'REGULATORY_AFFAIRS', 'SYSTEM', 'PRODUCT_MASTER', 'REVIEW', id, date('now'), 'OPEN', 'NORMAL'
FROM users WHERE id = 'bootstrap-ra';

INSERT OR IGNORE INTO tasks (id, title, module, record_type, record_id, action, owner_id, due_date, status, priority)
SELECT 'task-bootstrap-qa-evidence', 'ตรวจหลักฐาน Evidence', 'QUALITY_ASSURANCE', 'SYSTEM', 'EVIDENCE', 'VERIFY', id, date('now'), 'OPEN', 'HIGH'
FROM users WHERE id = 'bootstrap-qa';

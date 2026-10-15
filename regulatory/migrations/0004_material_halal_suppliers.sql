-- additive columns on the shared raw-material master (applied to D1 ra-application on 2026-10-16)
ALTER TABLE ra_raw_material_master ADD COLUMN halal_status TEXT NOT NULL DEFAULT '';
ALTER TABLE ra_raw_material_master ADD COLUMN suppliers TEXT NOT NULL DEFAULT '';

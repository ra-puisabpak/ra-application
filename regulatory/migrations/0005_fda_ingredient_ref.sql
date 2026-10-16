-- Reference register of FDA (อย.) food ingredient names; read-only in the app.
-- The worker creates and seeds this table itself on first use (ensureFdaRef); this file documents the schema.
-- Source: Drive sheet FDA_Ingredient_List_Classified_NamPrik_2026-10-16 (sheets น้ำพริก-2 วัตถุดิบ + น้ำพริก-3 วัตถุเจือปน, 775 rows).
CREATE TABLE IF NOT EXISTS fda_ingredient_ref (
  fda_number TEXT PRIMARY KEY,
  name_th TEXT NOT NULL DEFAULT '', name_en TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT '', ins_no TEXT NOT NULL DEFAULT '',
  grp TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT ''
);
-- applied to D1 ra-application on 2026-10-16
ALTER TABLE ra_raw_material_master ADD COLUMN fda_ref_number TEXT NOT NULL DEFAULT '';

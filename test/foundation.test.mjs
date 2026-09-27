import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('D1 foundation stores controlled evidence and append-only audit events', async () => {
  const migration = await readFile(new URL('../migrations/0001_foundation.sql', import.meta.url), 'utf8');
  for (const table of ['products', 'evidence', 'audit_events', 'user_roles']) {
    assert.match(migration, new RegExp(`CREATE TABLE ${table}`));
  }
  assert.match(migration, /storage_key TEXT NOT NULL UNIQUE/);
  assert.match(migration, /CREATE INDEX audit_record_idx/);
});

test('Worker protects product routes with Cloudflare Access identity', async () => {
  const source = await readFile(new URL('../src/worker.ts', import.meta.url), 'utf8');
  assert.match(source, /cf-access-authenticated-user-email/);
  assert.match(source, /UNAUTHENTICATED/);
  assert.match(source, /env\.DB\.batch/);
});

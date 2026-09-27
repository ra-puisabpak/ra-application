import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import worker from '../.test-build/worker.js';

const context = { waitUntil() {}, passThroughOnException() {} };

function database({ user = null, roles = [], products = [], verifiedEvidenceCount = 0 } = {}) {
  return {
    prepare(query) {
      let values = [];
      const statement = {
        bind(...next) { values = next; return statement; },
        async first() {
          if (query.startsWith('SELECT id, email FROM users')) return user;
          if (query.startsWith('SELECT COUNT(*) AS count FROM evidence')) return { count: verifiedEvidenceCount };
          if (query.startsWith('SELECT id, revision, state FROM products')) return products.find((product) => product.id === values[0]) ?? null;
          if (query.startsWith('SELECT id, product_code')) return products.find((product) => product.id === values[0]) ?? null;
          return null;
        },
        async all() {
          if (query.startsWith('SELECT role, can_approve FROM user_roles')) return { results: roles.map((grant) => typeof grant === 'string' ? { role: grant, can_approve: 0 } : grant) };
          if (query.startsWith('SELECT id, product_code')) return { results: products };
          return { results: [] };
        },
        async run() { return { meta: { changes: 1 } }; },
      };
      return statement;
    },
    async batch() { return []; },
  };
}

test('D1 foundation stores controlled evidence and immutable audit events', async () => {
  const [migration, auditMigration, approvalMigration] = await Promise.all([
    readFile(new URL('../migrations/0001_foundation.sql', import.meta.url), 'utf8'),
    readFile(new URL('../migrations/0002_immutable_audit_events.sql', import.meta.url), 'utf8'),
    readFile(new URL('../migrations/0003_product_approval_workflow.sql', import.meta.url), 'utf8'),
  ]);
  for (const table of ['products', 'evidence', 'audit_events', 'user_roles']) assert.match(migration, new RegExp(`CREATE TABLE ${table}`));
  assert.match(auditMigration, /CREATE TRIGGER audit_events_no_update/);
  assert.match(auditMigration, /CREATE TRIGGER audit_events_no_delete/);
  assert.match(approvalMigration, /CREATE TABLE approval_steps/);
  assert.match(approvalMigration, /status IN \('WAITING', 'PENDING', 'APPROVED', 'REJECTED', 'RETURNED'\)/);
});

test('product submission is blocked until its current revision has verified evidence', async () => {
  const product = { id: '00000000-0000-4000-8000-000000000001', revision: '01', state: 'DRAFT' };
  const DB = database({ user: { id: 'user-1', email: 'ra@example.com' }, roles: [{ role: 'RA', can_approve: 1 }], products: [product] });
  const response = await worker.fetch(new Request(`https://ra.example/products/${product.id}/submit`, { method: 'POST', headers: { 'cf-access-authenticated-user-email': 'ra@example.com' } }), { DB, EVIDENCE: {} }, context);
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error.code, 'VERIFIED_EVIDENCE_REQUIRED');
});

test('protected endpoints reject an unknown Cloudflare Access identity', async () => {
  const response = await worker.fetch(new Request('https://ra.example/products', { headers: { 'cf-access-authenticated-user-email': 'unknown@example.com' } }), { DB: database(), EVIDENCE: {} }, context);
  assert.equal(response.status, 401);
});

test('product list resolves authorization and data from D1', async () => {
  const DB = database({
    user: { id: 'user-1', email: 'ra@example.com' }, roles: ['RA'],
    products: [{ id: 'product-1', product_code: 'PSP-001', thai_name: 'น้ำพริก', english_name: null, site_id: 'K9', revision: '01', state: 'DRAFT', version: 1 }],
  });
  const response = await worker.fetch(new Request('https://ra.example/products', { headers: { 'cf-access-authenticated-user-email': 'ra@example.com' } }), { DB, EVIDENCE: {} }, context);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload.data, [{ id: 'product-1', productCode: 'PSP-001', thaiName: 'น้ำพริก', englishName: null, siteId: 'K9', revision: '01', state: 'DRAFT', version: 1 }]);
});

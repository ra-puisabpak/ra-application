export interface Env {
  DB: D1Database;
  EVIDENCE: R2Bucket;
}

type Actor = { id: string; roles: string[] };
type Product = { id: string; productCode: string; thaiName: string; englishName: string | null; siteId: string; revision: string; state: string; version: number };

const json = (value: unknown, status = 200): Response =>
  new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

const requestId = (request: Request): string => request.headers.get('cf-ray') ?? crypto.randomUUID();

const actorFrom = (request: Request): Actor | null => {
  const id = request.headers.get('cf-access-authenticated-user-email');
  const roles = request.headers.get('cf-access-roles');
  if (!id || !roles) return null;
  return { id, roles: roles.split(',').map((role) => role.trim()).filter(Boolean) };
};

const requireRole = (actor: Actor, permitted: string[]): boolean => actor.roles.some((role) => permitted.includes(role));

const productFromRow = (row: Record<string, unknown>): Product => ({
  id: String(row.id), productCode: String(row.product_code), thaiName: String(row.thai_name),
  englishName: row.english_name === null ? null : String(row.english_name), siteId: String(row.site_id),
  revision: String(row.revision), state: String(row.state), version: Number(row.version),
});

async function audit(env: Env, actor: Actor, id: string, action: string, recordType: string, recordId: string, role: string): Promise<void> {
  await env.DB.prepare('INSERT INTO audit_events (id, actor_id, actor_role, action, module, record_type, record_id, request_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), actor.id, role, action, 'REGULATORY_AFFAIRS', recordType, recordId, id).run();
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const id = requestId(request);
    if (request.method === 'GET' && url.pathname === '/health') return json({ ok: true, requestId: id });

    const actor = actorFrom(request);
    if (!actor) return json({ error: { code: 'UNAUTHENTICATED', message: 'Cloudflare Access identity and roles are required' }, requestId: id }, 401);
    if (request.method === 'GET' && url.pathname === '/auth/me') return json({ data: actor, requestId: id });

    if (request.method === 'GET' && url.pathname === '/products') {
      const rows = await env.DB.prepare('SELECT id, product_code, thai_name, english_name, site_id, revision, state, version FROM products ORDER BY product_code').all<Record<string, unknown>>();
      return json({ data: rows.results.map(productFromRow), requestId: id });
    }
    if (request.method === 'POST' && url.pathname === '/products') {
      if (!requireRole(actor, ['RA', 'R&D'])) return json({ error: { code: 'FORBIDDEN', message: 'RA or R&D role required' }, requestId: id }, 403);
      const body = await request.json() as { productCode?: string; thaiName?: string; englishName?: string; siteId?: string };
      if (!body.productCode?.trim() || !body.thaiName?.trim() || !body.siteId?.trim()) return json({ error: { code: 'VALIDATION_ERROR', message: 'productCode, thaiName and siteId are required' }, requestId: id }, 400);
      const productId = crypto.randomUUID();
      await env.DB.batch([
        env.DB.prepare('INSERT INTO products (id, product_code, thai_name, english_name, site_id, created_by) VALUES (?, ?, ?, ?, ?, ?)').bind(productId, body.productCode.trim(), body.thaiName.trim(), body.englishName?.trim() || null, body.siteId.trim(), actor.id),
        env.DB.prepare('INSERT INTO audit_events (id, actor_id, actor_role, action, module, record_type, record_id, request_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), actor.id, actor.roles[0], 'CREATE', 'REGULATORY_AFFAIRS', 'PRODUCT', productId, id),
      ]);
      const created = await env.DB.prepare('SELECT id, product_code, thai_name, english_name, site_id, revision, state, version FROM products WHERE id = ?').bind(productId).first<Record<string, unknown>>();
      return json({ data: productFromRow(created!), requestId: id }, 201);
    }

    const upload = url.pathname.match(/^\/files\/upload\/([a-f0-9-]+)$/);
    if (request.method === 'PUT' && upload) {
      if (!requireRole(actor, ['RA', 'QA', 'QC', 'DCC', 'R&D'])) return json({ error: { code: 'FORBIDDEN', message: 'Evidence upload role required' }, requestId: id }, 403);
      const evidence = await env.DB.prepare('SELECT storage_key FROM evidence WHERE id = ?').bind(upload[1]).first<{ storage_key: string }>();
      if (!evidence) return json({ error: { code: 'NOT_FOUND', message: 'Evidence record not found' }, requestId: id }, 404);
      await env.EVIDENCE.put(evidence.storage_key, request.body, { httpMetadata: { contentType: request.headers.get('content-type') ?? 'application/octet-stream' } });
      await env.DB.prepare("UPDATE evidence SET verification_status = 'PENDING_VERIFICATION', size_bytes = ? WHERE id = ?").bind(Number(request.headers.get('content-length')) || null, upload[1]).run();
      await audit(env, actor, id, 'UPLOAD', 'EVIDENCE', upload[1], actor.roles[0]);
      return json({ data: { evidenceId: upload[1], status: 'PENDING_VERIFICATION' }, requestId: id });
    }
    return json({ error: { code: 'NOT_FOUND', message: 'Route not found' }, requestId: id }, 404);
  },
} satisfies ExportedHandler<Env>;

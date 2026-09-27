export interface Env {
  DB: D1Database;
  EVIDENCE: R2Bucket;
  ASSETS: Fetcher;
}

type RoleGrant = { role: string; canApprove: boolean };
type Actor = { id: string; email: string; roles: RoleGrant[] };
type Product = { id: string; productCode: string; thaiName: string; englishName: string | null; siteId: string; revision: string; state: string; version: number };
type ProductInput = { productCode?: string; thaiName?: string; englishName?: string; siteId?: string; expectedVersion?: number };
type EvidenceInput = { recordType?: string; recordId?: string; title?: string; revision?: string; contentType?: string };
type DecisionInput = { comment?: string };

const json = (value: unknown, status = 200): Response => new Response(JSON.stringify(value), {
  status, headers: { 'content-type': 'application/json; charset=utf-8' },
});
const requestId = (request: Request): string => request.headers.get('cf-ray') ?? crypto.randomUUID();
const actorRole = (actor: Actor): string => actor.roles[0]?.role ?? 'UNKNOWN';
const requireRole = (actor: Actor, permitted: string[]): boolean => actor.roles.some((grant) => permitted.includes(grant.role));

const productFromRow = (row: Record<string, unknown>): Product => ({
  id: String(row.id), productCode: String(row.product_code), thaiName: String(row.thai_name),
  englishName: row.english_name === null ? null : String(row.english_name), siteId: String(row.site_id),
  revision: String(row.revision), state: String(row.state), version: Number(row.version),
});

async function authenticatedActor(request: Request, env: Env): Promise<Actor | null> {
  const email = request.headers.get('cf-access-authenticated-user-email')?.trim().toLowerCase();
  if (!email) return null;
  const user = await env.DB.prepare('SELECT id, email FROM users WHERE email = ? AND active = 1').bind(email).first<{ id: string; email: string }>();
  if (!user) return null;
  const roles = await env.DB.prepare('SELECT role, can_approve FROM user_roles WHERE user_id = ?').bind(user.id).all<{ role: string; can_approve: number }>();
  return { id: user.id, email: user.email, roles: roles.results.map((row) => ({ role: row.role, canApprove: row.can_approve === 1 })) };
}

async function hasVerifiedEvidence(env: Env, recordType: string, recordId: string, revision: string): Promise<boolean> {
  const row = await env.DB.prepare("SELECT COUNT(*) AS count FROM evidence WHERE record_type = ? AND record_id = ? AND revision = ? AND verification_status = 'VERIFIED'")
    .bind(recordType, recordId, revision).first<{ count: number }>();
  return (row?.count ?? 0) > 0;
}

async function audit(env: Env, actor: Actor, id: string, action: string, recordType: string, recordId: string, previousState?: string, newState?: string): Promise<void> {
  await env.DB.prepare('INSERT INTO audit_events (id, actor_id, actor_role, action, module, record_type, record_id, previous_state, new_state, request_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), actor.id, actorRole(actor), action, 'REGULATORY_AFFAIRS', recordType, recordId, previousState ?? null, newState ?? null, id).run();
}

const protectedRoute = (actor: Actor | null, id: string): Response | null => actor
  ? null
  : json({ error: { code: 'UNAUTHENTICATED', message: 'An active Cloudflare Access user is required' }, requestId: id }, 401);

async function body<T>(request: Request): Promise<T | null> {
  try { return await request.json() as T; } catch { return null; }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const id = requestId(request);
    if (request.method === 'GET' && url.pathname === '/health') return json({ ok: true, requestId: id });

    // Static UI assets remain publicly renderable; application APIs below require Access identity.\n    if (env.ASSETS && (request.method === 'GET' || request.method === 'HEAD') && !url.pathname.startsWith('/auth/') && !url.pathname.startsWith('/products') && !url.pathname.startsWith('/evidence') && !url.pathname.startsWith('/files/') && !url.pathname.startsWith('/approvals/') && !url.pathname.startsWith('/tasks') && !url.pathname.startsWith('/dashboard')) {\n      return env.ASSETS.fetch(request);\n    }\n\n    const actor = await authenticatedActor(request, env);\n    const unauthorized = protectedRoute(actor, id);
    if (unauthorized || !actor) return unauthorized!;
    if (request.method === 'GET' && url.pathname === '/auth/me') return json({ data: actor, requestId: id });

    if (request.method === 'GET' && url.pathname === '/tasks') {
      const rows = await env.DB.prepare(`SELECT t.id, t.title, t.module, t.record_type, t.record_id, t.action, t.due_date, t.status, t.priority,
        CASE WHEN t.due_date IS NOT NULL AND t.due_date < date('now') AND t.status NOT IN ('COMPLETED','CANCELLED') THEN 1 ELSE 0 END AS overdue
        FROM tasks t WHERE t.owner_id = ? ORDER BY overdue DESC, CASE t.priority WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'NORMAL' THEN 3 ELSE 4 END, t.due_date`).bind(actor.id).all();
      return json({ data: rows.results, requestId: id });
    }

    const taskRoute = url.pathname.match(/^\/tasks\/([a-f0-9-]+)$/);
    if (taskRoute) {
      const task = await env.DB.prepare(`SELECT id, title, module, record_type, record_id, action, owner_id, due_date, status, priority, created_at, updated_at, completed_at
        FROM tasks WHERE id = ? AND owner_id = ?`).bind(taskRoute[1], actor.id).first<Record<string, unknown>>();
      if (!task) return json({ error: { code: 'NOT_FOUND', message: 'Task not found' }, requestId: id }, 404);
      return json({ data: task, requestId: id });
    }

    const taskAction = url.pathname.match(/^\/tasks\/([a-f0-9-]+)\/(start|complete|cancel)$/);
    if (request.method === 'POST' && taskAction) {
      const task = await env.DB.prepare('SELECT id, status, owner_id FROM tasks WHERE id = ?').bind(taskAction[1]).first<{ id: string; status: string; owner_id: string }>();
      if (!task) return json({ error: { code: 'NOT_FOUND', message: 'Task not found' }, requestId: id }, 404);
      if (task.owner_id !== actor.id) return json({ error: { code: 'FORBIDDEN', message: 'Task owner required' }, requestId: id }, 403);
      const action = taskAction[2];
      const next = action === 'start' ? 'IN_PROGRESS' : action === 'complete' ? 'COMPLETED' : 'CANCELLED';
      if (task.status === 'COMPLETED' || task.status === 'CANCELLED') return json({ error: { code: 'INVALID_STATE', message: 'Task is already closed' }, requestId: id }, 409);
      await env.DB.prepare('UPDATE tasks SET status = ?, completed_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .bind(next, next === 'COMPLETED' || next === 'CANCELLED' ? new Date().toISOString() : null, task.id).run();
      await audit(env, actor, id, action.toUpperCase(), 'TASK_CENTER', task.id, task.status, next);
      return json({ data: { taskId: task.id, status: next }, requestId: id });
    }

    if (request.method === 'GET' && url.pathname === '/dashboard') {
      const productStates = await env.DB.prepare('SELECT state, COUNT(*) AS count FROM products GROUP BY state ORDER BY state').all();
      const taskStates = await env.DB.prepare('SELECT status, COUNT(*) AS count FROM tasks WHERE owner_id = ? GROUP BY status ORDER BY status').bind(actor.id).all();
      const evidenceStates = await env.DB.prepare('SELECT verification_status AS status, COUNT(*) AS count FROM evidence GROUP BY verification_status ORDER BY verification_status').all();
      const pendingApprovals = await env.DB.prepare("SELECT COUNT(*) AS count FROM approval_steps WHERE status = 'PENDING' AND required_role IN (SELECT role FROM user_roles WHERE user_id = ? AND can_approve = 1)").bind(actor.id).first();
      return json({ data: {
        products: productStates.results,
        myTasks: taskStates.results,
        evidence: evidenceStates.results,
        pendingApprovals: Number(pendingApprovals?.count ?? 0)
      }, requestId: id });
    }

    if (request.method === 'GET' && url.pathname === '/products') {
      const rows = await env.DB.prepare('SELECT id, product_code, thai_name, english_name, site_id, revision, state, version FROM products ORDER BY product_code').all<Record<string, unknown>>();
      return json({ data: rows.results.map(productFromRow), requestId: id });
    }
    if (request.method === 'POST' && url.pathname === '/products') {
      if (!requireRole(actor, ['RA', 'R&D'])) return json({ error: { code: 'FORBIDDEN', message: 'RA or R&D role required' }, requestId: id }, 403);
      const input = await body<ProductInput>(request);
      if (!input?.productCode?.trim() || !input.thaiName?.trim() || !input.siteId?.trim()) return json({ error: { code: 'VALIDATION_ERROR', message: 'productCode, thaiName and siteId are required' }, requestId: id }, 400);
      const productId = crypto.randomUUID();
      try {
        await env.DB.batch([
          env.DB.prepare('INSERT INTO products (id, product_code, thai_name, english_name, site_id, created_by) VALUES (?, ?, ?, ?, ?, ?)').bind(productId, input.productCode.trim(), input.thaiName.trim(), input.englishName?.trim() || null, input.siteId.trim(), actor.id),
          env.DB.prepare('INSERT INTO audit_events (id, actor_id, actor_role, action, module, record_type, record_id, new_state, request_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), actor.id, actorRole(actor), 'CREATE', 'REGULATORY_AFFAIRS', 'PRODUCT', productId, 'DRAFT', id),
        ]);
      } catch { return json({ error: { code: 'CONFLICT', message: 'Product code already exists or the record could not be created' }, requestId: id }, 409); }
      const created = await env.DB.prepare('SELECT id, product_code, thai_name, english_name, site_id, revision, state, version FROM products WHERE id = ?').bind(productId).first<Record<string, unknown>>();
      return json({ data: productFromRow(created!), requestId: id }, 201);
    }

    const productRoute = url.pathname.match(/^\/products\/([a-f0-9-]+)$/);
    if (productRoute) {
      const productId = productRoute[1];
      const existing = await env.DB.prepare('SELECT id, product_code, thai_name, english_name, site_id, revision, state, version FROM products WHERE id = ?').bind(productId).first<Record<string, unknown>>();
      if (!existing) return json({ error: { code: 'NOT_FOUND', message: 'Product not found' }, requestId: id }, 404);
      if (request.method === 'GET') return json({ data: productFromRow(existing), requestId: id });
      if (request.method === 'PATCH') {
        if (!requireRole(actor, ['RA', 'R&D'])) return json({ error: { code: 'FORBIDDEN', message: 'RA or R&D role required' }, requestId: id }, 403);
        const input = await body<ProductInput>(request);
        const product = productFromRow(existing);
        if (!input || input.expectedVersion !== product.version) return json({ error: { code: 'CONFLICT', message: 'expectedVersion must match the current product version' }, requestId: id }, 409);
        if (product.state !== 'DRAFT' && product.state !== 'RETURNED') return json({ error: { code: 'INVALID_STATE', message: 'Only DRAFT or RETURNED products can be edited' }, requestId: id }, 409);
        const updated = await env.DB.prepare('UPDATE products SET product_code = ?, thai_name = ?, english_name = ?, site_id = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND version = ?')
          .bind(input.productCode?.trim() || product.productCode, input.thaiName?.trim() || product.thaiName, input.englishName?.trim() || null, input.siteId?.trim() || product.siteId, productId, product.version).run();
        if (!updated.meta.changes) return json({ error: { code: 'CONFLICT', message: 'Product was updated by another request' }, requestId: id }, 409);
        await audit(env, actor, id, 'UPDATE', 'PRODUCT', productId, product.state, product.state);
        const saved = await env.DB.prepare('SELECT id, product_code, thai_name, english_name, site_id, revision, state, version FROM products WHERE id = ?').bind(productId).first<Record<string, unknown>>();
        return json({ data: productFromRow(saved!), requestId: id });
      }
    }

    const submit = url.pathname.match(/^\/products\/([a-f0-9-]+)\/submit$/);
    if (request.method === 'POST' && submit) {
      if (!requireRole(actor, ['RA', 'R&D'])) return json({ error: { code: 'FORBIDDEN', message: 'RA or R&D role required' }, requestId: id }, 403);
      const product = await env.DB.prepare('SELECT id, revision, state FROM products WHERE id = ?').bind(submit[1]).first<{ id: string; revision: string; state: string }>();
      if (!product) return json({ error: { code: 'NOT_FOUND', message: 'Product not found' }, requestId: id }, 404);
      if (product.state !== 'DRAFT' && product.state !== 'RETURNED') return json({ error: { code: 'INVALID_STATE', message: 'Only DRAFT or RETURNED products can be submitted' }, requestId: id }, 409);
      if (!await hasVerifiedEvidence(env, 'PRODUCT', product.id, product.revision)) return json({ error: { code: 'VERIFIED_EVIDENCE_REQUIRED', message: 'At least one verified evidence record is required' }, requestId: id }, 409);
      await env.DB.batch([
        env.DB.prepare("UPDATE products SET state = 'PENDING_APPROVAL', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(product.id),
        env.DB.prepare("INSERT INTO approval_steps (id, record_type, record_id, revision, sequence, required_role, status) VALUES (?, 'PRODUCT', ?, ?, 1, 'RA', 'PENDING')").bind(crypto.randomUUID(), product.id, product.revision),
        env.DB.prepare("INSERT INTO approval_steps (id, record_type, record_id, revision, sequence, required_role, status) VALUES (?, 'PRODUCT', ?, ?, 2, 'MANAGEMENT', 'WAITING')").bind(crypto.randomUUID(), product.id, product.revision),
        env.DB.prepare('INSERT INTO audit_events (id, actor_id, actor_role, action, module, record_type, record_id, previous_state, new_state, request_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), actor.id, actorRole(actor), 'SUBMIT', 'REGULATORY_AFFAIRS', 'PRODUCT', product.id, product.state, 'PENDING_APPROVAL', id),
      ]);
      return json({ data: { productId: product.id, revision: product.revision, state: 'PENDING_APPROVAL' }, requestId: id });
    }

    if (request.method === 'POST' && url.pathname === '/evidence') {
      if (!requireRole(actor, ['RA', 'QA', 'QC', 'DCC', 'R&D'])) return json({ error: { code: 'FORBIDDEN', message: 'Evidence upload role required' }, requestId: id }, 403);
      const input = await body<EvidenceInput>(request);
      if (!input?.recordType || !input.recordId || !input.title?.trim() || !input.revision?.trim() || !input.contentType?.trim()) return json({ error: { code: 'VALIDATION_ERROR', message: 'recordType, recordId, title, revision and contentType are required' }, requestId: id }, 400);
      if (input.recordType !== 'PRODUCT' || !await env.DB.prepare('SELECT id FROM products WHERE id = ?').bind(input.recordId).first()) return json({ error: { code: 'VALIDATION_ERROR', message: 'Evidence must reference an existing PRODUCT record' }, requestId: id }, 400);
      const evidenceId = crypto.randomUUID();
      const storageKey = `evidence/${input.recordType}/${input.recordId}/${evidenceId}`;
      await env.DB.batch([
        env.DB.prepare('INSERT INTO evidence (id, record_type, record_id, title, revision, storage_key, content_type, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(evidenceId, input.recordType, input.recordId, input.title.trim(), input.revision.trim(), storageKey, input.contentType.trim(), actor.id),
        env.DB.prepare('INSERT INTO audit_events (id, actor_id, actor_role, action, module, record_type, record_id, request_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), actor.id, actorRole(actor), 'CREATE', 'REGULATORY_AFFAIRS', 'EVIDENCE', evidenceId, id),
      ]);
      return json({ data: { id: evidenceId, uploadUrl: `/files/upload/${evidenceId}`, status: 'UPLOADED' }, requestId: id }, 201);
    }

    const upload = url.pathname.match(/^\/files\/upload\/([a-f0-9-]+)$/);
    if (request.method === 'PUT' && upload) {
      if (!requireRole(actor, ['RA', 'QA', 'QC', 'DCC', 'R&D'])) return json({ error: { code: 'FORBIDDEN', message: 'Evidence upload role required' }, requestId: id }, 403);
      const evidence = await env.DB.prepare('SELECT storage_key FROM evidence WHERE id = ? AND uploaded_by = ?').bind(upload[1], actor.id).first<{ storage_key: string }>();
      if (!evidence) return json({ error: { code: 'NOT_FOUND', message: 'Evidence record not found or not owned by actor' }, requestId: id }, 404);
      const bytes = await request.arrayBuffer();
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      const checksum = Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, '0')).join('');
      await env.EVIDENCE.put(evidence.storage_key, bytes, { httpMetadata: { contentType: request.headers.get('content-type') ?? 'application/octet-stream' } });
      await env.DB.prepare("UPDATE evidence SET verification_status = 'PENDING_VERIFICATION', size_bytes = ?, checksum = ? WHERE id = ?").bind(bytes.byteLength, checksum, upload[1]).run();
      await audit(env, actor, id, 'UPLOAD', 'EVIDENCE', upload[1]);
      return json({ data: { evidenceId: upload[1], status: 'PENDING_VERIFICATION' }, requestId: id });
    }

    const verify = url.pathname.match(/^\/evidence\/([a-f0-9-]+)\/verify$/);
    if (request.method === 'PATCH' && verify) {
      if (!requireRole(actor, ['RA', 'QA'])) return json({ error: { code: 'FORBIDDEN', message: 'RA or QA role required' }, requestId: id }, 403);
      const evidence = await env.DB.prepare('SELECT verification_status FROM evidence WHERE id = ?').bind(verify[1]).first<{ verification_status: string }>();
      if (!evidence) return json({ error: { code: 'NOT_FOUND', message: 'Evidence not found' }, requestId: id }, 404);
      if (evidence.verification_status !== 'PENDING_VERIFICATION') return json({ error: { code: 'INVALID_STATE', message: 'Only uploaded evidence can be verified' }, requestId: id }, 409);
      await env.DB.prepare("UPDATE evidence SET verification_status = 'VERIFIED', verified_by = ?, verified_at = CURRENT_TIMESTAMP WHERE id = ?").bind(actor.id, verify[1]).run();
      await audit(env, actor, id, 'VERIFY', 'EVIDENCE', verify[1], evidence.verification_status, 'VERIFIED');
      return json({ data: { evidenceId: verify[1], status: 'VERIFIED' }, requestId: id });
    }

    const decision = url.pathname.match(/^\/approvals\/PRODUCT\/([a-f0-9-]+)\/(approve|reject|return)$/);
    if (request.method === 'POST' && decision) {
      const [productId, action] = [decision[1], decision[2]];
      const product = await env.DB.prepare('SELECT id, revision, state FROM products WHERE id = ?').bind(productId).first<{ id: string; revision: string; state: string }>();
      if (!product) return json({ error: { code: 'NOT_FOUND', message: 'Product not found' }, requestId: id }, 404);
      if (product.state !== 'PENDING_APPROVAL') return json({ error: { code: 'INVALID_STATE', message: 'Product is not pending approval' }, requestId: id }, 409);
      const step = await env.DB.prepare("SELECT id, required_role, status, sequence, revision FROM approval_steps WHERE record_type = 'PRODUCT' AND record_id = ? AND revision = ? AND status = 'PENDING' ORDER BY sequence LIMIT 1")
        .bind(productId, product.revision).first<{ id: string; required_role: string; status: string; sequence: number; revision: string }>();
      if (!step) return json({ error: { code: 'APPROVAL_STEP_REQUIRED', message: 'No pending approval step exists' }, requestId: id }, 409);
      if (!actor.roles.some((grant) => grant.role === step.required_role && grant.canApprove)) return json({ error: { code: 'APPROVER_NOT_AUTHORIZED', message: 'Actor cannot decide this approval step' }, requestId: id }, 403);
      if (!await hasVerifiedEvidence(env, 'PRODUCT', product.id, product.revision)) return json({ error: { code: 'VERIFIED_EVIDENCE_REQUIRED', message: 'Verified evidence is required at approval' }, requestId: id }, 409);
      const input = await body<DecisionInput>(request);
      if ((action === 'reject' || action === 'return') && !input?.comment?.trim()) return json({ error: { code: 'VALIDATION_ERROR', message: 'A comment is required for reject or return' }, requestId: id }, 400);
      if (action === 'approve') {
        const next = await env.DB.prepare("SELECT id FROM approval_steps WHERE record_type = 'PRODUCT' AND record_id = ? AND revision = ? AND status = 'WAITING' ORDER BY sequence LIMIT 1")
          .bind(productId, product.revision).first<{ id: string }>();
        const nextState = next ? 'PENDING_APPROVAL' : 'APPROVED';
        const statements = [
          env.DB.prepare("UPDATE approval_steps SET status = 'APPROVED', approver_id = ?, decided_at = CURRENT_TIMESTAMP, comment = ? WHERE id = ? AND status = 'PENDING'").bind(actor.id, input?.comment?.trim() || null, step.id),
          env.DB.prepare('UPDATE products SET state = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(nextState, productId),
          env.DB.prepare('INSERT INTO audit_events (id, actor_id, actor_role, action, module, record_type, record_id, previous_state, new_state, request_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), actor.id, actorRole(actor), 'APPROVE', 'REGULATORY_AFFAIRS', 'PRODUCT', productId, product.state, nextState, id),
        ];
        if (next) statements.splice(1, 0, env.DB.prepare("UPDATE approval_steps SET status = 'PENDING' WHERE id = ? AND status = 'WAITING'").bind(next.id));
        await env.DB.batch(statements);
        return json({ data: { productId, state: nextState, nextApprovalStep: next ? 'PENDING' : null }, requestId: id });
      }
      const terminalState = action === 'reject' ? 'REJECTED' : 'RETURNED';
      await env.DB.batch([
        env.DB.prepare('UPDATE approval_steps SET status = ?, approver_id = ?, decided_at = CURRENT_TIMESTAMP, comment = ? WHERE id = ? AND status = ?').bind(terminalState, actor.id, input!.comment!.trim(), step.id, 'PENDING'),
        env.DB.prepare('UPDATE products SET state = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(terminalState, productId),
        env.DB.prepare('INSERT INTO audit_events (id, actor_id, actor_role, action, module, record_type, record_id, previous_state, new_state, reason, request_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), actor.id, actorRole(actor), action.toUpperCase(), 'REGULATORY_AFFAIRS', 'PRODUCT', productId, product.state, terminalState, input!.comment!.trim(), id),
      ]);
      return json({ data: { productId, state: terminalState }, requestId: id });
    }
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return json({ error: { code: 'NOT_FOUND', message: 'Route not found' }, requestId: id }, 404);
  },
} satisfies ExportedHandler<Env>;

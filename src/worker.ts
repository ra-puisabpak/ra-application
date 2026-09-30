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
type SessionData = { userId: string; email: string; roles: RoleGrant[] };

async function hashPassword(password: string): Promise<string> {
  const data = new TextEncoder().encode(password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function hashSessionToken(token: string): Promise<string> {
  return hashPassword(token);
}

function getSessionToken(request: Request): string | null {
  return request.headers.get('cookie')?.split(';').map((part) => part.trim())
    .find((part) => part.startsWith('session='))?.slice('session='.length) || null;
}

async function actorFromSession(request: Request, env: Env): Promise<Actor | null> {
  const token = getSessionToken(request);
  if (!token) return null;
  try {
    const tokenHash = await hashSessionToken(token);
    const session = await env.DB.prepare(
      'SELECT user_id FROM auth_sessions WHERE token_hash = ? AND expires_at > CURRENT_TIMESTAMP'
    ).bind(tokenHash).first<{ user_id: string }>();
    if (!session) return null;
    const user = await env.DB.prepare('SELECT id, email FROM users WHERE id = ? AND active = 1')
      .bind(session.user_id).first<{ id: string; email: string }>();
    if (!user) return null;
    const roles = await env.DB.prepare('SELECT role, can_approve FROM user_roles WHERE user_id = ?')
      .bind(user.id).all<{ role: string; can_approve: number }>();
    return {
      id: user.id,
      email: user.email,
      roles: roles.results.map((row) => ({ role: row.role, canApprove: row.can_approve === 1 })),
    };
  } catch (error) {
    console.error('SESSION_LOOKUP_FAILED', error);
    return null;
  }
}

type Ingredient = { ingredient_name: string; percentage: number };
type FormulaInput = { formula_code?: string; formula_name?: string; ingredients_json?: Ingredient[] };
type FormulaRow = { id: string; product_id: string; formula_code: string; formula_name: string; ingredients_json: string; validation_score: number; validation_status: string; created_at?: string; updated_at?: string };

function validateFormulaIngredients(ingredients: unknown): { isValid: boolean; score: number; errors: string[] } {
  const errors: string[] = [];
  if (!Array.isArray(ingredients)) return { isValid: false, score: 0, errors: ['Ingredients must be an array'] };
  if (ingredients.length === 0) return { isValid: false, score: 0, errors: ['At least one ingredient is required'] };
  let totalPercentage = 0;
  for (let index = 0; index < ingredients.length; index++) {
    const item = ingredients[index] as Record<string, unknown>;
    if (!item.ingredient_name || typeof item.ingredient_name !== 'string' || !item.ingredient_name.trim()) errors.push('Ingredient ' + (index + 1) + ': ingredient_name is required');
    if (item.percentage === undefined || item.percentage === null) errors.push('Ingredient ' + (index + 1) + ': percentage is required');
    else if (typeof item.percentage !== 'number' || Number.isNaN(item.percentage) || item.percentage < 0) errors.push('Ingredient ' + (index + 1) + ': percentage must be a non-negative number');
    else totalPercentage += Number(item.percentage);
  }
  const score = totalPercentage === 100 ? 100 : Math.round(totalPercentage);
  const isValid = errors.length === 0 && totalPercentage === 100;
  if (!isValid && totalPercentage !== 100) errors.push('Total percentage is ' + totalPercentage + '%, must be exactly 100%');
  return { isValid, score, errors };
}
function parseIngredientsJson(jsonString: string): Ingredient[] | null {
  try {
    const parsed = JSON.parse(jsonString);
    if (!Array.isArray(parsed)) return null;
    const valid = parsed.every((item) => item && typeof item.ingredient_name === 'string' && typeof item.percentage === 'number' && !Number.isNaN(item.percentage));
    return valid ? (parsed as Ingredient[]) : null;
  } catch { return null; }
}


const previewActor: Actor = { id: 'preview', email: 'preview@puisabpak.local', roles: [] };

const json = (value: unknown, status = 200): Response => new Response(JSON.stringify(value), {
  status, headers: { 'content-type': 'application/json; charset=utf-8' },
});
const requestId = (request: Request): string => request.headers.get('cf-ray') ?? crypto.randomUUID();
const actorRole = (actor: Actor): string => actor.roles[0]?.role ?? 'PREVIEW';
const requireRole = (actor: Actor, permitted: string[]): boolean => actor.roles.some((grant) => permitted.includes(grant.role));
const isApiRoute = (pathname: string): boolean => [
  '/auth/',
  '/products',
  '/evidence',
  '/files/',
  '/approvals/',
  '/tasks',
  '/dashboard',
].some((prefix) => pathname === prefix || pathname.startsWith(prefix));

const productFromRow = (row: Record<string, unknown>): Product => ({
  id: String(row.id), productCode: String(row.product_code), thaiName: String(row.thai_name),
  englishName: row.english_name === null ? null : String(row.english_name), siteId: String(row.site_id),
  revision: String(row.revision), state: String(row.state), version: Number(row.version),
});

async function authenticatedActor(request: Request, env: Env): Promise<Actor | null> {
  const email = request.headers.get('cf-access-authenticated-user-email')?.trim().toLowerCase();

  if (email) {
    try {
      const user = await env.DB.prepare('SELECT id, email FROM users WHERE email = ? AND active = 1').bind(email).first<{ id: string; email: string }>();
      if (user) {
        const roles = await env.DB.prepare('SELECT role, can_approve FROM user_roles WHERE user_id = ?').bind(user.id).all<{ role: string; can_approve: number }>();
        return {
          id: user.id,
          email: user.email,
          roles: roles.results.map((row) => ({ role: row.role, canApprove: row.can_approve === 1 })),
        };
      }
    } catch (error) {
      console.error('AUTH_LOOKUP_FAILED', { email, error });
    }
  }

  return actorFromSession(request, env);
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
  : json({ error: { code: 'UNAUTHENTICATED', message: 'Authenticated user required for write actions' }, requestId: id }, 401);

async function body<T>(request: Request): Promise<T | null> {
  try { return await request.json() as T; } catch { return null; }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const id = requestId(request);

    if (request.method === 'GET' && url.pathname === '/health') return json({ ok: true, requestId: id });

    if (env.ASSETS && (request.method === 'GET' || request.method === 'HEAD')) {
      if (!isApiRoute(url.pathname)) {
        const assetUrl = url.pathname === '/' ? new URL('/index.html', request.url) : new URL(url.pathname, request.url);
        const assetRequest = new Request(assetUrl, request);
        try {
          const asset = await env.ASSETS.fetch(assetRequest);
          if (asset.status !== 404) return asset;
        } catch (error) {
          console.error('ASSET_FETCH_FAILED', { pathname: url.pathname, error });
        }

        if (url.pathname === '/') {
          const rootIndex = new Request(new URL('/index.html', request.url), request);
          return env.ASSETS.fetch(rootIndex);
        }
      }
    }


    if (request.method === 'POST' && url.pathname === '/auth/login') {
      const input = await body<{ email?: string; password?: string }>(request);
      if (!input?.email?.trim() || !input.password) {
        return json({ error: { code: 'VALIDATION_ERROR', message: 'email and password are required' }, requestId: id }, 400);
      }
      try {
        const user = await env.DB.prepare('SELECT id, email, password_hash FROM users WHERE email = ? AND active = 1')
          .bind(input.email.toLowerCase().trim()).first<{ id: string; email: string; password_hash: string | null }>();
        if (!user?.password_hash || (await hashPassword(input.password)) !== user.password_hash) {
          return json({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' }, requestId: id }, 401);
        }
        const roles = await env.DB.prepare('SELECT role, can_approve FROM user_roles WHERE user_id = ?')
          .bind(user.id).all<{ role: string; can_approve: number }>();
        const token = crypto.randomUUID() + crypto.randomUUID();
        const tokenHash = await hashSessionToken(token);
        await env.DB.batch([
          env.DB.prepare('DELETE FROM auth_sessions WHERE user_id = ?').bind(user.id),
          env.DB.prepare("INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES (?, ?, datetime('now', '+1 day'))").bind(tokenHash, user.id),
          env.DB.prepare('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?').bind(user.id),
          env.DB.prepare('INSERT INTO audit_events (id, actor_id, actor_role, action, module, record_type, record_id, request_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
            .bind(crypto.randomUUID(), user.id, roles.results[0]?.role ?? 'PREVIEW', 'LOGIN', 'AUTH', 'USER', user.id, id),
        ]);
        const response = json({ success: true, data: {
          userId: user.id, email: user.email,
          roles: roles.results.map((r) => ({ role: r.role, canApprove: r.can_approve === 1 })),
        }, requestId: id });
        response.headers.set('Set-Cookie', `session=${token}; HttpOnly; Path=/; Max-Age=86400; SameSite=Lax${url.protocol === 'https:' ? '; Secure' : ''}`);
        return response;
      } catch (error) {
        console.error('LOGIN_FAILED', error);
        return json({ error: { code: 'INTERNAL_ERROR', message: 'Login failed' }, requestId: id }, 500);
      }
    }

    if (request.method === 'POST' && url.pathname === '/auth/logout') {
      const actor = await authenticatedActor(request, env);
      if (actor) {
        await env.DB.batch([
          env.DB.prepare('DELETE FROM auth_sessions WHERE user_id = ?').bind(actor.id),
          env.DB.prepare('INSERT INTO audit_events (id, actor_id, actor_role, action, module, record_type, record_id, request_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
            .bind(crypto.randomUUID(), actor.id, actorRole(actor), 'LOGOUT', 'AUTH', 'USER', actor.id, id),
        ]);
      }
      const response = json({ success: true, message: 'Logged out successfully', requestId: id });
      response.headers.set('Set-Cookie', 'session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax');
      return response;
    }

    const actor = await authenticatedActor(request, env);
    const effectiveActor = actor ?? previewActor;

    if (request.method === 'GET' && url.pathname === '/auth/me') {
      return json({ data: effectiveActor, requestId: id });
    }

    if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method) && !actor) {
      return json({ error: { code: 'UNAUTHENTICATED', message: 'Login is required for write actions in preview mode' }, requestId: id }, 401);
    }

    if (request.method === 'GET' && url.pathname === '/tasks') {
      const rows = await env.DB.prepare(`SELECT t.id, t.title, t.module, t.record_type, t.record_id, t.action, t.due_date, t.status, t.priority,
        CASE WHEN t.due_date IS NOT NULL AND t.due_date < date('now') AND t.status NOT IN ('COMPLETED','CANCELLED') THEN 1 ELSE 0 END AS overdue
        FROM tasks t WHERE t.owner_id = ? ORDER BY overdue DESC, CASE t.priority WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'NORMAL' THEN 3 ELSE 4 END, t.due_date`).bind(effectiveActor.id).all();
      return json({ data: rows.results, requestId: id });
    }

    const taskRoute = url.pathname.match(/^\/tasks\/([a-f0-9-]+)$/);
    if (taskRoute) {
      const task = await env.DB.prepare(`SELECT id, title, module, record_type, record_id, action, owner_id, due_date, status, priority, created_at, updated_at, completed_at
        FROM tasks WHERE id = ? AND owner_id = ?`).bind(taskRoute[1], effectiveActor.id).first<Record<string, unknown>>();
      if (!task) return json({ error: { code: 'NOT_FOUND', message: 'Task not found' }, requestId: id }, 404);
      return json({ data: task, requestId: id });
    }

    const taskAction = url.pathname.match(/^\/tasks\/([a-f0-9-]+)\/(start|complete|cancel)$/);
    if (request.method === 'POST' && taskAction) {
      const task = await env.DB.prepare('SELECT id, status, owner_id FROM tasks WHERE id = ?').bind(taskAction[1]).first<{ id: string; status: string; owner_id: string }>();
      if (!task) return json({ error: { code: 'NOT_FOUND', message: 'Task not found' }, requestId: id }, 404);
      if (task.owner_id !== actor!.id) return json({ error: { code: 'FORBIDDEN', message: 'Task owner required' }, requestId: id }, 403);
      const action = taskAction[2];
      const next = action === 'start' ? 'IN_PROGRESS' : action === 'complete' ? 'COMPLETED' : 'CANCELLED';
      if (task.status === 'COMPLETED' || task.status === 'CANCELLED') return json({ error: { code: 'INVALID_STATE', message: 'Task is already closed' }, requestId: id }, 409);
      await env.DB.prepare('UPDATE tasks SET status = ?, completed_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .bind(next, next === 'COMPLETED' || next === 'CANCELLED' ? new Date().toISOString() : null, task.id).run();
      await audit(env, actor!, id, action.toUpperCase(), 'TASK_CENTER', task.id, task.status, next);
      return json({ data: { taskId: task.id, status: next }, requestId: id });
    }

    if (request.method === 'GET' && url.pathname === '/dashboard') {
      const productStates = await env.DB.prepare('SELECT state, COUNT(*) AS count FROM products GROUP BY state ORDER BY state').all();
      const taskStates = await env.DB.prepare('SELECT status, COUNT(*) AS count FROM tasks WHERE owner_id = ? GROUP BY status ORDER BY status').bind(effectiveActor.id).all();
      const evidenceStates = await env.DB.prepare('SELECT verification_status AS status, COUNT(*) AS count FROM evidence GROUP BY verification_status ORDER BY verification_status').all();
      const pendingApprovals = await env.DB.prepare("SELECT COUNT(*) AS count FROM approval_steps WHERE status = 'PENDING' AND required_role IN (SELECT role FROM user_roles WHERE user_id = ? AND can_approve = 1)").bind(effectiveActor.id).first<{ count: number }>();
      const [documents, productSummary, production, qc, capa, training, traceability, recalls] = await Promise.all([
        env.DB.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'CONTROLLED' THEN 1 ELSE 0 END) AS controlled FROM documents").first(),
        env.DB.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN state = 'EFFECTIVE' THEN 1 ELSE 0 END) AS effective FROM products").first(),
        env.DB.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN status IN ('OPEN','IN_PROCESS','QC_PENDING','HOLD','READY_FOR_RELEASE') THEN 1 ELSE 0 END) AS openCount, SUM(CASE WHEN status = 'RELEASED' THEN 1 ELSE 0 END) AS released FROM production_batches").first(),
        env.DB.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN result_status = 'PENDING' THEN 1 ELSE 0 END) AS pending, SUM(CASE WHEN result_status = 'FAIL' THEN 1 ELSE 0 END) AS failed FROM qc_checks").first(),
        env.DB.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN status != 'CLOSED' THEN 1 ELSE 0 END) AS openCount FROM capas").first(),
        env.DB.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN status IN ('REQUIRED','ASSIGNED','IN_PROGRESS','OVERDUE') THEN 1 ELSE 0 END) AS openCount FROM training_requirements").first(),
        env.DB.prepare("SELECT COUNT(*) AS total FROM traceability_events").first(),
        env.DB.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN status != 'CLOSED' THEN 1 ELSE 0 END) AS openCount FROM recall_cases").first()
      ]);
      return json({ data: {
        products: productStates.results,
        myTasks: taskStates.results,
        evidence: evidenceStates.results,
        pendingApprovals: Number(pendingApprovals?.count ?? 0),
        documents: { total: Number((documents as any)?.total ?? 0), controlled: Number((documents as any)?.controlled ?? 0), pendingApproval: Number((await env.DB.prepare("SELECT COUNT(*) AS count FROM document_revisions WHERE status = 'PENDING_APPROVAL'").first<{count:number}>())?.count ?? 0) },
        productSummary: { total: Number((productSummary as any)?.total ?? 0), effective: Number((productSummary as any)?.effective ?? 0) },
        production: { total: Number((production as any)?.total ?? 0), open: Number((production as any)?.openCount ?? 0), released: Number((production as any)?.released ?? 0) },
        qc: { total: Number((qc as any)?.total ?? 0), pending: Number((qc as any)?.pending ?? 0), failed: Number((qc as any)?.failed ?? 0) },
        capa: { total: Number((capa as any)?.total ?? 0), open: Number((capa as any)?.openCount ?? 0) },
        training: { total: Number((training as any)?.total ?? 0), open: Number((training as any)?.openCount ?? 0) },
        traceability: { total: Number((traceability as any)?.total ?? 0) },
        recalls: { total: Number((recalls as any)?.total ?? 0), open: Number((recalls as any)?.openCount ?? 0) }
      }, requestId: id });
    }

    if (request.method === 'GET' && url.pathname === '/products') {
      const rows = await env.DB.prepare('SELECT id, product_code, thai_name, english_name, site_id, revision, state, version FROM products ORDER BY product_code').all<Record<string, unknown>>();
      return json({ data: rows.results.map(productFromRow), requestId: id });
    }
    if (request.method === 'POST' && url.pathname === '/products') {
      if (!actor) return json({ error: { code: 'UNAUTHENTICATED', message: 'Login required' }, requestId: id }, 401);
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
        if (!actor) return json({ error: { code: 'UNAUTHENTICATED', message: 'Login required' }, requestId: id }, 401);
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
      if (!actor) return json({ error: { code: 'UNAUTHENTICATED', message: 'Login required' }, requestId: id }, 401);
      if (!requireRole(actor, ['RA', 'R&D'])) return json({ error: { code: 'FORBIDDEN', message: 'RA or R&D role required' }, requestId: id }, 403);
      const product = await env.DB.prepare('SELECT id, revision, state FROM products WHERE id = ?').bind(submit[1]).first<{ id: string; revision: string; state: string }>();
      if (!product) return json({ error: { code: 'NOT_FOUND', message: 'Product not found' }, requestId: id }, 404);
      if (product.state !== 'DRAFT' && product.state !== 'RETURNED') return json({ error: { code: 'INVALID_STATE', message: 'Only DRAFT or RETURNED products can be submitted' }, requestId: id }, 409);
      if (!await hasVerifiedEvidence(env, 'PRODUCT', product.id, product.revision)) return json({ error: { code: 'VERIFIED_EVIDENCE_REQUIRED', message: 'At least one verified evidence record is required before submission' }, requestId: id }, 409);
      await env.DB.batch([
        env.DB.prepare("UPDATE products SET state = 'PENDING_APPROVAL', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(product.id),
        env.DB.prepare("INSERT INTO approval_steps (id, record_type, record_id, revision, sequence, required_role, status) VALUES (?, 'PRODUCT', ?, ?, 1, 'RA', 'PENDING')").bind(crypto.randomUUID(), product.id, product.revision),
        env.DB.prepare("INSERT INTO approval_steps (id, record_type, record_id, revision, sequence, required_role, status) VALUES (?, 'PRODUCT', ?, ?, 2, 'MANAGEMENT', 'WAITING')").bind(crypto.randomUUID(), product.id, product.revision),
        env.DB.prepare('INSERT INTO audit_events (id, actor_id, actor_role, action, module, record_type, record_id, previous_state, new_state, request_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), actor.id, actorRole(actor), 'SUBMIT', 'REGULATORY_AFFAIRS', 'PRODUCT', product.id, product.state, 'PENDING_APPROVAL', id),
      ]);
      return json({ data: { productId: product.id, revision: product.revision, state: 'PENDING_APPROVAL' }, requestId: id });
    }

    if (request.method === 'POST' && url.pathname === '/evidence') {
      if (!actor) return json({ error: { code: 'UNAUTHENTICATED', message: 'Login required' }, requestId: id }, 401);
      if (!requireRole(actor, ['RA', 'QA', 'QC', 'DCC', 'R&D'])) return json({ error: { code: 'FORBIDDEN', message: 'Evidence upload role required' }, requestId: id }, 403);
      const input = await body<EvidenceInput>(request);
      if (!input?.recordType || !input.recordId || !input.title?.trim() || !input.revision?.trim() || !input.contentType?.trim()) return json({ error: { code: 'VALIDATION_ERROR', message: 'recordType, recordId, title, revision and contentType are required' }, requestId: id }, 400);
      if (input.recordType !== 'PRODUCT' || !await env.DB.prepare('SELECT id FROM products WHERE id = ?').bind(input.recordId).first()) return json({ error: { code: 'VALIDATION_ERROR', message: 'Only PRODUCT evidence records are supported' }, requestId: id }, 400);
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
      if (!actor) return json({ error: { code: 'UNAUTHENTICATED', message: 'Login required' }, requestId: id }, 401);
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
      if (!actor) return json({ error: { code: 'UNAUTHENTICATED', message: 'Login required' }, requestId: id }, 401);
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
      if (!actor) return json({ error: { code: 'UNAUTHENTICATED', message: 'Login required' }, requestId: id }, 401);
      const [productId, action] = [decision[1], decision[2]];
      const product = await env.DB.prepare('SELECT id, revision, state FROM products WHERE id = ?').bind(productId).first<{ id: string; revision: string; state: string }>();
      if (!product) return json({ error: { code: 'NOT_FOUND', message: 'Product not found' }, requestId: id }, 404);
      if (product.state !== 'PENDING_APPROVAL') return json({ error: { code: 'INVALID_STATE', message: 'Product is not pending approval' }, requestId: id }, 409);
      const step = await env.DB.prepare("SELECT id, required_role, status, sequence, revision FROM approval_steps WHERE record_type = 'PRODUCT' AND record_id = ? AND revision = ? AND status = 'PENDING' ORDER BY sequence LIMIT 1")
        .bind(productId, product.revision).first<{ id: string; required_role: string; status: string; sequence: number; revision: string }>();
      if (!step) return json({ error: { code: 'APPROVAL_STEP_REQUIRED', message: 'No pending approval step exists' }, requestId: id }, 409);
      if (!actor.roles.some((grant) => grant.role === step.required_role && grant.canApprove)) return json({ error: { code: 'APPROVER_NOT_AUTHORIZED', message: 'Actor cannot decide this approval step' }, requestId: id }, 403);
      if (!await hasVerifiedEvidence(env, 'PRODUCT', product.id, product.revision)) return json({ error: { code: 'VERIFIED_EVIDENCE_REQUIRED', message: 'Verified evidence is required at approval time' }, requestId: id }, 409);
      const input = await body<DecisionInput>(request);
      if ((action === 'reject' || action === 'return') && !input?.comment?.trim()) return json({ error: { code: 'VALIDATION_ERROR', message: 'A comment is required for reject or return' }, requestId: id }, 400);
      if (action === 'approve') {
        const next = await env.DB.prepare("SELECT id FROM approval_steps WHERE record_type = 'PRODUCT' AND record_id = ? AND revision = ? AND status = 'WAITING' ORDER BY sequence LIMIT 1")
          .bind(productId, product.revision).first<{ id: string }>();
        const nextState = next ? 'PENDING_APPROVAL' : 'APPROVED';
        const statements = [
          env.DB.prepare("UPDATE approval_steps SET status = 'APPROVED', approver_id = ?, decided_at = CURRENT_TIMESTAMP, comment = ? WHERE id = ? AND status = 'PENDING'").bind(actor.id, input?.comment?.trim() ?? null, step.id),
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


    const docChangeCreate = url.pathname.match(/^\/documents\/([^/]+)\/changes$/);
    if (request.method === 'POST' && docChangeCreate) {
      if (!actor) return json({ error:{code:'UNAUTHENTICATED',message:'Login required'},requestId:id },401);
      if (!requireRole(actor,['DCC','RA'])) return json({error:{code:'FORBIDDEN',message:'DCC or RA role required'},requestId:id},403);
      const documentId=docChangeCreate[1]; const doc=await env.DB.prepare('SELECT id,revision FROM documents WHERE id=?').bind(documentId).first<{id:string;revision:string}>();
      if(!doc)return json({error:{code:'NOT_FOUND',message:'Document not found'},requestId:id},404);
      const input=await body<{to_revision?:string;reason?:string}>(request);
      if(!input?.to_revision?.trim()||!input.reason?.trim())return json({error:{code:'VALIDATION_ERROR',message:'to_revision and reason are required'},requestId:id},400);
      const cid=crypto.randomUUID();
      await env.DB.batch([
        env.DB.prepare("INSERT INTO document_change_requests (id,document_id,from_revision,to_revision,reason,status,requested_by) VALUES (?,?,?,?,?,'OPEN',?)").bind(cid,documentId,doc.revision,input.to_revision.trim(),input.reason.trim(),actor.id),
        env.DB.prepare('INSERT INTO audit_events (id,actor_id,actor_role,action,module,record_type,record_id,new_state,reason,request_id) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),actor.id,actorRole(actor),'CREATE_CHANGE_REQUEST','DOCUMENT_CONTROL','DOCUMENT',documentId,'OPEN',input.reason.trim(),id)
      ]);
      return json({data:{id:cid,documentId,status:'OPEN'},requestId:id},201);
    }
    const docChangeDecision=url.pathname.match(/^\/documents\/([^/]+)\/changes\/([^/]+)\/(approve|reject|cancel)$/);
    if(request.method==='POST'&&docChangeDecision){
      if(!actor)return json({error:{code:'UNAUTHENTICATED',message:'Login required'},requestId:id},401);
      const [documentId,changeId,action]=[docChangeDecision[1],docChangeDecision[2],docChangeDecision[3]];
      const ch=await env.DB.prepare('SELECT id,status,reason FROM document_change_requests WHERE id=? AND document_id=?').bind(changeId,documentId).first<{id:string;status:string;reason:string}>();
      if(!ch)return json({error:{code:'NOT_FOUND',message:'Change request not found'},requestId:id},404);
      if(ch.status!=='OPEN')return json({error:{code:'INVALID_STATE',message:'Only OPEN change requests can be decided'},requestId:id},409);
      if(action==='approve'&&!actor.roles.some(r=>r.canApprove))return json({error:{code:'APPROVER_NOT_AUTHORIZED',message:'Actor cannot approve change requests'},requestId:id},403);
      const next=action==='approve'?'APPROVED':action==='reject'?'REJECTED':'CANCELLED';
      await env.DB.batch([
        env.DB.prepare("UPDATE document_change_requests SET status=?,decided_by=?,decided_at=CURRENT_TIMESTAMP WHERE id=? AND status='OPEN'").bind(next,actor.id,changeId),
        env.DB.prepare('INSERT INTO audit_events (id,actor_id,actor_role,action,module,record_type,record_id,previous_state,new_state,reason,request_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),actor.id,actorRole(actor),'CHANGE_REQUEST_'+action.toUpperCase(),'DOCUMENT_CONTROL','DOCUMENT',documentId,'OPEN',next,ch.reason,id)
      ]);
      return json({data:{id:changeId,status:next},requestId:id});
    }
    if(request.method==='GET'&&url.pathname.match(/^\/documents\/[^/]+\/changes$/)){const documentId=url.pathname.split('/')[2];const rows=await env.DB.prepare('SELECT * FROM document_change_requests WHERE document_id=? ORDER BY created_at DESC').bind(documentId).all();return json({data:rows.results,requestId:id});}

    const documentRevisionCreate = url.pathname.match(/^\/documents\/([^/]+)\/revisions$/);    const docSubmit=url.pathname.match(/^\/documents\/([^/]+)\/revisions\/([^/]+)\/submit$/);
    if(request.method==='POST'&&docSubmit){
      if(!actor)return json({error:{code:'UNAUTHENTICATED',message:'Login required'},requestId:id},401);
      if(!requireRole(actor,['DCC','RA']))return json({error:{code:'FORBIDDEN',message:'DCC or RA role required'},requestId:id},403);
      const documentId=docSubmit[1],revision=docSubmit[2]; const input=await body<{required_role?:string}>(request);
      const role=input?.required_role?.trim()?.toUpperCase(); const allowed=['RA','QA','QC','DCC','R&D','MANAGEMENT'];
      if(!role||!allowed.includes(role))return json({error:{code:'VALIDATION_ERROR',message:'required_role is required'},requestId:id},400);
      const rev=await env.DB.prepare('SELECT id,status,change_request_id FROM document_revisions WHERE document_id=? AND revision=?').bind(documentId,revision).first<{id:string;status:string;change_request_id:string|null}>();
      if(!rev)return json({error:{code:'NOT_FOUND',message:'Document revision not found'},requestId:id},404);
      if(rev.status!=='DRAFT')return json({error:{code:'INVALID_STATE',message:'Only DRAFT revisions can be submitted'},requestId:id},409);
      if(rev.change_request_id){const cr=await env.DB.prepare('SELECT status FROM document_change_requests WHERE id=?').bind(rev.change_request_id).first<{status:string}>();if(!cr||cr.status!=='APPROVED')return json({error:{code:'CHANGE_REQUEST_REQUIRED',message:'Linked change request must be APPROVED'},requestId:id},409);}
      await env.DB.batch([
        env.DB.prepare("UPDATE document_revisions SET status='PENDING_APPROVAL' WHERE id=?").bind(rev.id),
        env.DB.prepare("INSERT INTO document_approval_steps (id,document_id,revision,sequence,required_role,status) VALUES (?,?,?,1,?,'PENDING')").bind(crypto.randomUUID(),documentId,revision,role),
        env.DB.prepare("INSERT INTO audit_events (id,actor_id,actor_role,action,module,record_type,record_id,previous_state,new_state,request_id) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),actor.id,actorRole(actor),'SUBMIT','DOCUMENT_CONTROL','DOCUMENT',documentId,'DRAFT','PENDING_APPROVAL',id)
      ]);
      return json({data:{documentId,revision,status:'PENDING_APPROVAL'},requestId:id});
    }
    const docApproval=url.pathname.match(/^\/approvals\/DOCUMENT\/([^/]+)\/([^/]+)\/(approve|reject|return)$/);
    if(request.method==='POST'&&docApproval){
      if(!actor)return json({error:{code:'UNAUTHENTICATED',message:'Login required'},requestId:id},401);
      const [documentId,revision,action]=[docApproval[1],docApproval[2],docApproval[3]];
      const rev=await env.DB.prepare('SELECT id,status FROM document_revisions WHERE document_id=? AND revision=?').bind(documentId,revision).first<{id:string;status:string}>();
      if(!rev)return json({error:{code:'NOT_FOUND',message:'Document revision not found'},requestId:id},404);
      if(rev.status!=='PENDING_APPROVAL')return json({error:{code:'INVALID_STATE',message:'Document revision is not pending approval'},requestId:id},409);
      const step=await env.DB.prepare("SELECT id,required_role FROM document_approval_steps WHERE document_id=? AND revision=? AND status='PENDING' ORDER BY sequence LIMIT 1").bind(documentId,revision).first<{id:string;required_role:string}>();
      if(!step)return json({error:{code:'APPROVAL_STEP_REQUIRED',message:'No pending approval step exists'},requestId:id},409);
      if(!actor.roles.some(r=>r.role===step.required_role&&r.canApprove))return json({error:{code:'APPROVER_NOT_AUTHORIZED',message:'Actor cannot decide this approval step'},requestId:id},403);
      const input=await body<DecisionInput>(request); if((action==='reject'||action==='return')&&!input?.comment?.trim())return json({error:{code:'VALIDATION_ERROR',message:'A comment is required'},requestId:id},400);
      if(action==='approve'){
        await env.DB.batch([
          env.DB.prepare("UPDATE document_approval_steps SET status='APPROVED',approver_id=?,decided_at=CURRENT_TIMESTAMP,comment=? WHERE id=? AND status='PENDING'").bind(actor.id,input?.comment?.trim()||null,step.id),
          env.DB.prepare("UPDATE document_revisions SET status='APPROVED',approved_by=?,approved_at=CURRENT_TIMESTAMP WHERE id=?").bind(actor.id,rev.id),
          env.DB.prepare("UPDATE documents SET revision=?,status='CONTROLLED',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(revision,documentId),
          env.DB.prepare("INSERT INTO audit_events (id,actor_id,actor_role,action,module,record_type,record_id,new_state,request_id) VALUES (?,?,?,?,?,?,?, ?,?)").bind(crypto.randomUUID(),actor.id,actorRole(actor),'APPROVE','DOCUMENT_CONTROL','DOCUMENT',documentId,'CONTROLLED',id)
        ]);
        return json({data:{documentId,revision,status:'APPROVED'},requestId:id});
      }
      const terminal=action==='reject'?'REJECTED':'RETURNED';
      await env.DB.batch([
        env.DB.prepare("UPDATE document_approval_steps SET status=?,approver_id=?,decided_at=CURRENT_TIMESTAMP,comment=? WHERE id=? AND status='PENDING'").bind(terminal,actor.id,input!.comment!.trim(),step.id),
        env.DB.prepare("UPDATE document_revisions SET status='DRAFT' WHERE id=?").bind(rev.id),
        env.DB.prepare("INSERT INTO audit_events (id,actor_id,actor_role,action,module,record_type,record_id,previous_state,new_state,reason,request_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),actor.id,actorRole(actor),action.toUpperCase(),'DOCUMENT_CONTROL','DOCUMENT',documentId,'PENDING_APPROVAL','DRAFT',input!.comment!.trim(),id)
      ]);
      return json({data:{documentId,revision,status:'DRAFT',decision:terminal},requestId:id});
    }
    if(request.method==='GET'&&url.pathname.match(/^\/approvals\/DOCUMENT\/[^/]+\/[^/]+$/)){const p=url.pathname.split('/');const rows=await env.DB.prepare('SELECT * FROM document_approval_steps WHERE document_id=? AND revision=? ORDER BY sequence').bind(p[2],p[3]).all();return json({data:rows.results,requestId:id});}

    const docSupersede = url.pathname.match(/^\/documents\/([^/]+)\/supersede$/);
    if (request.method === 'POST' && docSupersede) {
      if (!actor) return json({ error: { code: 'UNAUTHENTICATED', message: 'Login required' }, requestId: id }, 401);
      if (!requireRole(actor, ['DCC', 'RA'])) return json({ error: { code: 'FORBIDDEN', message: 'DCC or RA role required' }, requestId: id }, 403);
      const documentId = docSupersede[1];
      const input = await body<{ superseded_by?: string; reason?: string }>(request);
      if (!input?.superseded_by?.trim() || !input.reason?.trim()) return json({ error: { code: 'VALIDATION_ERROR', message: 'superseded_by and reason are required' }, requestId: id }, 400);
      if (input.superseded_by === documentId) return json({ error: { code: 'VALIDATION_ERROR', message: 'A document cannot supersede itself' }, requestId: id }, 400);
      const oldDoc = await env.DB.prepare("SELECT id, status, revision FROM documents WHERE id = ?").bind(documentId).first<{id:string;status:string;revision:string}>();
      const newDoc = await env.DB.prepare("SELECT id, status, revision FROM documents WHERE id = ?").bind(input.superseded_by.trim()).first<{id:string;status:string;revision:string}>();
      if (!oldDoc || !newDoc) return json({ error: { code: 'NOT_FOUND', message: 'Document not found' }, requestId: id }, 404);
      if (oldDoc.status === 'OBSOLETE') return json({ error: { code: 'INVALID_STATE', message: 'Document is already obsolete' }, requestId: id }, 409);
      if (newDoc.status !== 'CONTROLLED') return json({ error: { code: 'INVALID_STATE', message: 'Superseding document must be CONTROLLED' }, requestId: id }, 409);
      await env.DB.batch([
        env.DB.prepare("UPDATE documents SET status='OBSOLETE', superseded_by=?, updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(newDoc.id, oldDoc.id),
        env.DB.prepare("INSERT INTO document_obsolete_events (id,document_id,reason,obsolete_by) VALUES (?,?,?,?)").bind(crypto.randomUUID(),oldDoc.id,input.reason.trim(),actor.id),
        env.DB.prepare("INSERT INTO audit_events (id,actor_id,actor_role,action,module,record_type,record_id,previous_state,new_state,reason,request_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),actor.id,actorRole(actor),'SUPERSEDE','DOCUMENT_CONTROL','DOCUMENT',oldDoc.id,oldDoc.status,'OBSOLETE',input.reason.trim(),id)
      ]);
      return json({ data: { documentId: oldDoc.id, status: 'OBSOLETE', supersededBy: newDoc.id }, requestId: id });
    }

    const docObsolete = url.pathname.match(/^\/documents\/([^/]+)\/obsolete$/);
    if (request.method === 'POST' && docObsolete) {
      if (!actor) return json({ error: { code: 'UNAUTHENTICATED', message: 'Login required' }, requestId: id }, 401);
      if (!requireRole(actor, ['DCC', 'RA'])) return json({ error: { code: 'FORBIDDEN', message: 'DCC or RA role required' }, requestId: id }, 403);
      const documentId = docObsolete[1];
      const input = await body<{ reason?: string }>(request);
      if (!input?.reason?.trim()) return json({ error: { code: 'VALIDATION_ERROR', message: 'reason is required' }, requestId: id }, 400);
      const doc = await env.DB.prepare("SELECT id,status FROM documents WHERE id=?").bind(documentId).first<{id:string;status:string}>();
      if (!doc) return json({ error: { code: 'NOT_FOUND', message: 'Document not found' }, requestId: id }, 404);
      if (doc.status === 'OBSOLETE') return json({ error: { code: 'INVALID_STATE', message: 'Document is already obsolete' }, requestId: id }, 409);
      await env.DB.batch([
        env.DB.prepare("UPDATE documents SET status='OBSOLETE', updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(documentId),
        env.DB.prepare("INSERT INTO document_obsolete_events (id,document_id,reason,obsolete_by) VALUES (?,?,?,?)").bind(crypto.randomUUID(),documentId,input.reason.trim(),actor.id),
        env.DB.prepare("INSERT INTO audit_events (id,actor_id,actor_role,action,module,record_type,record_id,previous_state,new_state,reason,request_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),actor.id,actorRole(actor),'OBSOLETE','DOCUMENT_CONTROL','DOCUMENT',documentId,doc.status,'OBSOLETE',input.reason.trim(),id)
      ]);
      return json({ data: { documentId, status: 'OBSOLETE' }, requestId: id });
    }

    if (request.method === 'GET' && url.pathname.match(/^\/documents\/[^/]+\/obsolete-history$/)) {
      const documentId = url.pathname.split('/')[2];
      const rows = await env.DB.prepare('SELECT * FROM document_obsolete_events WHERE document_id = ? ORDER BY obsolete_at DESC').bind(documentId).all();
      return json({ data: rows.results, requestId: id });
    }

    if (request.method === 'GET' && url.pathname.match(/^\/documents\/[^/]+\/revisions$/)) {
      const documentId = url.pathname.split('/')[2];
      const rows = await env.DB.prepare('SELECT * FROM document_revisions WHERE document_id = ? ORDER BY created_at DESC').bind(documentId).all();
      return json({ data: rows.results, requestId: id });
    }
    if (request.method === 'GET' && url.pathname.match(/^\/documents\/[^/]+\/changes$/)) {
      const documentId = url.pathname.split('/')[2];
      const rows = await env.DB.prepare('SELECT * FROM document_change_requests WHERE document_id = ? ORDER BY created_at DESC').bind(documentId).all();
      return json({ data: rows.results, requestId: id });
    }

    if (request.method === 'GET' && url.pathname === '/ra/label-approval') {
      const rows = await env.DB.prepare('SELECT * FROM ra_label_approval_matrix ORDER BY sku').all();
      return json({ data: rows.results, requestId: id });
    }
    if (request.method === 'GET' && url.pathname === '/ra/label-issues') {
      const status = url.searchParams.get('status');
      const rows = status
        ? await env.DB.prepare('SELECT * FROM ra_label_issue_list WHERE status = ? ORDER BY issue_id').bind(status).all()
        : await env.DB.prepare('SELECT * FROM ra_label_issue_list ORDER BY issue_id').all();
      return json({ data: rows.results, requestId: id });
    }
    if (request.method === 'GET' && url.pathname === '/ra/sku-compliance') {
      const rows = await env.DB.prepare('SELECT * FROM ra_sku_compliance_matrix ORDER BY sku').all();
      return json({ data: rows.results, requestId: id });
    }
    if (request.method === 'GET' && url.pathname === '/ra/raw-materials') {
      const allergen = url.searchParams.get('allergen');
      const rows = allergen
        ? await env.DB.prepare('SELECT * FROM ra_raw_material_master WHERE allergen_group LIKE ? ORDER BY material_code').bind('%' + allergen + '%').all()
        : await env.DB.prepare('SELECT * FROM ra_raw_material_master ORDER BY material_code').all();
      return json({ data: rows.results, requestId: id });
    }

    if (request.method === 'GET' && url.pathname === '/ra/label-guidance') {
      const rows = await env.DB.prepare('SELECT * FROM ra_label_guidance ORDER BY topic').all();
      return json({ data: rows.results, requestId: id });
    }
    if (request.method === 'GET' && url.pathname === '/ra/label-checklist') {
      const rows = await env.DB.prepare('SELECT * FROM ra_label_release_checklist ORDER BY check_id').all();
      return json({ data: rows.results, requestId: id });
    }
    if (request.method === 'GET' && url.pathname === '/ra/allergen-matrix') {
      const rows = await env.DB.prepare('SELECT * FROM ra_raw_material_allergen_matrix ORDER BY sku').all();
      return json({ data: rows.results, requestId: id });
    }

    if (request.method === 'GET' && url.pathname === '/ra/suppliers') {
      const rows = await env.DB.prepare('SELECT * FROM supplier_master ORDER BY supplier_code').all();
      return json({ data: rows.results, requestId: id });
    }
    if (request.method === 'POST' && url.pathname === '/ra/suppliers') {
      if (!actor) return json({ error: { code:'UNAUTHENTICATED', message:'Login required' }, requestId:id },401);
      if (!requireRole(actor,['RA','QA','QC','DCC'])) return json({ error:{code:'FORBIDDEN',message:'RA/QA/QC/DCC role required'},requestId:id},403);
      const input=await body<{supplier_code?:string;supplier_name?:string;notes?:string}>(request);
      if(!input?.supplier_code?.trim()||!input?.supplier_name?.trim()) return json({error:{code:'VALIDATION_ERROR',message:'supplier_code and supplier_name are required'},requestId:id},400);
      const sid=crypto.randomUUID();
      await env.DB.prepare('INSERT INTO supplier_master(supplier_id,supplier_code,supplier_name,owner_id,notes) VALUES(?,?,?,?,?)').bind(sid,input.supplier_code.trim(),input.supplier_name.trim(),actor.id,input.notes?.trim()||null).run();
      return json({data:{supplier_id:sid,status:'DRAFT'},requestId:id},201);
    }
    const supplierReview=url.pathname.match(/^\/ra\/suppliers\/([^/]+)\/(submit|approve|reject|suspend)$/);
    if(request.method==='POST'&&supplierReview){
      if(!actor)return json({error:{code:'UNAUTHENTICATED',message:'Login required'},requestId:id},401);
      const supplierId=supplierReview[1],action=supplierReview[2];
      const input=await body<{comment?:string}>(request);
      const supplier=await env.DB.prepare('SELECT * FROM supplier_master WHERE supplier_id=?').bind(supplierId).first<any>();
      if(!supplier)return json({error:{code:'NOT_FOUND',message:'Supplier not found'},requestId:id},404);
      if(action==='submit'){
        if(!requireRole(actor,['RA','QA','QC','DCC']))return json({error:{code:'FORBIDDEN',message:'RA/QA/QC/DCC role required'},requestId:id},403);
        if(supplier.status!=='DRAFT'&&supplier.status!=='REJECTED')return json({error:{code:'INVALID_STATE',message:'Supplier must be DRAFT or REJECTED'},requestId:id},409);
        await env.DB.batch([env.DB.prepare("UPDATE supplier_master SET status='PENDING_REVIEW',updated_at=CURRENT_TIMESTAMP WHERE supplier_id=?").bind(supplierId),env.DB.prepare("INSERT INTO supplier_review_events(id,supplier_id,action,previous_status,new_status,actor_id,comment) VALUES(?,?,?,?,?,?,?)").bind(crypto.randomUUID(),supplierId,'SUBMIT',supplier.status,'PENDING_REVIEW',actor.id,input?.comment||null)]);
      } else {
        if(!requireRole(actor,['RA','QA','QC']))return json({error:{code:'FORBIDDEN',message:'RA/QA/QC role required'},requestId:id},403);
        if(supplier.status!=='PENDING_REVIEW')return json({error:{code:'INVALID_STATE',message:'Supplier must be PENDING_REVIEW'},requestId:id},409);
        const next=action==='approve'?'APPROVED':action==='reject'?'REJECTED':'SUSPENDED';
        if((action==='reject'||action==='suspend')&&!input?.comment?.trim())return json({error:{code:'VALIDATION_ERROR',message:'comment is required'},requestId:id},400);
        await env.DB.batch([env.DB.prepare('UPDATE supplier_master SET status=?,updated_at=CURRENT_TIMESTAMP WHERE supplier_id=?').bind(next,supplierId),env.DB.prepare("INSERT INTO supplier_review_events(id,supplier_id,action,previous_status,new_status,actor_id,comment) VALUES(?,?,?,?,?,?,?)").bind(crypto.randomUUID(),supplierId,action.toUpperCase(),supplier.status,next,actor.id,input?.comment||null)]);
      }
      return json({data:{supplier_id:supplierId,status:action==='submit'?'PENDING_REVIEW':action==='approve'?'APPROVED':action==='reject'?'REJECTED':'SUSPENDED'},requestId:id});
    }
    if(request.method==='GET'&&url.pathname.match(/^\/ra\/suppliers\/[^/]+\/events$/)){
      const supplierId=url.pathname.split('/')[3]; const rows=await env.DB.prepare('SELECT * FROM supplier_review_events WHERE supplier_id=? ORDER BY created_at DESC').bind(supplierId).all(); return json({data:rows.results,requestId:id});
    }
    if(request.method==='GET'&&url.pathname.match(/^\/ra\/suppliers\/[^/]+\/materials$/)){
      const supplierId=url.pathname.split('/')[3]; const rows=await env.DB.prepare('SELECT l.*,r.material_name_th,r.material_name_en FROM supplier_raw_material_links l JOIN ra_raw_material_master r ON r.material_code=l.material_code WHERE l.supplier_id=? ORDER BY r.material_code').bind(supplierId).all(); return json({data:rows.results,requestId:id});
    }
    if(request.method==='POST'&&url.pathname.match(/^\/ra\/suppliers\/[^/]+\/materials$/)){
      if(!actor)return json({error:{code:'UNAUTHENTICATED',message:'Login required'},requestId:id},401);
      if(!requireRole(actor,['RA','QA','QC','DCC']))return json({error:{code:'FORBIDDEN',message:'RA/QA/QC/DCC role required'},requestId:id},403);
      const supplierId=url.pathname.split('/')[3]; const input=await body<{material_code?:string}>(request);
      if(!input?.material_code)return json({error:{code:'VALIDATION_ERROR',message:'material_code is required'},requestId:id},400);
      const exists=await env.DB.prepare('SELECT 1 FROM ra_raw_material_master WHERE material_code=?').bind(input.material_code).first(); if(!exists)return json({error:{code:'NOT_FOUND',message:'Raw material not found'},requestId:id},404);
      const lid=crypto.randomUUID(); await env.DB.prepare('INSERT INTO supplier_raw_material_links(id,supplier_id,material_code) VALUES(?,?,?)').bind(lid,supplierId,input.material_code).run(); return json({data:{id:lid,status:'DRAFT'},requestId:id},201);
    }

    if (url.pathname === '/qa/nonconformities' && request.method === 'GET') {
      const status = url.searchParams.get('status');
      const result = status
        ? await env.DB.prepare('SELECT * FROM nonconformities WHERE status = ? ORDER BY created_at DESC').bind(status).all()
        : await env.DB.prepare('SELECT * FROM nonconformities ORDER BY created_at DESC').all();
      return json({ data: result.results });
    }

    if (url.pathname === '/qa/nonconformities' && request.method === 'POST') {
      const actor = await authenticatedActor(request, env); const auth = protectedRoute(actor, id); if (auth) return auth;
      const input = await body<Record<string, unknown>>(request);
      const required = ['source','title','description','severity','owner_id','due_date'];
      if (!input || required.some((k) => typeof input[k] !== 'string' || !String(input[k]).trim())) return json({ error: { code: 'VALIDATION_ERROR', message: 'source, title, description, severity, owner_id and due_date are required' }, requestId: id }, 400);
      const severity = String(input.severity).toUpperCase();
      const sources = ['INTERNAL_AUDIT','REGULATORY_AUDIT','FDA_QUERY','CUSTOMER_COMPLAINT','SUPPLIER','DATA_INTEGRITY','LABEL_REVIEW','PROCESS','PRODUCT','OTHER'];
      if (!sources.includes(String(input.source).toUpperCase()) || !['LOW','MEDIUM','HIGH','CRITICAL'].includes(severity)) return json({ error: { code: 'VALIDATION_ERROR', message: 'Unsupported source or severity' }, requestId: id }, 400);
      const ncId = crypto.randomUUID();
      await env.DB.prepare('INSERT INTO nonconformities (id, source, source_record_id, title, description, severity, owner_id, due_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(ncId, String(input.source).toUpperCase(), input.source_record_id ? String(input.source_record_id) : null, String(input.title).trim(), String(input.description).trim(), severity, String(input.owner_id).trim(), String(input.due_date)).run();
      await audit(env, actor!, id, 'CREATE_NONCONFORMITY', 'NONCONFORMITY', ncId, undefined, 'OPEN');
      return json({ data: { id: ncId, status: 'OPEN' } }, 201);
    }

    const ncStatusMatch = url.pathname.match(/^\\/qa\\/nonconformities\\/([^/]+)\\/status$/);
    if (ncStatusMatch && request.method === 'POST') {
      const actor = await authenticatedActor(request, env); const auth = protectedRoute(actor, id); if (auth) return auth;
      const input = await body<{ status?: string }>(request); const status = input?.status?.toUpperCase();
      if (!['OPEN','UNDER_REVIEW','CONVERTED_TO_CAPA','CLOSED'].includes(status || '')) return json({ error: { code: 'VALIDATION_ERROR', message: 'Unsupported NC status' }, requestId: id }, 400);
      const current = await env.DB.prepare('SELECT status FROM nonconformities WHERE id = ?').bind(ncStatusMatch[1]).first<{ status: string }>();
      if (!current) return json({ error: { code: 'NOT_FOUND', message: 'Nonconformity not found' }, requestId: id }, 404);
      await env.DB.prepare('UPDATE nonconformities SET status = ? WHERE id = ?').bind(status, ncStatusMatch[1]).run();
      await audit(env, actor!, id, 'UPDATE_NONCONFORMITY_STATUS', 'NONCONFORMITY', ncStatusMatch[1], current.status, status);
      return json({ data: { id: ncStatusMatch[1], status } });
    }

    if (url.pathname === '/qa/capas' && request.method === 'GET') {
      const rows = await env.DB.prepare('SELECT c.*, n.title AS nonconformity_title, n.severity AS nonconformity_severity FROM capas c JOIN nonconformities n ON n.id = c.nonconformity_id ORDER BY c.created_at DESC').all();
      return json({ data: rows.results });
    }

    if (url.pathname === '/qa/capas' && request.method === 'POST') {
      const actor = await authenticatedActor(request, env); const auth = protectedRoute(actor, id); if (auth) return auth;
      const input = await body<{ nonconformity_id?: string; owner_id?: string }>(request);
      if (!input?.nonconformity_id || !input.owner_id) return json({ error: { code: 'VALIDATION_ERROR', message: 'nonconformity_id and owner_id are required' }, requestId: id }, 400);
      const nc = await env.DB.prepare('SELECT id, status FROM nonconformities WHERE id = ?').bind(input.nonconformity_id).first<{ id: string; status: string }>();
      if (!nc) return json({ error: { code: 'NOT_FOUND', message: 'Nonconformity not found' }, requestId: id }, 404);
      const capaId = crypto.randomUUID();
      await env.DB.prepare('INSERT INTO capas (id, nonconformity_id, owner_id) VALUES (?, ?, ?)').bind(capaId, input.nonconformity_id, input.owner_id).run();
      await env.DB.prepare("UPDATE nonconformities SET status = 'CONVERTED_TO_CAPA' WHERE id = ?").bind(input.nonconformity_id).run();
      await audit(env, actor!, id, 'CREATE_CAPA', 'CAPA', capaId, 'OPEN', 'OPEN');
      return json({ data: { id: capaId, status: 'OPEN' } }, 201);
    }

    const capaMatch = url.pathname.match(/^\\/qa\\/capas\\/([^/]+)$/);
    if (capaMatch && request.method === 'GET') {
      const capa = await env.DB.prepare('SELECT * FROM capas WHERE id = ?').bind(capaMatch[1]).first();
      if (!capa) return json({ error: { code: 'NOT_FOUND', message: 'CAPA not found' }, requestId: id }, 404);
      const actions = await env.DB.prepare('SELECT * FROM capa_actions WHERE capa_id = ? ORDER BY created_at').bind(capaMatch[1]).all();
      return json({ data: { ...capa, actions: actions.results } });
    }

    const capaActionMatch = url.pathname.match(/^\\/qa\\/capas\\/([^/]+)\\/actions$/);
    if (capaActionMatch && request.method === 'POST') {
      const actor = await authenticatedActor(request, env); const auth = protectedRoute(actor, id); if (auth) return auth;
      const input = await body<Record<string, unknown>>(request);
      const required = ['type','description','owner_id','due_date'];
      if (!input || required.some((k) => typeof input[k] !== 'string' || !String(input[k]).trim())) return json({ error: { code: 'VALIDATION_ERROR', message: 'type, description, owner_id and due_date are required' }, requestId: id }, 400);
      if (!['CORRECTION','CORRECTIVE_ACTION','PREVENTIVE_ACTION'].includes(String(input.type).toUpperCase())) return json({ error: { code: 'VALIDATION_ERROR', message: 'Unsupported action type' }, requestId: id }, 400);
      const capa = await env.DB.prepare('SELECT id FROM capas WHERE id = ?').bind(capaActionMatch[1]).first();
      if (!capa) return json({ error: { code: 'NOT_FOUND', message: 'CAPA not found' }, requestId: id }, 404);
      const actionId = crypto.randomUUID();
      await env.DB.prepare('INSERT INTO capa_actions (id, capa_id, type, description, owner_id, due_date) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(actionId, capaActionMatch[1], String(input.type).toUpperCase(), String(input.description).trim(), String(input.owner_id).trim(), String(input.due_date)).run();
      return json({ data: { id: actionId, status: 'OPEN' } }, 201);
    }

    const capaUpdateMatch = url.pathname.match(/^\\/qa\\/capas\\/([^/]+)\\/update$/);
    if (capaUpdateMatch && request.method === 'POST') {
      const actor = await authenticatedActor(request, env); const auth = protectedRoute(actor, id); if (auth) return auth;
      const input = await body<Record<string, unknown>>(request);
      const current = await env.DB.prepare('SELECT * FROM capas WHERE id = ?').bind(capaUpdateMatch[1]).first<Record<string, unknown>>();
      if (!current) return json({ error: { code: 'NOT_FOUND', message: 'CAPA not found' }, requestId: id }, 404);
      const allowed = ['OPEN','ROOT_CAUSE_ANALYSIS','ACTION_PLANNING','IMPLEMENTATION','EFFECTIVENESS_CHECK','REJECTED'];
      const nextStatus = input?.status ? String(input.status).toUpperCase() : String(current.status);
      if (!allowed.includes(nextStatus)) return json({ error: { code: 'VALIDATION_ERROR', message: 'Unsupported CAPA status' }, requestId: id }, 400);
      const rootCause = input?.root_cause !== undefined ? String(input.root_cause) : (current.root_cause as string | null);
      const criteria = input?.effectiveness_criteria !== undefined ? String(input.effectiveness_criteria) : (current.effectiveness_criteria as string | null);
      const verifiedBy = input?.verified_by !== undefined ? String(input.verified_by) : (current.verified_by as string | null);
      const verifiedAt = input?.verified_at !== undefined ? String(input.verified_at) : (current.verified_at as string | null);
      if (nextStatus === 'EFFECTIVENESS_CHECK' && (!rootCause || !criteria)) return json({ error: { code: 'CLOSURE_GATE', message: 'Root cause and effectiveness criteria are required before effectiveness check' }, requestId: id }, 400);
      if (nextStatus === 'CLOSED') return json({ error: { code: 'CLOSURE_GATE', message: 'Use effectiveness check and verified closure data before closing CAPA' }, requestId: id }, 400);
      await env.DB.prepare('UPDATE capas SET status = ?, root_cause_method = ?, root_cause = ?, containment = ?, effectiveness_criteria = ?, verified_by = ?, verified_at = ? WHERE id = ?')
        .bind(nextStatus, input?.root_cause_method ? String(input.root_cause_method) : (current.root_cause_method as string | null), input?.root_cause !== undefined ? rootCause : (current.root_cause as string | null), input?.containment !== undefined ? String(input.containment) : (current.containment as string | null), criteria, verifiedBy, verifiedAt, capaUpdateMatch[1]).run();
      await audit(env, actor!, id, 'UPDATE_CAPA', 'CAPA', capaUpdateMatch[1], String(current.status), nextStatus);
      return json({ data: { id: capaUpdateMatch[1], status: nextStatus } });
    }

    const capaCloseMatch = url.pathname.match(/^\\/qa\\/capas\\/([^/]+)\\/close$/);
    if (capaCloseMatch && request.method === 'POST') {
      const actor = await authenticatedActor(request, env); const auth = protectedRoute(actor, id); if (auth) return auth;
      const current = await env.DB.prepare('SELECT * FROM capas WHERE id = ?').bind(capaCloseMatch[1]).first<{ status:string; root_cause:string|null; effectiveness_criteria:string|null; verified_by:string|null; verified_at:string|null }>();
      if (!current) return json({ error: { code: 'NOT_FOUND', message: 'CAPA not found' }, requestId: id }, 404);
      const incomplete = await env.DB.prepare("SELECT COUNT(*) AS count FROM capa_actions WHERE capa_id = ? AND status != 'COMPLETED'").bind(capaCloseMatch[1]).first<{count:number}>();
      if (current.status !== 'EFFECTIVENESS_CHECK' || !current.root_cause || !current.effectiveness_criteria || !current.verified_by || !current.verified_at || (incomplete?.count ?? 0) > 0) return json({ error: { code: 'CLOSURE_GATE', message: 'CAPA closure requires root cause, effectiveness criteria, verification, and all actions completed' }, requestId: id }, 400);
      await env.DB.prepare("UPDATE capas SET status = 'CLOSED', closed_at = CURRENT_TIMESTAMP WHERE id = ?").bind(capaCloseMatch[1]).run();
      await audit(env, actor!, id, 'CLOSE_CAPA', 'CAPA', capaCloseMatch[1], 'EFFECTIVENESS_CHECK', 'CLOSED');
      return json({ data: { id: capaCloseMatch[1], status: 'CLOSED' } });
    }

    if (url.pathname === '/production/batches' && request.method === 'GET') {
      const rows = await env.DB.prepare('SELECT * FROM production_batches ORDER BY production_date DESC, created_at DESC').all();
      return json({ data: rows.results });
    }
    if (url.pathname === '/production/batches' && request.method === 'POST') {
      const actor = await authenticatedActor(request, env); const auth = protectedRoute(actor, id); if (auth) return auth;
      if (!requireRole(actor, ['QA','QC','R&D','RA'])) return json({error:{code:'FORBIDDEN',message:'QA/QC/R&D/RA role required'},requestId:id},403);
      const input = await body<Record<string,unknown>>(request);
      if (!input?.product_id || !input?.batch_lot || !input?.production_date) return json({error:{code:'VALIDATION_ERROR',message:'product_id, batch_lot and production_date are required'},requestId:id},400);
      const batchId=crypto.randomUUID();
      await env.DB.prepare('INSERT INTO production_batches (id,product_id,batch_lot,production_date,created_by) VALUES (?,?,?,?,?)').bind(batchId,String(input.product_id),String(input.batch_lot),String(input.production_date),actor!.id).run();
      await audit(env,actor!,id,'CREATE_PRODUCTION_BATCH','PRODUCTION_BATCH',batchId,undefined,'OPEN');
      return json({data:{id:batchId,status:'OPEN'}},201);
    }
    const batchMatch=url.pathname.match(/^\\/production\\/batches\\/([^/]+)$/);
    if(batchMatch && request.method==='GET'){
      const batch=await env.DB.prepare('SELECT * FROM production_batches WHERE id=?').bind(batchMatch[1]).first();
      if(!batch)return json({error:{code:'NOT_FOUND',message:'Batch not found'},requestId:id},404);
      const [process,qc,decisions]=await Promise.all([
        env.DB.prepare('SELECT * FROM production_process_records WHERE batch_id=? ORDER BY recorded_at').bind(batchMatch[1]).all(),
        env.DB.prepare('SELECT * FROM qc_checks WHERE batch_id=? ORDER BY created_at').bind(batchMatch[1]).all(),
        env.DB.prepare('SELECT * FROM product_release_decisions WHERE batch_id=? ORDER BY decided_at DESC').bind(batchMatch[1]).all()
      ]);
      return json({data:{...batch,process:process.results,qc:qc.results,decisions:decisions.results}});
    }
    const processMatch=url.pathname.match(/^\\/production\\/batches\\/([^/]+)\\/process$/);
    if(processMatch && request.method==='POST'){
      const actor=await authenticatedActor(request,env); const auth=protectedRoute(actor,id); if(auth)return auth;
      if(!requireRole(actor,['QA','QC','R&D']))return json({error:{code:'FORBIDDEN',message:'QA/QC/R&D role required'},requestId:id},403);
      const input=await body<Record<string,unknown>>(request);
      if(!input?.step_name || !input?.operator_id)return json({error:{code:'VALIDATION_ERROR',message:'step_name and operator_id are required'},requestId:id},400);
      const batch=await env.DB.prepare('SELECT id FROM production_batches WHERE id=?').bind(processMatch[1]).first();if(!batch)return json({error:{code:'NOT_FOUND',message:'Batch not found'},requestId:id},404);
      const pid=crypto.randomUUID();await env.DB.prepare('INSERT INTO production_process_records (id,batch_id,step_name,observed_value,unit,operator_id,evidence_ids_json) VALUES (?,?,?,?,?,?,?)').bind(pid,processMatch[1],String(input.step_name),input.observed_value?String(input.observed_value):null,input.unit?String(input.unit):null,String(input.operator_id),input.evidence_ids_json?String(input.evidence_ids_json):null).run();
      await env.DB.prepare("UPDATE production_batches SET status='IN_PROCESS',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='OPEN'").bind(processMatch[1]).run();
      return json({data:{id:pid}},201);
    }
    const qcMatch=url.pathname.match(/^\\/production\\/batches\\/([^/]+)\\/qc$/);
    if(qcMatch && request.method==='POST'){
      const actor=await authenticatedActor(request,env); const auth=protectedRoute(actor,id); if(auth)return auth;
      if(!requireRole(actor,['QC','QA']))return json({error:{code:'FORBIDDEN',message:'QC/QA role required'},requestId:id},403);
      const input=await body<Record<string,unknown>>(request);
      if(!input?.check_type || !input?.parameter)return json({error:{code:'VALIDATION_ERROR',message:'check_type and parameter are required'},requestId:id},400);
      if(!['INCOMING','IN_PROCESS','FINISHED_PRODUCT'].includes(String(input.check_type)))return json({error:{code:'VALIDATION_ERROR',message:'Unsupported check_type'},requestId:id},400);
      if(input.result_status && !['PENDING','PASS','FAIL','N_A','HOLD'].includes(String(input.result_status)))return json({error:{code:'VALIDATION_ERROR',message:'Unsupported result_status'},requestId:id},400);
      const batch=await env.DB.prepare('SELECT id FROM production_batches WHERE id=?').bind(qcMatch[1]).first();if(!batch)return json({error:{code:'NOT_FOUND',message:'Batch not found'},requestId:id},404);
      const qid=crypto.randomUUID();await env.DB.prepare('INSERT INTO qc_checks (id,batch_id,check_type,parameter,specification,result_value,unit,result_status,checked_by,checked_at,evidence_ids_json) VALUES (?,?,?,?,?,?,?,?,?,?,?)').bind(qid,qcMatch[1],String(input.check_type),String(input.parameter),input.specification?String(input.specification):null,input.result_value?String(input.result_value):null,input.unit?String(input.unit):null,input.result_status?String(input.result_status):'PENDING',actor!.id,input.result_status&&input.result_status!=='PENDING'?new Date().toISOString():null,input.evidence_ids_json?String(input.evidence_ids_json):null).run();
      await env.DB.prepare("UPDATE production_batches SET status='QC_PENDING',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(qcMatch[1]).run();
      return json({data:{id:qid}},201);
    }
    const qcu=url.pathname.match(/^\\/production\\/qc\\/([^/]+)\\/result$/);
    if(qcu && request.method==='POST'){
      const actor=await authenticatedActor(request,env); const auth=protectedRoute(actor,id); if(auth)return auth;
      if(!requireRole(actor,['QC','QA']))return json({error:{code:'FORBIDDEN',message:'QC/QA role required'},requestId:id},403);
      const input=await body<Record<string,unknown>>(request);const status=String(input?.result_status||'').toUpperCase();if(!['PASS','FAIL','N_A','HOLD','PENDING'].includes(status))return json({error:{code:'VALIDATION_ERROR',message:'Unsupported result_status'},requestId:id},400);
      const current=await env.DB.prepare('SELECT batch_id,result_status FROM qc_checks WHERE id=?').bind(qcu[1]).first<{batch_id:string;result_status:string}>();if(!current)return json({error:{code:'NOT_FOUND',message:'QC check not found'},requestId:id},404);
      await env.DB.prepare('UPDATE qc_checks SET result_status=?,result_value=?,checked_by=?,checked_at=? WHERE id=?').bind(status,input.result_value?String(input.result_value):null,actor!.id,new Date().toISOString(),qcu[1]).run();
      await audit(env,actor!,id,'UPDATE_QC_RESULT','QC_CHECK',qcu[1],current.result_status,status);
      return json({data:{id:qcu[1],status}});
    }
    const rel=url.pathname.match(/^\\/production\\/batches\\/([^/]+)\\/release$/);
    if(rel && request.method==='POST'){
      const actor=await authenticatedActor(request,env); const auth=protectedRoute(actor,id); if(auth)return auth;
      if(!requireRole(actor,['QA']))return json({error:{code:'FORBIDDEN',message:'QA role required for release decision'},requestId:id},403);
      const input=await body<{decision?:string;reason?:string}>(request);const decision=String(input?.decision||'').toUpperCase();if(!['HOLD','RELEASE','REJECT'].includes(decision))return json({error:{code:'VALIDATION_ERROR',message:'Unsupported release decision'},requestId:id},400);
      const batch=await env.DB.prepare('SELECT id FROM production_batches WHERE id=?').bind(rel[1]).first();if(!batch)return json({error:{code:'NOT_FOUND',message:'Batch not found'},requestId:id},404);
      const fail=await env.DB.prepare("SELECT COUNT(*) AS count FROM qc_checks WHERE batch_id=? AND result_status IN ('FAIL','HOLD')").bind(rel[1]).first<{count:number}>();
      if(decision==='RELEASE' && (fail?.count||0)>0)return json({error:{code:'RELEASE_GATE',message:'Cannot release while QC contains FAIL or HOLD'},requestId:id},409);
      const did=crypto.randomUUID();await env.DB.prepare('INSERT INTO product_release_decisions (id,batch_id,decision,reason,decided_by) VALUES (?,?,?,?,?)').bind(did,rel[1],decision,input?.reason?String(input.reason):null,actor!.id).run();
      const next=decision==='RELEASE'?'RELEASED':decision==='HOLD'?'HOLD':'CLOSED';await env.DB.prepare('UPDATE production_batches SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(next,rel[1]).run();
      await audit(env,actor!,id,'PRODUCT_RELEASE_DECISION','PRODUCTION_BATCH',rel[1],undefined,decision);return json({data:{id:did,decision,status:next}});
    }

    if (url.pathname === '/training/requirements' && request.method === 'GET') { const rows=await env.DB.prepare('SELECT * FROM training_requirements ORDER BY created_at DESC').all(); return json({data:rows.results}); }
    if (url.pathname === '/training/requirements' && request.method === 'POST') { const actor=await authenticatedActor(request,env);const auth=protectedRoute(actor,id);if(auth)return auth; if(!requireRole(actor,['DCC','QA','RA','QC']))return json({error:{code:'FORBIDDEN',message:'DCC/QA/RA/QC role required'},requestId:id},403); const input=await body<Record<string,unknown>>(request); if(!input?.type||!input?.source_record_id||!input?.role_ids_json)return json({error:{code:'VALIDATION_ERROR',message:'type, source_record_id and role_ids_json are required'},requestId:id},400); if(!['DOCUMENT_REVISION','REGULATORY_CHANGE','PROCESS_CHANGE','ROLE_COMPETENCY','CAPA'].includes(String(input.type)))return json({error:{code:'VALIDATION_ERROR',message:'Unsupported training type'},requestId:id},400); const tid=crypto.randomUUID(); await env.DB.prepare('INSERT INTO training_requirements (id,type,source_record_id,document_revision,role_ids_json,required_by,status,completion_evidence_ids_json) VALUES (?,?,?,?,?,?,?,?)').bind(tid,String(input.type),String(input.source_record_id),input.document_revision?String(input.document_revision):null,String(input.role_ids_json),input.required_by?String(input.required_by):null,input.status?String(input.status):'REQUIRED',input.completion_evidence_ids_json?String(input.completion_evidence_ids_json):null).run(); return json({data:{id:tid,status:input.status||'REQUIRED'}},201); }
    const trm=url.pathname.match(/^\\/training\\/requirements\\/([^/]+)\\/status$/); if(trm&&request.method==='POST'){const actor=await authenticatedActor(request,env);const auth=protectedRoute(actor,id);if(auth)return auth;const input=await body<{status?:string;completion_evidence_ids_json?:string}>(request);const status=String(input?.status||'').toUpperCase();if(!['REQUIRED','ASSIGNED','IN_PROGRESS','COMPLETED','WAIVED','OVERDUE','CANCELLED'].includes(status))return json({error:{code:'VALIDATION_ERROR',message:'Unsupported training status'},requestId:id},400);const cur=await env.DB.prepare('SELECT status FROM training_requirements WHERE id=?').bind(trm[1]).first<{status:string}>();if(!cur)return json({error:{code:'NOT_FOUND',message:'Training requirement not found'},requestId:id},404);if(['COMPLETED','WAIVED'].includes(status)&&!input?.completion_evidence_ids_json)return json({error:{code:'EVIDENCE_REQUIRED',message:'Completion evidence is required'},requestId:id},400);await env.DB.prepare('UPDATE training_requirements SET status=?,completion_evidence_ids_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(status,input?.completion_evidence_ids_json||null,trm[1]).run();await audit(env,actor!,id,'UPDATE_TRAINING_STATUS','TRAINING_REQUIREMENT',trm[1],cur.status,status);return json({data:{id:trm[1],status}});}
    if(url.pathname==='/training/competencies'&&request.method==='GET'){const rows=await env.DB.prepare('SELECT * FROM competency_records ORDER BY assessed_date DESC').all();return json({data:rows.results});}
    if(url.pathname==='/training/competencies'&&request.method==='POST'){const actor=await authenticatedActor(request,env);const auth=protectedRoute(actor,id);if(auth)return auth;if(!requireRole(actor,['QA','DCC']))return json({error:{code:'FORBIDDEN',message:'QA/DCC role required'},requestId:id},403);const input=await body<Record<string,unknown>>(request);if(!input?.user_id||!input?.competency_code||!input?.assessed_date||!input?.assessor_id)return json({error:{code:'VALIDATION_ERROR',message:'user_id, competency_code, assessed_date and assessor_id are required'},requestId:id},400);const cid=crypto.randomUUID();await env.DB.prepare('INSERT INTO competency_records (id,user_id,competency_code,assessed_date,assessor_id,valid_until,evidence_ids_json,status) VALUES (?,?,?,?,?,?,?,?)').bind(cid,String(input.user_id),String(input.competency_code),String(input.assessed_date),String(input.assessor_id),input.valid_until?String(input.valid_until):null,input.evidence_ids_json?String(input.evidence_ids_json):null,input.status?String(input.status):'UNDER_REVIEW').run();return json({data:{id:cid}},201);}
    if(url.pathname==='/traceability/events'&&request.method==='GET'){const rows=await env.DB.prepare('SELECT * FROM traceability_events ORDER BY event_date DESC,created_at DESC').all();return json({data:rows.results});}
    if(url.pathname==='/traceability/events'&&request.method==='POST'){const actor=await authenticatedActor(request,env);const auth=protectedRoute(actor,id);if(auth)return auth;if(!requireRole(actor,['QA','QC','RA']))return json({error:{code:'FORBIDDEN',message:'QA/QC/RA role required'},requestId:id},403);const input=await body<Record<string,unknown>>(request);if(!input?.event_type||!input?.event_date)return json({error:{code:'VALIDATION_ERROR',message:'event_type and event_date are required'},requestId:id},400);if(!['RECEIPT','PRODUCTION','PACKING','RELEASE','DISTRIBUTION','HOLD','WITHDRAWAL','RECALL'].includes(String(input.event_type)))return json({error:{code:'VALIDATION_ERROR',message:'Unsupported event type'},requestId:id},400);const eid=crypto.randomUUID();await env.DB.prepare('INSERT INTO traceability_events (id,event_type,from_type,from_id,to_type,to_id,event_date,evidence_ids_json,created_by) VALUES (?,?,?,?,?,?,?,?,?)').bind(eid,String(input.event_type),input.from_type?String(input.from_type):null,input.from_id?String(input.from_id):null,input.to_type?String(input.to_type):null,input.to_id?String(input.to_id):null,String(input.event_date),input.evidence_ids_json?String(input.evidence_ids_json):null,actor!.id).run();return json({data:{id:eid}},201);}
    if(url.pathname==='/recalls'&&request.method==='GET'){const rows=await env.DB.prepare('SELECT * FROM recall_cases ORDER BY created_at DESC').all();return json({data:rows.results});}
    if(url.pathname==='/recalls'&&request.method==='POST'){const actor=await authenticatedActor(request,env);const auth=protectedRoute(actor,id);if(auth)return auth;if(!requireRole(actor,['QA','RA']))return json({error:{code:'FORBIDDEN',message:'QA/RA role required'},requestId:id},403);const input=await body<Record<string,unknown>>(request);if(!input?.product_id||!input?.reason)return json({error:{code:'VALIDATION_ERROR',message:'product_id and reason are required'},requestId:id},400);const rid=crypto.randomUUID();await env.DB.prepare('INSERT INTO recall_cases (id,product_id,reason,linked_nonconformity_id,linked_capa_id,evidence_ids_json,created_by) VALUES (?,?,?,?,?,?,?)').bind(rid,String(input.product_id),String(input.reason),input.linked_nonconformity_id?String(input.linked_nonconformity_id):null,input.linked_capa_id?String(input.linked_capa_id):null,input.evidence_ids_json?String(input.evidence_ids_json):null,actor!.id).run();await audit(env,actor!,id,'CREATE_RECALL_CASE','RECALL',rid,undefined,'OPEN');return json({data:{id:rid,status:'OPEN'}},201);}
    const recallMatch=url.pathname.match(/^\\/recalls\\/([^/]+)$/);if(recallMatch&&request.method==='GET'){const rc=await env.DB.prepare('SELECT * FROM recall_cases WHERE id=?').bind(recallMatch[1]).first();if(!rc)return json({error:{code:'NOT_FOUND',message:'Recall case not found'},requestId:id},404);const lots=await env.DB.prepare('SELECT * FROM recall_affected_lots WHERE recall_id=?').bind(recallMatch[1]).all();return json({data:{...rc,affectedLots:lots.results}});}
    const recallLot=url.pathname.match(/^\\/recalls\\/([^/]+)\\/lots$/);if(recallLot&&request.method==='POST'){const actor=await authenticatedActor(request,env);const auth=protectedRoute(actor,id);if(auth)return auth;if(!requireRole(actor,['QA','RA']))return json({error:{code:'FORBIDDEN',message:'QA/RA role required'},requestId:id},403);const input=await body<{batch_lot?:string}>(request);if(!input?.batch_lot)return json({error:{code:'VALIDATION_ERROR',message:'batch_lot is required'},requestId:id},400);const rc=await env.DB.prepare('SELECT id FROM recall_cases WHERE id=?').bind(recallLot[1]).first();if(!rc)return json({error:{code:'NOT_FOUND',message:'Recall case not found'},requestId:id},404);const lid=crypto.randomUUID();await env.DB.prepare('INSERT INTO recall_affected_lots (id,recall_id,batch_lot) VALUES (?,?,?)').bind(lid,recallLot[1],input.batch_lot).run();return json({data:{id:lid}},201);}
    const recallStatus=url.pathname.match(/^\\/recalls\\/([^/]+)\\/status$/);if(recallStatus&&request.method==='POST'){const actor=await authenticatedActor(request,env);const auth=protectedRoute(actor,id);if(auth)return auth;if(!requireRole(actor,['QA','RA']))return json({error:{code:'FORBIDDEN',message:'QA/RA role required'},requestId:id},403);const input=await body<{status?:string}>(request);const status=String(input?.status||'').toUpperCase();if(!['OPEN','ASSESSMENT','ACTION','VERIFICATION','CLOSED'].includes(status))return json({error:{code:'VALIDATION_ERROR',message:'Unsupported recall status'},requestId:id},400);const cur=await env.DB.prepare('SELECT status FROM recall_cases WHERE id=?').bind(recallStatus[1]).first<{status:string}>();if(!cur)return json({error:{code:'NOT_FOUND',message:'Recall case not found'},requestId:id},404);if(status==='CLOSED'){const rc=await env.DB.prepare('SELECT evidence_ids_json FROM recall_cases WHERE id=?').bind(recallStatus[1]).first<{evidence_ids_json:string|null}>();if(!rc?.evidence_ids_json)return json({error:{code:'CLOSURE_GATE',message:'Recall closure requires evidence trail'},requestId:id},409);}await env.DB.prepare('UPDATE recall_cases SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(status,recallStatus[1]).run();await audit(env,actor!,id,'UPDATE_RECALL_STATUS','RECALL',recallStatus[1],cur.status,status);return json({data:{id:recallStatus[1],status}});}

    if (request.method === 'GET' && url.pathname === '/documents') {
      const type = url.searchParams.get('type');
      const department = url.searchParams.get('department');
      let sql = 'SELECT id, document_code, document_name, document_type, department, revision, status, owner_id, created_at, updated_at FROM documents';
      const conditions: string[] = [];
      const params: string[] = [];
      if (type) { conditions.push('document_type = ?'); params.push(type); }
      if (department) { conditions.push('department = ?'); params.push(department); }
      if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
      sql += ' ORDER BY document_type, document_code';
      const rows = await env.DB.prepare(sql).bind(...params).all();
      return json({ data: rows.results, requestId: id });
    }

    if (request.method === 'GET' && url.pathname === '/audit') {
      const recordType = url.searchParams.get('recordType');
      const recordId = url.searchParams.get('recordId');
      const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 50), 1), 100);
      let sql = 'SELECT id, actor_id, actor_role, occurred_at, action, module, record_type, record_id, previous_state, new_state, reason, request_id FROM audit_events';
      const params: string[] = [];
      if (recordType && recordId) {
        sql += ' WHERE record_type = ? AND record_id = ?';
        params.push(recordType, recordId);
      } else if (recordType) {
        sql += ' WHERE record_type = ?';
        params.push(recordType);
      }
      sql += ' ORDER BY occurred_at DESC LIMIT ?';
      const rows = await env.DB.prepare(sql).bind(...params, limit).all();
      return json({ data: rows.results, requestId: id });
    }

    const formulaValidateRoute = url.pathname.match(/^\/products\/([a-f0-9-]+)\/formulas\/validate$/);
    if (request.method === 'POST' && formulaValidateRoute) {
      if (!actor) return json({ error: { code: 'UNAUTHENTICATED', message: 'Login required' }, requestId: id }, 401);
      if (!requireRole(actor, ['RA', 'R&D', 'QA'])) return json({ error: { code: 'FORBIDDEN', message: 'RA, R&D or QA role required' }, requestId: id }, 403);
      const productId = formulaValidateRoute[1];
      const product = await env.DB.prepare('SELECT id FROM products WHERE id = ?').bind(productId).first<{ id: string }>();
      if (!product) return json({ error: { code: 'NOT_FOUND', message: 'Product not found' }, requestId: id }, 404);
      const input = await body<FormulaInput>(request);
      if (!input || !input.formula_code?.trim() || !input.formula_name?.trim() || !input.ingredients_json) return json({ error: { code: 'VALIDATION_ERROR', message: 'formula_code, formula_name and ingredients_json are required' }, requestId: id }, 400);
      const validation = validateFormulaIngredients(input.ingredients_json);
      if (!validation.isValid) return json({ success: false, error: { code: 'FORMULA_VALIDATION_FAILED', message: 'Formula validation failed', errors: validation.errors, validation_score: validation.score }, requestId: id }, 400);
      const formulaId = crypto.randomUUID();
      try {
        await env.DB.batch([
          env.DB.prepare('INSERT INTO formula_control (id, product_id, formula_code, formula_name, ingredients_json, validation_score, validation_status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(formulaId, productId, input.formula_code.trim(), input.formula_name.trim(), JSON.stringify(input.ingredients_json), validation.score, 'VALIDATED_100_PERCENT', actor.id),
          env.DB.prepare('INSERT INTO audit_events (id, actor_id, actor_role, action, module, record_type, record_id, new_state, request_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), actor.id, actorRole(actor), 'VALIDATE_FORMULA', 'REGULATORY_AFFAIRS', 'FORMULA', formulaId, 'VALIDATED_100_PERCENT', id),
        ]);
      } catch (error: any) {
        if (String(error?.message ?? '').includes('UNIQUE')) return json({ error: { code: 'CONFLICT', message: 'Formula code already exists for this product' }, requestId: id }, 409);
        console.error('VALIDATE_FORMULA_FAILED', error);
        return json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to create formula' }, requestId: id }, 500);
      }
      const created = await env.DB.prepare('SELECT id, product_id, formula_code, formula_name, ingredients_json, validation_score, validation_status FROM formula_control WHERE id = ?').bind(formulaId).first<FormulaRow>();
      if (!created) return json({ error: { code: 'NOT_FOUND', message: 'Formula record not found after create' }, requestId: id }, 404);
      return json({ success: true, data: { id: created.id, product_id: created.product_id, formula_code: created.formula_code, formula_name: created.formula_name, ingredients_json: parseIngredientsJson(created.ingredients_json) ?? [], validation_score: created.validation_score, validation_status: created.validation_status, message: 'สูตรได้รับการตรวจสอบ 100% เรียบร้อย' }, requestId: id }, 201);
    }

    const formulaPatchRoute = url.pathname.match(/^\/products\/([a-f0-9-]+)\/formulas\/([a-f0-9-]+)$/);
    if (request.method === 'PATCH' && formulaPatchRoute) {
      if (!actor) return json({ error: { code: 'UNAUTHENTICATED', message: 'Login required' }, requestId: id }, 401);
      if (!requireRole(actor, ['RA', 'R&D', 'QA'])) return json({ error: { code: 'FORBIDDEN', message: 'RA, R&D or QA role required' }, requestId: id }, 403);
      const productId = formulaPatchRoute[1], formulaId = formulaPatchRoute[2];
      const product = await env.DB.prepare('SELECT id FROM products WHERE id = ?').bind(productId).first<{ id: string }>();
      if (!product) return json({ error: { code: 'NOT_FOUND', message: 'Product not found' }, requestId: id }, 404);
      const existing = await env.DB.prepare('SELECT id, product_id, formula_code, formula_name, ingredients_json, validation_status FROM formula_control WHERE id = ? AND product_id = ?').bind(formulaId, productId).first<FormulaRow>();
      if (!existing) return json({ error: { code: 'NOT_FOUND', message: 'Formula not found' }, requestId: id }, 404);
      const input = await body<FormulaInput>(request);
      if (!input) return json({ error: { code: 'VALIDATION_ERROR', message: 'Request body is required' }, requestId: id }, 400);
      const formulaName = input.formula_name?.trim() || existing.formula_name;
      const ingredientList = input.ingredients_json ?? parseIngredientsJson(existing.ingredients_json) ?? [];
      const validation = validateFormulaIngredients(ingredientList);
      if (!validation.isValid) return json({ success: false, error: { code: 'FORMULA_VALIDATION_FAILED', message: 'Formula validation failed', errors: validation.errors, validation_score: validation.score }, requestId: id }, 400);
      const previousStatus = existing.validation_status;
      const nextStatus = validation.score === 100 ? 'VALIDATED_100_PERCENT' : 'REJECTED';
      try {
        await env.DB.batch([
          env.DB.prepare('UPDATE formula_control SET formula_name = ?, ingredients_json = ?, validation_score = ?, validation_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(formulaName, JSON.stringify(ingredientList), validation.score, nextStatus, formulaId),
          env.DB.prepare('INSERT INTO audit_events (id, actor_id, actor_role, action, module, record_type, record_id, previous_state, new_state, request_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), actor.id, actorRole(actor), 'UPDATE_FORMULA', 'REGULATORY_AFFAIRS', 'FORMULA', formulaId, previousStatus, nextStatus, id),
        ]);
      } catch (error: any) {
        console.error('UPDATE_FORMULA_FAILED', error);
        return json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to update formula' }, requestId: id }, 500);
      }
      const updated = await env.DB.prepare('SELECT id, product_id, formula_code, formula_name, ingredients_json, validation_score, validation_status, updated_at FROM formula_control WHERE id = ?').bind(formulaId).first<FormulaRow>();
      if (!updated) return json({ error: { code: 'NOT_FOUND', message: 'Formula not found after update' }, requestId: id }, 404);
      return json({ success: true, data: { id: updated.id, product_id: updated.product_id, formula_code: updated.formula_code, formula_name: updated.formula_name, ingredients_json: parseIngredientsJson(updated.ingredients_json) ?? [], validation_score: updated.validation_score, validation_status: updated.validation_status, updated_at: updated.updated_at, message: 'สูตรได้รับการอัปเดตและตรวจสอบ 100% เรียบร้อย' }, requestId: id });
    }

    const formulaGetDetailRoute = url.pathname.match(/^\/products\/([a-f0-9-]+)\/formulas\/([a-f0-9-]+)$/);
    if (request.method === 'GET' && formulaGetDetailRoute) {
      const productId = formulaGetDetailRoute[1], formulaId = formulaGetDetailRoute[2];
      const formula = await env.DB.prepare('SELECT id, product_id, formula_code, formula_name, ingredients_json, validation_score, validation_status, created_at, updated_at FROM formula_control WHERE id = ? AND product_id = ?').bind(formulaId, productId).first<FormulaRow>();
      if (!formula) return json({ error: { code: 'NOT_FOUND', message: 'Formula not found' }, requestId: id }, 404);
      return json({ data: { id: formula.id, product_id: formula.product_id, formula_code: formula.formula_code, formula_name: formula.formula_name, ingredients_json: parseIngredientsJson(formula.ingredients_json) ?? [], validation_score: formula.validation_score, validation_status: formula.validation_status, created_at: formula.created_at, updated_at: formula.updated_at }, requestId: id });
    }

    const formulaListRoute = url.pathname.match(/^\/products\/([a-f0-9-]+)\/formulas$/);
    if (request.method === 'GET' && formulaListRoute) {
      const productId = formulaListRoute[1];
      const product = await env.DB.prepare('SELECT id FROM products WHERE id = ?').bind(productId).first<{ id: string }>();
      if (!product) return json({ error: { code: 'NOT_FOUND', message: 'Product not found' }, requestId: id }, 404);
      const formulas = await env.DB.prepare('SELECT id, product_id, formula_code, formula_name, ingredients_json, validation_score, validation_status, created_at, updated_at FROM formula_control WHERE product_id = ? ORDER BY created_at DESC').bind(productId).all<FormulaRow>();
      return json({ data: formulas.results.map((row) => ({ id: row.id, product_id: row.product_id, formula_code: row.formula_code, formula_name: row.formula_name, validation_score: row.validation_score, validation_status: row.validation_status, created_at: row.created_at, updated_at: row.updated_at, ingredients_json: parseIngredientsJson(row.ingredients_json) ?? [] })), requestId: id });
    }

    if (env.ASSETS) return env.ASSETS.fetch(request);
    return json({ error: { code: 'NOT_FOUND', message: 'Route not found' }, requestId: id }, 404);
  },
} satisfies ExportedHandler<Env>;


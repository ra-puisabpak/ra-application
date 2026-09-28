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
type FormulaInput = { formula_code?: string; formula_name?: string; ingredients_json?: Array<{ ingredient_name?: string; percentage?: number }> };
type FormulaValidationResult = { id: string; product_id: string; formula_code: string; validation_score: number; validation_status: string };
type FormulaRow = { id: string; product_id: string; formula_code: string; formula_name: string; ingredients_json: string; validation_score: number; validation_status: string; created_at?: string; updated_at?: string };

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
  '/formulas',
].some((prefix) => pathname === prefix || pathname.startsWith(prefix));

const productFromRow = (row: Record<string, unknown>): Product => ({
  id: String(row.id), productCode: String(row.product_code), thaiName: String(row.thai_name),
  englishName: row.english_name === null ? null : String(row.english_name), siteId: String(row.site_id),
  revision: String(row.revision), state: String(row.state), version: Number(row.version),
});

const formulaFromRow = (row: Record<string, unknown>): FormulaValidationResult => ({
  id: String(row.id),
  product_id: String(row.product_id),
  formula_code: String(row.formula_code),
  validation_score: Number(row.validation_score),
  validation_status: String(row.validation_status),
});

async function authenticatedActor(request: Request, env: Env): Promise<Actor | null> {
  const email = request.headers.get('cf-access-authenticated-user-email')?.trim().toLowerCase();
  if (!email) return null;

  try {
    const user = await env.DB.prepare('SELECT id, email FROM users WHERE email = ? AND active = 1').bind(email).first<{ id: string; email: string }>();
    if (!user) return null;
    const roles = await env.DB.prepare('SELECT role, can_approve FROM user_roles WHERE user_id = ?').bind(user.id).all<{ role: string; can_approve: number }>();
    return {
      id: user.id,
      email: user.email,
      roles: roles.results.map((row) => ({ role: row.role, canApprove: row.can_approve === 1 })),
    };
  } catch (error) {
    console.error('AUTH_LOOKUP_FAILED', { email, error });
    return null;
  }
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

function validateFormulaIngredients(ingredients: unknown): { isValid: boolean; score: number; errors: string[] } {
  const errors: string[] = [];

  if (!Array.isArray(ingredients)) {
    return { isValid: false, score: 0, errors: ['Ingredients must be an array'] };
  }

  if (ingredients.length === 0) {
    return { isValid: false, score: 0, errors: ['At least one ingredient is required'] };
  }

  let totalPercentage = 0;

  for (let i = 0; i < ingredients.length; i++) {
    const ing = ingredients[i] as Record<string, unknown>;

    if (!ing.ingredient_name || typeof ing.ingredient_name !== 'string' || !ing.ingredient_name.trim()) {
      errors.push(`Ingredient ${i + 1}: ingredient_name is required and must be a non-empty string`);
    }

    if (ing.percentage === undefined || ing.percentage === null) {
      errors.push(`Ingredient ${i + 1}: percentage is required`);
    } else if (typeof ing.percentage !== 'number' || ing.percentage < 0) {
      errors.push(`Ingredient ${i + 1}: percentage must be a non-negative number`);
    } else {
      totalPercentage += ing.percentage;
    }
  }

  const score = totalPercentage === 100 ? 100 : Math.round(totalPercentage);
  const isValid = errors.length === 0 && totalPercentage === 100;

  if (!isValid && totalPercentage !== 100) {
    errors.push(`Total percentage is ${totalPercentage}%, must be exactly 100%`);
  }

  return { isValid, score, errors };
}

function parseIngredientsJson(jsonStr: unknown): Array<{ ingredient_name: string; percentage: number }> | null {
  try {
    const parsed = JSON.parse(String(jsonStr));
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
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
        FROM tasks t WHERE t.owner_id = ? ORDER BY overdue DESC, CASE t.priority WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 WHEN 'NORMAL' THEN 3 ELSE 4 END, t.due_date`).bind(effectiveActor.id).all<Record<string, unknown>>();
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
      const pendingApprovals = await env.DB.prepare("SELECT COUNT(*) AS count FROM approval_steps WHERE status = 'PENDING' AND required_role IN (SELECT role FROM user_roles WHERE user_id = ?)").bind(effectiveActor.id).first<{ count: number }>();
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
      if (!await hasVerifiedEvidence(env, 'PRODUCT', product.id, product.revision)) return json({ error: { code: 'VERIFIED_EVIDENCE_REQUIRED', message: 'At least one verified evidence record is required' }, requestId: id }, 409);
      await env.DB.batch([
        env.DB.prepare("UPDATE products SET state = 'PENDING_APPROVAL', updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(product.id),
        env.DB.prepare("INSERT INTO approval_steps (id, record_type, record_id, revision, sequence, required_role, status) VALUES (?, 'PRODUCT', ?, ?, 1, 'RA', 'PENDING')").bind(crypto.randomUUID(), product.id, product.revision),
        env.DB.prepare("INSERT INTO approval_steps (id, record_type, record_id, revision, sequence, required_role, status) VALUES (?, 'PRODUCT', ?, ?, 2, 'MANAGEMENT', 'WAITING')").bind(crypto.randomUUID(), product.id, product.revision),
        env.DB.prepare('INSERT INTO audit_events (id, actor_id, actor_role, action, module, record_type, record_id, previous_state, new_state, request_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), actor.id, actorRole(actor), 'SUBMIT', 'REGULATORY_AFFAIRS', 'PRODUCT', product.id, 'DRAFT', 'PENDING_APPROVAL', id),
      ]);
      return json({ data: { productId: product.id, revision: product.revision, state: 'PENDING_APPROVAL' }, requestId: id });
    }

    // ========== FORMULA VALIDATION API ==========
    const formulaValidateRoute = url.pathname.match(/^\/products\/([a-f0-9-]+)\/formulas\/validate$/);
    if (request.method === 'POST' && formulaValidateRoute) {
      if (!actor) return json({ error: { code: 'UNAUTHENTICATED', message: 'Login required' }, requestId: id }, 401);
      if (!requireRole(actor, ['RA', 'R&D', 'QA'])) return json({ error: { code: 'FORBIDDEN', message: 'RA, R&D or QA role required' }, requestId: id }, 403);

      const productId = formulaValidateRoute[1];
      const product = await env.DB.prepare('SELECT id FROM products WHERE id = ?').bind(productId).first<{ id: string }>();
      if (!product) return json({ error: { code: 'NOT_FOUND', message: 'Product not found' }, requestId: id }, 404);

      const input = await body<FormulaInput>(request);
      if (!input?.formula_code?.trim() || !input.formula_name?.trim() || !input.ingredients_json) {
        return json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'formula_code, formula_name and ingredients_json are required'
          },
          requestId: id
        }, 400);
      }

      const validation = validateFormulaIngredients(input.ingredients_json);

      if (!validation.isValid) {
        return json({
          success: false,
          error: {
            code: 'FORMULA_VALIDATION_FAILED',
            message: 'Formula validation failed',
            errors: validation.errors,
            validation_score: validation.score
          },
          requestId: id
        }, 400);
      }

      const formulaId = crypto.randomUUID();
      const ingredientsJson = JSON.stringify(input.ingredients_json);

      try {
        await env.DB.batch([
          env.DB.prepare(`
            INSERT INTO formula_control (
              id, product_id, formula_code, formula_name, ingredients_json, validation_score, validation_status, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            formulaId,
            productId,
            input.formula_code.trim(),
            input.formula_name.trim(),
            ingredientsJson,
            validation.score,
            validation.score === 100 ? 'VALIDATED_100_PERCENT' : 'REJECTED',
            actor.id
          ),
          env.DB.prepare(`
            INSERT INTO audit_events (
              id, actor_id, actor_role, action, module, record_type, record_id, new_state, request_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            crypto.randomUUID(),
            actor.id,
            actorRole(actor),
            'VALIDATE_FORMULA',
            'REGULATORY_AFFAIRS',
            'FORMULA',
            formulaId,
            validation.score === 100 ? 'VALIDATED_100_PERCENT' : 'REJECTED',
            id
          )
        ]);
      } catch (error: any) {
        if (error.message?.includes('UNIQUE')) {
          return json({
            error: { code: 'CONFLICT', message: 'Formula code already exists for this product' },
            requestId: id
          }, 409);
        }
        throw error;
      }

      const created = await env.DB.prepare(`
        SELECT id, product_id, formula_code, validation_score, validation_status
        FROM formula_control
        WHERE id = ?
      `).bind(formulaId).first<Record<string, unknown>>();

      return json({
        success: validation.score === 100,
        data: {
          ...formulaFromRow(created!),
          message: validation.score === 100 ? 'สูตรได้รับการตรวจสอบ 100% เรียบร้อย' : 'สูตรไม่ถูกต้อง โปรดตรวจสอบข้อมูลใหม่'
        },
        requestId: id
      }, 201);
    }

    // ========== UPDATE FORMULA API (PATCH) ==========
    const formulaUpdateRoute = url.pathname.match(/^\/products\/([a-f0-9-]+)\/formulas\/([a-f0-9-]+)$/);
    if (request.method === 'PATCH' && formulaUpdateRoute) {
      if (!actor) return json({ error: { code: 'UNAUTHENTICATED', message: 'Login required' }, requestId: id }, 401);
      if (!requireRole(actor, ['RA', 'R&D', 'QA'])) return json({ error: { code: 'FORBIDDEN', message: 'RA, R&D or QA role required' }, requestId: id }, 403);

      const [productId, formulaId] = [formulaUpdateRoute[1], formulaUpdateRoute[2]];
      
      const product = await env.DB.prepare('SELECT id FROM products WHERE id = ?').bind(productId).first<{ id: string }>();
      if (!product) return json({ error: { code: 'NOT_FOUND', message: 'Product not found' }, requestId: id }, 404);

      const existing = await env.DB.prepare(`
        SELECT id, product_id, formula_code, formula_name, ingredients_json, validation_status
        FROM formula_control
        WHERE id = ? AND product_id = ?
      `).bind(formulaId, productId).first<FormulaRow>();
      
      if (!existing) return json({ error: { code: 'NOT_FOUND', message: 'Formula not found' }, requestId: id }, 404);

      const input = await body<FormulaInput>(request);
      if (!input) return json({ error: { code: 'VALIDATION_ERROR', message: 'Request body is required' }, requestId: id }, 400);

      const formulaName = input.formula_name?.trim() || existing.formula_name;
      let ingredientsArray = input.ingredients_json;

      if (!ingredientsArray) {
        const parsed = parseIngredientsJson(existing.ingredients_json);
        if (!parsed) {
          return json({
            error: { code: 'INTERNAL_ERROR', message: 'Failed to parse existing ingredients JSON' },
            requestId: id
          }, 500);
        }
        ingredientsArray = parsed;
      }

      const validation = validateFormulaIngredients(ingredientsArray);

      if (!validation.isValid) {
        return json({
          success: false,
          error: {
            code: 'FORMULA_VALIDATION_FAILED',
            message: 'Formula validation failed',
            errors: validation.errors,
            validation_score: validation.score
          },
          requestId: id
        }, 400);
      }

      const newStatus = validation.score === 100 ? 'VALIDATED_100_PERCENT' : 'REJECTED';
      const ingredientsJsonStr = JSON.stringify(ingredientsArray);
      const previousStatus = existing.validation_status;

      try {
        await env.DB.batch([
          env.DB.prepare(`
            UPDATE formula_control
            SET formula_name = ?, ingredients_json = ?, validation_score = ?, validation_status = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).bind(
            formulaName,
            ingredientsJsonStr,
            validation.score,
            newStatus,
            formulaId
          ),
          env.DB.prepare(`
            INSERT INTO audit_events (
              id, actor_id, actor_role, action, module, record_type, record_id, previous_state, new_state, request_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            crypto.randomUUID(),
            actor.id,
            actorRole(actor),
            'UPDATE_FORMULA',
            'REGULATORY_AFFAIRS',
            'FORMULA',
            formulaId,
            previousStatus,
            newStatus,
            id
          )
        ]);
      } catch (error: any) {
        console.error('UPDATE_FORMULA_FAILED', error);
        return json({
          error: { code: 'INTERNAL_ERROR', message: 'Failed to update formula' },
          requestId: id
        }, 500);
      }

      const updated = await env.DB.prepare(`
        SELECT id, product_id, formula_code, formula_name, ingredients_json, validation_score, validation_status, updated_at
        FROM formula_control
        WHERE id = ?
      `).bind(formulaId).first<FormulaRow>();

      if (!updated) {
        return json({
          error: { code: 'NOT_FOUND', message: 'Formula not found after update' },
          requestId: id
        }, 404);
      }

      const parsedIngredients = parseIngredientsJson(updated.ingredients_json);
      if (!parsedIngredients) {
        return json({
          error: { code: 'INTERNAL_ERROR', message: 'Failed to parse updated ingredients JSON' },
          requestId: id
        }, 500);
      }

      return json({
        success: validation.score === 100,
        data: {
          ...formulaFromRow(updated),
          formula_name: updated.formula_name,
          ingredients_json: parsedIngredients,
          updated_at: updated.updated_at,
          message: validation.score === 100 ? 'สูตรได้รับการอัปเดตและตรวจสอบ 100% เรียบร้อย' : 'สูตรได้รับการอัปเดต แต่ยังไม่ถูกต้อง'
        },
        requestId: id
      });
    }

    // ========== GET FORMULA DETAILS ==========
    if (request.method === 'GET' && formulaUpdateRoute) {
      const [productId, formulaId] = [formulaUpdateRoute[1], formulaUpdateRoute[2]];
      const formula = await env.DB.prepare(`
        SELECT id, product_id, formula_code, formula_name, ingredients_json, validation_score, validation_status, created_at, updated_at
        FROM formula_control
        WHERE id = ? AND product_id = ?
      `).bind(formulaId, productId).first<FormulaRow>();

      if (!formula) return json({ error: { code: 'NOT_FOUND', message: 'Formula not found' }, requestId: id }, 404);

      const parsedIngredients = parseIngredientsJson(formula.ingredients_json);
      if (!parsedIngredients) {
        return json({
          error: { code: 'INTERNAL_ERROR', message: 'Failed to parse ingredients JSON' },
          requestId: id
        }, 500);
      }

      return json({
        data: {
          ...formulaFromRow(formula),
          formula_name: formula.formula_name,
          ingredients_json: parsedIngredients,
          created_at: formula.created_at,
          updated_at: formula.updated_at
        },
        requestId: id
      });
    }

    // ========== LIST FORMULAS BY PRODUCT ==========
    if (request.method === 'GET' && url.pathname.match(/^\/products\/([a-f0-9-]+)\/formulas$/)) {
      const productId = url.pathname.match(/^\/products\/([a-f0-9-]+)\/formulas$/)![1];
      const product = await env.DB.prepare('SELECT id FROM products WHERE id = ?').bind(productId).first<{ id: string }>();
      if (!product) return json({ error: { code: 'NOT_FOUND', message: 'Product not found' }, requestId: id }, 404);

      const formulas = await env.DB.prepare(`
        SELECT id, product_id, formula_code, formula_name, validation_score, validation_status, created_at, updated_at
        FROM formula_control
        WHERE product_id = ?
        ORDER BY created_at DESC
      `).bind(productId).all<FormulaRow>();

      return json({
        data: formulas.results.map(row => ({
          ...formulaFromRow(row),
          formula_name: row.formula_name,
          created_at: row.created_at,
          updated_at: row.updated_at
        })),
        requestId: id
      });
    }

    if (request.method === 'POST' && url.pathname === '/evidence') {
      if (!actor) return json({ error: { code: 'UNAUTHENTICATED', message: 'Login required' }, requestId: id }, 401);
      if (!requireRole(actor, ['RA', 'QA', 'QC', 'DCC', 'R&D'])) return json({ error: { code: 'FORBIDDEN', message: 'Evidence upload role required' }, requestId: id }, 403);
      const input = await body<EvidenceInput>(request);
      if (!input?.recordType || !input.recordId || !input.title?.trim() || !input.revision?.trim() || !input.contentType?.trim()) return json({ error: { code: 'VALIDATION_ERROR', message: 'recordType, recordId, title, revision and contentType are required' }, requestId: id }, 400);
      if (input.recordType !== 'PRODUCT' || !await env.DB.prepare('SELECT id FROM products WHERE id = ?').bind(input.recordId).first()) return json({ error: { code: 'VALIDATION_ERROR', message: 'recordId must reference a valid product' }, requestId: id }, 400);
      const evidenceId = crypto.randomUUID();
      const storageKey = `evidence/${input.recordType}/${input.recordId}/${evidenceId}`;
      await env.DB.batch([
        env.DB.prepare('INSERT INTO evidence (id, record_type, record_id, title, revision, storage_key, content_type, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(evidenceId, input.recordType, input.recordId, input.title.trim(), input.revision.trim(), storageKey, input.contentType.trim(), actor.id),
        env.DB.prepare('INSERT INTO audit_events (id, actor_id, actor_role, action, module, record_type, record_id, request_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), actor.id, actorRole(actor), 'UPLOAD_EVIDENCE', 'REGULATORY_AFFAIRS', 'EVIDENCE', evidenceId, id),
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
      const step = await env.DB.prepare("SELECT id, required_role, status, sequence, revision FROM approval_steps WHERE record_type = 'PRODUCT' AND record_id = ? AND revision = ? AND status = 'PENDING'")
        .bind(productId, product.revision).first<{ id: string; required_role: string; status: string; sequence: number; revision: string }>();
      if (!step) return json({ error: { code: 'APPROVAL_STEP_REQUIRED', message: 'No pending approval step exists' }, requestId: id }, 409);
      if (!actor.roles.some((grant) => grant.role === step.required_role && grant.canApprove)) return json({ error: { code: 'APPROVER_NOT_AUTHORIZED', message: 'Actor cannot decide this approval step' }, requestId: id }, 403);
      if (!await hasVerifiedEvidence(env, 'PRODUCT', product.id, product.revision)) return json({ error: { code: 'VERIFIED_EVIDENCE_REQUIRED', message: 'Verified evidence is required at approval stage' }, requestId: id }, 409);
      const input = await body<DecisionInput>(request);
      if ((action === 'reject' || action === 'return') && !input?.comment?.trim()) return json({ error: { code: 'VALIDATION_ERROR', message: 'A comment is required for reject or return' }, requestId: id }, 400);
      if (action === 'approve') {
        const next = await env.DB.prepare("SELECT id FROM approval_steps WHERE record_type = 'PRODUCT' AND record_id = ? AND revision = ? AND status = 'WAITING' ORDER BY sequence LIMIT 1")
          .bind(productId, product.revision).first<{ id: string }>();
        const nextState = next ? 'PENDING_APPROVAL' : 'APPROVED';
        const statements = [
          env.DB.prepare("UPDATE approval_steps SET status = 'APPROVED', approver_id = ?, decided_at = CURRENT_TIMESTAMP, comment = ? WHERE id = ? AND status = 'PENDING'").bind(actor.id, input?.comment ?? null, step.id),
          env.DB.prepare('UPDATE products SET state = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(nextState, productId),
          env.DB.prepare('INSERT INTO audit_events (id, actor_id, actor_role, action, module, record_type, record_id, previous_state, new_state, request_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), actor.id, actorRole(actor), 'APPROVE', 'REGULATORY_AFFAIRS', 'PRODUCT', productId, 'PENDING_APPROVAL', nextState, id),
        ];
        if (next) statements.splice(1, 0, env.DB.prepare("UPDATE approval_steps SET status = 'PENDING' WHERE id = ? AND status = 'WAITING'").bind(next.id));
        await env.DB.batch(statements);
        return json({ data: { productId, state: nextState, nextApprovalStep: next ? 'PENDING' : null }, requestId: id });
      }

      const terminalState = action === 'reject' ? 'REJECTED' : 'RETURNED';
      await env.DB.batch([
        env.DB.prepare('UPDATE approval_steps SET status = ?, approver_id = ?, decided_at = CURRENT_TIMESTAMP, comment = ? WHERE id = ? AND status = ?').bind(terminalState, actor.id, input!.comment || null, step.id, 'PENDING'),
        env.DB.prepare('UPDATE products SET state = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(terminalState, productId),
        env.DB.prepare('INSERT INTO audit_events (id, actor_id, actor_role, action, module, record_type, record_id, previous_state, new_state, reason, request_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), actor.id, actorRole(actor), action.toUpperCase(), 'REGULATORY_AFFAIRS', 'PRODUCT', productId, 'PENDING_APPROVAL', terminalState, input!.comment || null, id),
      ]);
      return json({ data: { productId, state: terminalState }, requestId: id });
    }

    if (env.ASSETS) return env.ASSETS.fetch(request);
    return json({ error: { code: 'NOT_FOUND', message: 'Route not found' }, requestId: id }, 404);
  },
} satisfies ExportedHandler<Env>;

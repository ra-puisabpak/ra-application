import { API_URL } from '../config'

const TOKEN_KEY = 'psp_ncr_token'
const USER_KEY = 'psp_ncr_user'
const store = {
  get: (k) => { try { return localStorage.getItem(k) } catch { return null } },
  set: (k, v) => { try { localStorage.setItem(k, v) } catch { /* private mode */ } },
  del: (k) => { try { localStorage.removeItem(k) } catch { /* private mode */ } },
}

export const session = {
  token: () => store.get(TOKEN_KEY),
  user: () => { try { return JSON.parse(store.get(USER_KEY) || 'null') } catch { return null } },
  save: (token, user) => { store.set(TOKEN_KEY, token); store.set(USER_KEY, JSON.stringify(user)) },
  clear: () => { store.del(TOKEN_KEY); store.del(USER_KEY) },
}

async function request(path, options = {}, { auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers }
  const token = session.token()
  if (auth && token) headers.Authorization = `Bearer ${token}`
  let res
  try {
    res = await fetch(`${API_URL}${path}`, { ...options, headers })
  } catch {
    throw new Error('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ต')
  }
  const data = await res.json().catch(() => ({}))
  if (res.status === 401 && auth) {
    session.clear()
    window.dispatchEvent(new Event('auth:expired'))
  }
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
  return data
}

const post = (path, body, opt) => request(path, { method: 'POST', body: JSON.stringify(body ?? {}) }, opt)
const patch = (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body) })
const enc = encodeURIComponent

export const authApi = {
  login: (username, password) => post('/api/login', { username, password }, { auth: false }),
  setup: (setupKey, body) => request('/api/setup', {
    method: 'POST', body: JSON.stringify(body), headers: { 'X-Setup-Key': setupKey },
  }, { auth: false }),
  me: () => request('/api/me'),
  logout: () => post('/api/logout'),
  changePassword: (current_password, new_password) => post('/api/me/password', { current_password, new_password }),
}

export const userApi = {
  list: () => request('/api/users'),
  create: (body) => post('/api/users', body),
  update: (username, body) => patch(`/api/users/${enc(username)}`, body),
}

export const auditApi = {
  forEntity: (id) => request(`/api/audit?entity_id=${enc(id)}&limit=200`),
}

export const ncrApi = {
  // Loads every record (the server pages 200 at a time).
  list: async (params = {}) => {
    const all = []
    for (let offset = 0; ; offset += 200) {
      const q = new URLSearchParams({ ...params, limit: 200, offset })
      const page = await request(`/api/ncr?${q}`)
      all.push(...(page.items || []))
      if (all.length >= (page.total || 0) || !(page.items || []).length) break
    }
    return all
  },
  get: (id) => request(`/api/ncr/${enc(id)}`),
  create: (body) => post('/api/ncr', body),
  update: (id, body) => patch(`/api/ncr/${enc(id)}`, body),
  supplierLink: (id) => post(`/api/ncr/${enc(id)}/supplier-link`),
  revokeSupplierLink: (id) => post(`/api/ncr/${enc(id)}/supplier-link/revoke`),
}

export const capaApi = {
  list: (params = {}) => request(`/api/capa?${new URLSearchParams(params)}`),
  get: (id) => request(`/api/capa/${enc(id)}`),
  create: (body) => post('/api/capa', body),
  update: (id, body) => patch(`/api/capa/${enc(id)}`, body),
  listByNcr: (ncrId) => request(`/api/capa?ncr_id=${enc(ncrId)}`),
  supplierLink: (id) => post(`/api/capa/${enc(id)}/supplier-link`),
  revokeSupplierLink: (id) => post(`/api/capa/${enc(id)}/supplier-link/revoke`),
}

// Used by the supplier reply pages: the token in the link is the only credential.
export const supplierApi = {
  get: (token) => request(`/api/supplier/${enc(token)}`, {}, { auth: false }),
  reply: (token, body) => post(`/api/supplier/${enc(token)}`, body, { auth: false }),
}

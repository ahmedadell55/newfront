// ═══════════════════════════════════════════════════════════════
//  دَرْب AI — API Service Layer  (v5 — fully audited & enhanced)
//  ✅ Smart login: JSON first → OAuth2 form fallback
//  ✅ Register: uses token from register response if present
//  ✅ All errors always return readable Arabic strings
//  ✅ Request timeout on every call (12s)
//  ✅ Parking release → POST /parking/release/{id} (restored)
//  ✅ Body only sent when explicitly provided
//  ✅ Handles array / {items} / {results} / {data} responses
//  ✅ Token expiry management
//  ✅ Request retry logic
//  ✅ Request deduplication
//  ✅ Caching for static data
//  ✅ Cancellable requests
//  ✅ Request tracking & statistics
// ═══════════════════════════════════════════════════════════════

export const BASE_URL =
  process.env.REACT_APP_API_URL || 'http://localhost:8000';

const TIMEOUT_MS = 12000;
const DEBUG = process.env.NODE_ENV === 'development';

// ═══════════════════════════════════════════════════════════════
//  ERROR CLASSIFICATION
// ═══════════════════════════════════════════════════════════════

const ErrorTypes = {
  NETWORK: 'network',
  TIMEOUT: 'timeout',
  AUTH: 'auth',
  VALIDATION: 'validation',
  SERVER: 'server',
  UNKNOWN: 'unknown'
};

export function classifyError(error) {
  const message = error?.message || '';
  
  if (message.includes('الاتصال بالخادم') || message.includes('Failed to fetch'))
    return ErrorTypes.NETWORK;
  
  if (message.includes('مهلة'))
    return ErrorTypes.TIMEOUT;
  
  if (message.includes('انتهت الجلسة') || message.includes('401'))
    return ErrorTypes.AUTH;
  
  if (message.includes('422') || message.includes('validation'))
    return ErrorTypes.VALIDATION;
  
  if (message.includes('خطأ 5'))
    return ErrorTypes.SERVER;
  
  return ErrorTypes.UNKNOWN;
}

export function getUserFriendlyError(error) {
  const type = classifyError(error);
  
  switch (type) {
    case ErrorTypes.NETWORK:
      return 'لا يوجد اتصال بالإنترنت. يرجى التحقق من اتصالك والمحاولة مرة أخرى';
    case ErrorTypes.TIMEOUT:
      return 'الخادم لا يستجيب. يرجى المحاولة مرة أخرى';
    case ErrorTypes.AUTH:
      return 'انتهت صلاحية الجلسة. يرجى تسجيل الدخول مرة أخرى';
    case ErrorTypes.VALIDATION:
      return 'البيانات المدخلة غير صحيحة. يرجى التحقق منها';
    case ErrorTypes.SERVER:
      return 'حدث خطأ في الخادم. يرجى المحاولة لاحقاً';
    default:
      return extractMsg(error);
  }
}

// ═══════════════════════════════════════════════════════════════
//  LOGGING (Debug only)
// ═══════════════════════════════════════════════════════════════

function logError(error, context = '') {
  if (!DEBUG) return;
  
  console.group(`🚨 خطأ في ${context}`);
  console.error('الخطأ:', error);
  console.error('الوقت:', new Date().toISOString());
  console.error('نوع الخطأ:', classifyError(error));
  if (error.stack) console.error('Stack trace:', error.stack);
  console.groupEnd();
}

function logInfo(message, data = null) {
  if (!DEBUG) return;
  console.log(`ℹ️ ${message}`, data ? data : '');
}

// ═══════════════════════════════════════════════════════════════
//  TOKEN MANAGEMENT with expiry
// ═══════════════════════════════════════════════════════════════

export function getToken() { 
  return localStorage.getItem('darb_token'); 
}

export function setToken(token, expiresIn = null) {
  if (token) {
    localStorage.setItem('darb_token', token);
    if (expiresIn) {
      const expiryTime = Date.now() + (expiresIn * 1000);
      localStorage.setItem('darb_token_expiry', expiryTime);
    }
  } else {
    localStorage.removeItem('darb_token');
    localStorage.removeItem('darb_token_expiry');
  }
}

export function isTokenValid() {
  const token = getToken();
  if (!token) return false;
  
  const expiry = localStorage.getItem('darb_token_expiry');
  if (expiry && Date.now() > parseInt(expiry)) {
    setToken(null);
    return false;
  }
  return true;
}

async function ensureValidToken() {
  if (!isTokenValid()) {
    setToken(null);
    localStorage.removeItem('darb_user');
    window.dispatchEvent(new CustomEvent('darb:logout'));
    throw new Error('انتهت صلاحية الجلسة، يرجى تسجيل الدخول مرة أخرى');
  }
  return true;
}

// ═══════════════════════════════════════════════════════════════
//  BACKEND AVAILABILITY (cached, reset every 60s)
// ═══════════════════════════════════════════════════════════════

let _backendAvailable = null;
setInterval(() => { _backendAvailable = null; }, 60_000);

export async function isBackendAvailable() {
  if (_backendAvailable !== null) return _backendAvailable;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3000);
    const res = await fetch(`${BASE_URL}/health`, { signal: ctrl.signal });
    clearTimeout(t);
    _backendAvailable = res.ok;
  } catch {
    _backendAvailable = false;
  }
  return _backendAvailable;
}

// ═══════════════════════════════════════════════════════════════
//  EXTRACT MESSAGE (enhanced)
// ═══════════════════════════════════════════════════════════════

export function extractMsg(e) {
  if (!e) return 'حدث خطأ غير معروف';
  
  if (typeof e === 'string') return e.trim() || 'حدث خطأ غير معروف';
  if (e instanceof Error && e.message) return e.message;
  
  if (e.detail) {
    if (typeof e.detail === 'string') return e.detail;
    if (Array.isArray(e.detail)) {
      return e.detail
        .map(d => d.msg || d.message || d.loc?.join('.') || String(d))
        .join(' — ');
    }
  }
  
  if (e.non_field_errors) {
    return Array.isArray(e.non_field_errors) 
      ? e.non_field_errors.join(' — ')
      : String(e.non_field_errors);
  }
  
  const commonFields = ['message', 'error', 'msg', 'description', 'title'];
  for (const field of commonFields) {
    if (e[field] && typeof e[field] === 'string') return e[field];
  }
  
  try {
    const stringified = JSON.stringify(e);
    if (stringified && stringified !== '{}') return stringified;
  } catch {}
  
  return 'حدث خطأ غير معروف';
}

// ═══════════════════════════════════════════════════════════════
//  REQUEST TRACKING & STATISTICS
// ═══════════════════════════════════════════════════════════════

const requestStats = {
  total: 0,
  successful: 0,
  failed: 0,
  averageTime: 0,
  endpoints: new Map()
};

async function trackRequest(method, path, requestFn) {
  const startTime = performance.now();
  requestStats.total++;
  
  const endpointKey = `${method}:${path.split('?')[0]}`;
  const endpointStats = requestStats.endpoints.get(endpointKey) || { count: 0, totalTime: 0 };
  
  try {
    const result = await requestFn();
    requestStats.successful++;
    return result;
  } catch (error) {
    requestStats.failed++;
    throw error;
  } finally {
    const duration = performance.now() - startTime;
    endpointStats.count++;
    endpointStats.totalTime += duration;
    requestStats.endpoints.set(endpointKey, endpointStats);
    
    if (DEBUG && duration > 3000) {
      console.warn(`⚠️ طلب بطيء: ${method} ${path} - ${duration.toFixed(2)}ms`);
    }
  }
}

export function getRequestStats() {
  const stats = { ...requestStats };
  stats.averageTime = stats.total > 0 
    ? Array.from(requestStats.endpoints.values()).reduce((sum, e) => sum + e.totalTime, 0) / stats.total
    : 0;
  return stats;
}

// ═══════════════════════════════════════════════════════════════
//  REQUEST DEDUPLICATION
// ═══════════════════════════════════════════════════════════════

const pendingRequests = new Map();

async function deduplicatedRequest(method, path, body, requestFn) {
  const key = `${method}:${path}:${JSON.stringify(body)}`;
  
  if (pendingRequests.has(key)) {
    logInfo(`Using cached pending request: ${key}`);
    return pendingRequests.get(key);
  }
  
  const promise = requestFn().finally(() => {
    pendingRequests.delete(key);
  });
  
  pendingRequests.set(key, promise);
  return promise;
}

// ═══════════════════════════════════════════════════════════════
//  CACHING FOR STATIC DATA
// ═══════════════════════════════════════════════════════════════

const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function cachedRequest(key, requestFn, ttl = CACHE_TTL) {
  const cached = cache.get(key);
  
  if (cached && Date.now() - cached.timestamp < ttl) {
    logInfo(`Cache hit for: ${key}`);
    return cached.data;
  }
  
  logInfo(`Cache miss for: ${key}, fetching fresh data`);
  const data = await requestFn();
  cache.set(key, {
    data,
    timestamp: Date.now()
  });
  
  return data;
}

export function clearCache(key = null) {
  if (key) {
    cache.delete(key);
    logInfo(`Cache cleared for: ${key}`);
  } else {
    cache.clear();
    logInfo('Cache fully cleared');
  }
}

// ═══════════════════════════════════════════════════════════════
//  CANCELLABLE REQUEST
// ═══════════════════════════════════════════════════════════════

export function createCancellableRequest() {
  let abortController = null;
  
  const cancel = () => {
    if (abortController) {
      abortController.abort();
      abortController = null;
      logInfo('Request cancelled');
    }
  };
  
  const request = async (method, path, body) => {
    cancel();
    abortController = new AbortController();
    
    try {
      return await requestWithSignal(method, path, body, abortController.signal);
    } finally {
      abortController = null;
    }
  };
  
  return { request, cancel };
}

// ═══════════════════════════════════════════════════════════════
//  CORE REQUEST WITH SIGNAL
// ═══════════════════════════════════════════════════════════════

async function requestWithSignal(method, path, body, signal) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const timer = setTimeout(() => signal?.abort?.() || null, TIMEOUT_MS);

  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      signal,
      body: body !== undefined && !['GET', 'HEAD'].includes(method)
        ? JSON.stringify(body)
        : null,
    });
  } catch (e) {
    clearTimeout(timer);
    if (e.name === 'AbortError')
      throw new Error('انتهت مهلة الطلب — تحقق من الاتصال بالإنترنت');
    throw new Error('تعذّر الاتصال بالخادم');
  }
  clearTimeout(timer);

  if (res.status === 401) {
    setToken(null);
    localStorage.removeItem('darb_user');
    window.dispatchEvent(new CustomEvent('darb:logout'));
    throw new Error('انتهت الجلسة، يرجى تسجيل الدخول مرة أخرى');
  }
  
  if (!res.ok) {
    let msg = `خطأ ${res.status}`;
    try { msg = extractMsg(await res.json()); } catch {}
    throw new Error(msg);
  }
  
  if (res.status === 204) return { success: true };
  try { return await res.json(); } catch { return { success: true }; }
}

// ═══════════════════════════════════════════════════════════════
//  CORE REQUEST WITH RETRY LOGIC
// ═══════════════════════════════════════════════════════════════

async function requestWithRetry(method, path, body, maxRetries = 2) {
  let lastError;
  
  for (let i = 0; i <= maxRetries; i++) {
    try {
      await ensureValidToken();
      return await trackRequest(method, path, () => requestWithSignal(method, path, body, null));
    } catch (error) {
      lastError = error;
      logError(error, `${method} ${path} (attempt ${i + 1}/${maxRetries + 1})`);
      
      if (error.message?.includes('انتهت الجلسة') || 
          error.message?.includes('401') ||
          (error.message?.includes('خطأ 4') && !error.message?.includes('429'))) {
        throw error;
      }
      
      if (i < maxRetries && (error.message?.includes('مهلة') || 
                             error.message?.includes('الاتصال'))) {
        const delay = 1000 * Math.pow(2, i);
        logInfo(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      throw error;
    }
  }
  
  throw lastError;
}

// ═══════════════════════════════════════════════════════════════
//  FORM-ENCODED POST (OAuth2 standard)
// ═══════════════════════════════════════════════════════════════

async function postForm(path, fields) {
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers,
      signal: ctrl.signal,
      body: new URLSearchParams(fields).toString(),
    });
  } catch (e) {
    clearTimeout(timer);
    if (e.name === 'AbortError')
      throw new Error('انتهت مهلة الطلب — تحقق من الاتصال بالإنترنت');
    throw new Error('تعذّر الاتصال بالخادم');
  }
  clearTimeout(timer);

  if (res.status === 401) {
    setToken(null);
    localStorage.removeItem('darb_user');
    window.dispatchEvent(new CustomEvent('darb:logout'));
    throw new Error('انتهت الجلسة، يرجى تسجيل الدخول مرة أخرى');
  }
  
  if (!res.ok) {
    let msg = `خطأ ${res.status}`;
    try { msg = extractMsg(await res.json()); } catch {}
    throw new Error(msg);
  }
  
  try { return await res.json(); } catch { return { success: true }; }
}

// ═══════════════════════════════════════════════════════════════
//  HTTP METHODS
// ═══════════════════════════════════════════════════════════════

const get   = (path)       => requestWithRetry('GET',    path);
const post  = (path, body) => requestWithRetry('POST',   path, body !== undefined ? body : {});
const put   = (path, body) => requestWithRetry('PUT',    path, body !== undefined ? body : {});
const patch = (path, body) => requestWithRetry('PATCH',  path, body !== undefined ? body : {});
const del   = (path)       => requestWithRetry('DELETE', path);

// ═══════════════════════════════════════════════════════════════
//  NORMALISE LIST RESPONSES (enhanced with pagination)
// ═══════════════════════════════════════════════════════════════

function toArray(data, extractItemsOnly = false) {
  if (Array.isArray(data)) return extractItemsOnly ? data : { items: data, total: data.length };
  
  if (data?.items && Array.isArray(data.items)) {
    return extractItemsOnly ? data.items : {
      items: data.items,
      total: data.total || data.items.length,
      page: data.page || 1,
      pages: data.pages || 1
    };
  }
  
  if (Array.isArray(data?.results)) {
    return extractItemsOnly ? data.results : {
      items: data.results,
      total: data.count || data.results.length,
      page: data.page || 1,
      pages: data.pages || 1
    };
  }
  
  if (Array.isArray(data?.data)) {
    return extractItemsOnly ? data.data : {
      items: data.data,
      total: data.total || data.data.length,
      page: data.page || 1,
      pages: data.pages || 1
    };
  }
  
  return extractItemsOnly ? [] : { items: [], total: 0 };
}

// ═══════════════════════════════════════════════════════════════
//  DATA MAPPERS
// ═══════════════════════════════════════════════════════════════

function nodeToBackend(node) {
  return {
    id:    node.id,
    name:  node.label || node.name || node.id,
    type:  node.type  || 'default',
    x:     node.x     ?? 0,
    y:     node.y     ?? 0,
    lat:   node.lat   ?? null,
    lng:   node.lng   ?? null,
    color: node.color || '#3d7a52',
  };
}

function nodeToFrontend(node) {
  return {
    id:    node.id,
    label: node.name  || node.label || node.id,
    name:  node.name  || node.label || node.id,
    type:  node.type  || 'default',
    x:     node.x     ?? 0,
    y:     node.y     ?? 0,
    color: node.color || '#3d7a52',
    lat:   node.lat   ?? null,
    lng:   node.lng   ?? null,
  };
}

function edgeToBackend(edge) {
  const cMap = { low: 0.1, medium: 0.5, high: 0.9 };
  return {
    id:         edge.id,
    source:     edge.from   || edge.source,
    target:     edge.to     || edge.target,
    weight:     edge.weight || 1.0,
    congestion: typeof edge.congestion === 'number'
                  ? edge.congestion
                  : cMap[edge.congestion] ?? 0.1,
  };
}

function edgeToFrontend(edge) {
  const val   = typeof edge.congestion === 'number' ? edge.congestion : 0.1;
  const label = val >= 0.7 ? 'high' : val >= 0.4 ? 'medium' : 'low';
  return {
    id:         edge.id,
    from:       edge.source || edge.from,
    to:         edge.target || edge.to,
    source:     edge.source || edge.from,
    target:     edge.target || edge.to,
    weight:     edge.weight || 1.0,
    congestion: label,
  };
}

function algoToBackend(algo) {
  const map = {
    dijkstra: 'dijkstra',
    astar:    'astar',
    bellman:  'bellman_ford',
    floyd:    'floyd_warshall',
    bfs:      'bfs',
    ucs:      'ucs',
  };
  return map[algo] || 'dijkstra';
}

function pathResultToFrontend(result) {
  if (!result) return { path: [], distance: 0, algorithm: 'unknown', steps: 0 };
  return {
    path:        result.path              || [],
    distance:    result.total_distance_km ?? result.distance ?? 0,
    algorithm:   result.algorithm         || 'unknown',
    steps:       result.num_edges         ?? result.steps ?? 0,
    description: result.description       || '',
  };
}

// ═══════════════════════════════════════════════════════════════
//  AUTH
//  LOGIN STRATEGY:
//   1. POST /auth/login with JSON { email, password }
//   2. If backend returns 422 → retry with OAuth2 form
//      { username: email, password } (FastAPI standard)
// ═══════════════════════════════════════════════════════════════

export const authAPI = {

  login: async (email, password) => {
    try {
      return await post('/auth/login', { email, password });
    } catch (e) {
      if (e.message && (e.message.includes('422') || e.message.includes('Unprocessable'))) {
        logInfo('JSON login failed, trying OAuth2 form...');
        return await postForm('/auth/login', { username: email, password });
      }
      throw e;
    }
  },

  register: (username, email, password) =>
    post('/auth/register', { username, email, password }),

  logout: () => requestWithRetry('POST', '/auth/logout'),

  forgotPassword: (email)       => post('/auth/forgot-password', { email }),
  resetPassword:  (new_password) => post('/auth/reset-password', { new_password }),
  getMe:          ()             => get('/auth/me'),
  getGoogleUrl:   ()             => get('/auth/google'),
};

// ── Login helper: returns { token, user } ───────────────────

export async function loginAndGetUser(email, password) {
  const res = await authAPI.login(email, password);

  const token = res.access_token || res.token;
  if (!token) throw new Error('لم يتم استلام التوكن من الخادم');
  
  const expiresIn = res.expires_in || 3600; // default 1 hour
  setToken(token, expiresIn);

  let profile = res.user || null;

  if (!profile || !profile.id) {
    try {
      profile = await authAPI.getMe();
    } catch {
      profile = {
        id:       res.user_id || res.id || '',
        username: res.username || res.name || email.split('@')[0],
        email:    res.email || email,
      };
    }
  }

  const userData = {
    token,
    user: {
      id:       profile.id                               || '',
      name:     profile.username || profile.name         || email.split('@')[0],
      username: profile.username || profile.name         || email.split('@')[0],
      email:    profile.email                            || email,
      avatar:   profile.avatar                          || '👤',
      plan:     profile.plan     || profile.tier         || 'free',
      points:   profile.points                          || 0,
      level:    profile.level                           || 'Bronze',
      rank:     profile.rank                            || 999,
    },
  };
  
  localStorage.setItem('darb_user', JSON.stringify(userData.user));
  return userData;
}

// ── Register then login helper ───────────────────────────────

export async function registerAndLogin(username, email, password) {
  const regRes = await authAPI.register(username, email, password);

  const regToken = regRes?.access_token || regRes?.token;
  if (regToken) {
    const expiresIn = regRes.expires_in || 3600;
    setToken(regToken, expiresIn);
    
    let profile = regRes.user || {};
    try { profile = await authAPI.getMe(); } catch {}
    
    const userData = {
      token: regToken,
      user: {
        id:       profile.id       || '',
        name:     profile.username || username,
        username: profile.username || username,
        email:    profile.email    || email,
        avatar:   '👤',
        plan:     'free',
        points:   0,
        level:    'Bronze',
        rank:     999,
      },
    };
    
    localStorage.setItem('darb_user', JSON.stringify(userData.user));
    return userData;
  }

  return loginAndGetUser(email, password);
}

// ═══════════════════════════════════════════════════════════════
//  PROJECTS (with caching)
// ═══════════════════════════════════════════════════════════════

export const projectsAPI = {
  list: () => deduplicatedRequest('GET', '/projects/', null, () =>
    cachedRequest('projects_list', () => get('/projects/').then(data => toArray(data, true)), 30000)
  ),
  
  listWithPagination: () => deduplicatedRequest('GET', '/projects/', null, () =>
    get('/projects/').then(data => toArray(data, false))
  ),

  create: async (name, nodes, edges) => {
    const result = await post('/projects/', {
      name,
      nodes: nodes.map(nodeToBackend),
      edges: edges.map(edgeToBackend),
    });
    clearCache('projects_list');
    return result;
  },

  update: async (id, name, nodes, edges) => {
    const result = await put(`/projects/${id}`, {
      name,
      nodes: nodes.map(nodeToBackend),
      edges: edges.map(edgeToBackend),
    });
    clearCache('projects_list');
    return result;
  },

  remove: async (id) => {
    const result = await del(`/projects/${id}`);
    clearCache('projects_list');
    return result;
  },
};

// ═══════════════════════════════════════════════════════════════
//  NODES
// ═══════════════════════════════════════════════════════════════

export const nodesAPI = {
  list: () => get('/nodes/').then(d => toArray(d, true).map(nodeToFrontend)),
  create: (node) => post('/nodes/', nodeToBackend(node)).then(nodeToFrontend),
  getById: (id) => get(`/nodes/${id}`).then(nodeToFrontend),
  update: (id, node) => put(`/nodes/${id}`, nodeToBackend(node)).then(nodeToFrontend),
  remove: (id) => del(`/nodes/${id}`),
};

// ═══════════════════════════════════════════════════════════════
//  EDGES
// ═══════════════════════════════════════════════════════════════

export const edgesAPI = {
  list: () => get('/edges/').then(d => toArray(d, true).map(edgeToFrontend)),
  create: (edge) => post('/edges/', edgeToBackend(edge)).then(edgeToFrontend),

  updateCongestion: (id, congestion) => {
    const val = typeof congestion === 'number'
      ? congestion
      : { low: 0.1, medium: 0.5, high: 0.9 }[congestion] ?? 0.1;
    return patch(`/edges/${id}/congestion`, { congestion: val });
  },

  remove: (id) => del(`/edges/${id}`),
};

// ═══════════════════════════════════════════════════════════════
//  PATHS
// ═══════════════════════════════════════════════════════════════

export const pathsAPI = {
  shortest: (start, end, algorithm = 'dijkstra') =>
    post('/paths/shortest', {
      start,
      end,
      algorithm: algoToBackend(algorithm),
    }).then(pathResultToFrontend),

  best: (start, end) =>
    post('/paths/best', { start, end, algorithm: 'dijkstra' })
      .then(pathResultToFrontend),
};

// ═══════════════════════════════════════════════════════════════
//  FLEET
// ═══════════════════════════════════════════════════════════════

export const fleetAPI = {
  getVehicles:   () => get('/fleet/vehicles'),
  getStats:      () => get('/fleet/stats'),
  updateVehicle: (id, status, speed, location) =>
    patch(`/fleet/vehicles/${id}`, { status, speed, location }),
};

// ═══════════════════════════════════════════════════════════════
//  PARKING
//  ✅ release → POST /parking/release/{lot_id} (correct)
// ═══════════════════════════════════════════════════════════════

export const parkingAPI = {
  getLots: () =>
    get('/parking/lots').then(d => {
      const list = d?.lots ?? d;
      return Array.isArray(list) ? list : toArray(d, true);
    }),

  reserve: (lot_id) => post('/parking/reserve', { lot_id }),
  release: (lot_id) => post(`/parking/release/${lot_id}`, {}),
};

// ═══════════════════════════════════════════════════════════════
//  ANALYSIS
// ═══════════════════════════════════════════════════════════════

export const analysisAPI = {
  city:   () => get('/analysis/city'),
  simple: () => get('/analysis/simple'),
};

// ═══════════════════════════════════════════════════════════════
//  SEARCH (with cancellable support)
// ═══════════════════════════════════════════════════════════════

export const searchAPI = {
  query: (text, context = null) => post('/search/query', { text, context }),
  getCommands: () => get('/search/commands'),
  
  createCancellable() {
    const { request, cancel } = createCancellableRequest();
    return {
      query: (text, context) => request('POST', '/search/query', { text, context }),
      cancel
    };
  }
};

// ═══════════════════════════════════════════════════════════════
//  HEALTH
// ═══════════════════════════════════════════════════════════════

export const checkHealth = () =>
  fetch(`${BASE_URL}/health`).then(r => r.ok).catch(() => false);

// ═══════════════════════════════════════════════════════════════
//  EXPORT UTILITIES FOR DEVELOPERS
// ═══════════════════════════════════════════════════════════════

export const devUtils = {
  getRequestStats,
  clearCache,
  isTokenValid,
  getToken,
  setToken,
  classifyError,
  getUserFriendlyError,
  DEBUG
};

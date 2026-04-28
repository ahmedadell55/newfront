// ═══════════════════════════════════════════════════
//  دَرْب AI — API Service Layer  (v5 Production Ready)
// ═══════════════════════════════════════════════════

export const BASE_URL =
  process.env.REACT_APP_API_URL || 'http://localhost:8000';

const IS_DEV = process.env.NODE_ENV === 'development';
const TIMEOUT_MS = 12000;

// ── Debug logger (dev only) ─────────────────────────
const log = (...args) => IS_DEV && console.log('[API]', ...args);

// ── Backend availability cache ──────────────────────
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

// ── Token storage ───────────────────────────────────
export const getToken = () => localStorage.getItem('darb_token');

export function setToken(token) {
  if (token) localStorage.setItem('darb_token', token);
  else localStorage.removeItem('darb_token');
}

// ── Extract readable error ──────────────────────────
export async function extractMsgSafe(res) {
  try {
    const data = await res.json();
    if (typeof data === 'string') return data;
    if (data?.detail) return typeof data.detail === 'string'
      ? data.detail
      : JSON.stringify(data.detail);
    if (data?.message) return data.message;
    return JSON.stringify(data);
  } catch {
    return `خطأ ${res.status}`;
  }
}

// ── Core request engine ─────────────────────────────
async function request(method, path, body, retry = true) {

  if (!navigator.onLine)
    throw new Error('لا يوجد اتصال بالإنترنت');

  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);

  let res;
  try {
    log(method, path);

    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      signal: ctrl.signal,
      body:
        body !== undefined &&
        !['GET', 'HEAD'].includes(method)
          ? JSON.stringify(body)
          : undefined,
    });

  } catch (e) {
    clearTimeout(timer);
    throw new Error(
      e.name === 'AbortError'
        ? 'انتهت مهلة الطلب — السيرفر بطيء'
        : 'تعذّر الاتصال بالخادم'
    );
  }

  clearTimeout(timer);

  // 🔁 Retry once لو التوكن expired
  if (res.status === 401 && retry && token) {
    log('Token expired → clearing & retrying');
    setToken(null);
    return request(method, path, body, false);
  }

  if (res.status === 401) {
    localStorage.removeItem('darb_user');
    window.dispatchEvent(new CustomEvent('darb:logout'));
    throw new Error('انتهت الجلسة، يرجى تسجيل الدخول مرة أخرى');
  }

  if (!res.ok) {
    throw new Error(await extractMsgSafe(res));
  }

  if (res.status === 204) return { success: true };

  try {
    return await res.json();
  } catch {
    return { success: true };
  }
}

// ── Form request (OAuth2) ───────────────────────────
async function postForm(path, fields) {
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Accept': 'application/json',
  };

  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers,
    body: new URLSearchParams(fields).toString(),
  });

  if (!res.ok) throw new Error(await extractMsgSafe(res));
  return res.json();
}

// helpers
const get   = (p)       => request('GET', p);
const post  = (p, b)    => request('POST', p, b);
const put   = (p, b)    => request('PUT', p, b);
const patch = (p, b)    => request('PATCH', p, b);
const del   = (p)       => request('DELETE', p);

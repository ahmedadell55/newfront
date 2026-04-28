// ═══════════════════════════════════════════════════
//  دَرْب AI — API Service Layer  FINAL
// ═══════════════════════════════════════════════════

export const BASE_URL =
  process.env.REACT_APP_API_URL || "http://localhost:8000";

const TIMEOUT_MS = 12000;

// ───────────────── TOKEN ─────────────────
export const getToken = () => localStorage.getItem("darb_token");
export const setToken = (token) =>
  token
    ? localStorage.setItem("darb_token", token)
    : localStorage.removeItem("darb_token");

// ───────────────── ERROR PARSER ─────────────────
function extractMsg(e) {
  if (!e) return "حدث خطأ غير معروف";
  if (typeof e === "string") return e;
  if (e.message) return e.message;
  if (e.detail) return typeof e.detail === "string"
    ? e.detail
    : e.detail.map(d => d.msg).join(" - ");
  return "حدث خطأ غير معروف";
}

// ───────────────── CORE REQUEST ─────────────────
async function request(method, path, body) {
  const headers = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      signal: controller.signal,
      body: body ? JSON.stringify(body) : null,
    });
  } catch {
    throw new Error("تعذر الاتصال بالخادم");
  }
  clearTimeout(timer);

  if (res.status === 401) {
    setToken(null);
    window.dispatchEvent(new CustomEvent("darb:logout"));
    throw new Error("انتهت الجلسة، يرجى تسجيل الدخول مرة أخرى");
  }

  if (!res.ok) {
    let msg = `خطأ ${res.status}`;
    try { msg = extractMsg(await res.json()); } catch {}
    throw new Error(msg);
  }

  try { return await res.json(); }
  catch { return { success: true }; }
}

const get   = (p) => request("GET", p);
const post  = (p,b) => request("POST", p, b);
const put   = (p,b) => request("PUT", p, b);
const patch = (p,b) => request("PATCH", p, b);
const del   = (p) => request("DELETE", p);

// ═════════════════════════════════════
// AUTH
// ═════════════════════════════════════
export const authAPI = {
  login: (email, password) =>
    post("/auth/login", { email, password }),

  register: (username,email,password) =>
    post("/auth/register",{ username,email,password }),

  logout: () => post("/auth/logout"),

  forgotPassword: (email) =>
    post("/auth/forgot-password",{ email }),

  resetPassword: (new_password) =>
    post("/auth/reset-password",{ new_password }),

  getMe: () => get("/auth/me"),
};

// ═════════════════════════════════════
// PROJECTS
// ═════════════════════════════════════
export const projectsAPI = {
  list: () => get("/projects/"),
  create: (name,nodes,edges) =>
    post("/projects/",{ name,nodes,edges }),
  update: (id,name,nodes,edges) =>
    put(`/projects/${id}`,{ name,nodes,edges }),
  remove: (id) => del(`/projects/${id}`),
};

// ═════════════════════════════════════
// NODES
// ═════════════════════════════════════
export const nodesAPI = {
  list: () => get("/nodes/"),
  create: (node) => post("/nodes/",node),
  update: (id,node) => put(`/nodes/${id}`,node),
  remove: (id) => del(`/nodes/${id}`),
};

// ═════════════════════════════════════
// EDGES
// ═════════════════════════════════════
export const edgesAPI = {
  list: () => get("/edges/"),
  create: (edge) => post("/edges/",edge),
  updateCongestion: (id,congestion) =>
    patch(`/edges/${id}/congestion`,{ congestion }),
  remove: (id) => del(`/edges/${id}`),
};

// ═════════════════════════════════════
// PATHS
// ═════════════════════════════════════
export const pathsAPI = {
  shortest: (start,end,algorithm="dijkstra") =>
    post("/paths/shortest",{ start,end,algorithm }),

  best: (start,end) =>
    post("/paths/best",{ start,end }),
};

// ═════════════════════════════════════
// 🚚 FLEET (المفقود وتم إرجاعه)
// ═════════════════════════════════════
export const fleetAPI = {
  getVehicles: () => get("/fleet/vehicles"),
  getStats: () => get("/fleet/stats"),
  updateVehicle: (id,status,speed,location) =>
    patch(`/fleet/vehicles/${id}`,{ status,speed,location }),
};

// ═════════════════════════════════════
// PARKING
// ═════════════════════════════════════
export const parkingAPI = {
  getLots: () => get("/parking/lots"),
  reserve: (lot_id) => post("/parking/reserve",{ lot_id }),
  release: (lot_id) => post(`/parking/release/${lot_id}`),
};

// ═════════════════════════════════════
// ANALYSIS
// ═════════════════════════════════════
export const analysisAPI = {
  city: () => get("/analysis/city"),
  simple: () => get("/analysis/simple"),
};

// ═════════════════════════════════════
// SEARCH
// ═════════════════════════════════════
export const searchAPI = {
  query: (text,context=null) =>
    post("/search/query",{ text,context }),
};

// ═════════════════════════════════════
// HEALTH CHECK
// ═════════════════════════════════════
export const checkHealth = () =>
  fetch(`${BASE_URL}/health`)
    .then(r => r.ok)
    .catch(() => false);

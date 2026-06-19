/**
 * Auth helper — reads from 'aivory_auth' localStorage key
 * (shared session set by the homepage login modal)
 */
const STORAGE_KEY = "aivory_auth";
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_BACKEND_URL || '';

export interface User {
  user_id: string;
  email: string;
  account_type: "free" | "superadmin";
  company_name?: string;
  created_at: string;
  tier: "free" | "snapshot" | "blueprint" | "enterprise";
  is_subscribed: boolean;
  has_diagnostic: boolean;
  has_snapshot: boolean;
  has_blueprint: boolean;
  credits: number;
  credits_max: number;
  token?: string;
}

export function isAuthenticated(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const s = JSON.parse(raw);
    return Boolean(s?.access_token);
  } catch { return false; }
}

export function getUser(): User | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    const u = s?.user;
    const token = s?.access_token;
    if (!u) return null;
    const meta = u.user_metadata || {};
    return {
      user_id: u.id || "",
      email: u.email || "",
      account_type: meta.account_type || "free",
      company_name: meta.company_name,
      created_at: u.created_at || new Date().toISOString(),
      tier: meta.tier || "free",
      is_subscribed: Boolean(meta.is_subscribed),
      has_diagnostic: Boolean(meta.has_diagnostic),
      has_snapshot: Boolean(meta.has_snapshot),
      has_blueprint: Boolean(meta.has_blueprint),
      credits: Number(meta.credits || 0),
      credits_max: Number(meta.credits_max || 0),
      token,
    };
  } catch { return null; }
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw)?.access_token ?? null;
  } catch { return null; }
}

export function isAdmin(): boolean {
  const u = getUser();
  return u?.account_type === "superadmin";
}

export function logout() {
  if (typeof window !== "undefined") {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event("authManager:logout"));
    window.location.href = "/";
  }
}

export async function login(email: string, password: string) {
  const res = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Login failed');
  }
  const data = await res.json();
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      access_token: data.tokens?.access_token,
      refresh_token: data.tokens?.refresh_token,
      user: { id: data.user?.user_id, email: data.user?.email, created_at: data.user?.created_at,
        user_metadata: { account_type: data.user?.account_type, tier: data.user?.tier, company_name: data.user?.company_name }
      },
    }));
    window.dispatchEvent(new Event("authManager:login"));
  }
  return data;
}

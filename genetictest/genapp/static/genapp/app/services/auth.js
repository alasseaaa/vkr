const KEYS = {
  basicToken: "auth_basic_token",
  username: "auth_username",
  role: "auth_role",
  userId: "auth_user_id",
};

/** Резервная копия роли (логин / me); в `getEffectiveRole` после localStorage. */
const SESSION_ROLE = "genapp_effective_role";
/** В `main.js` один раз за сессию: проверка «не медсестра ли, если /auth/me/ оставил patient» */
export const NURSE_PROBE_ONCE_KEY = "genapp_nurse_probe_once";

export function getAuth() {
  const basicToken = localStorage.getItem(KEYS.basicToken);
  const username = localStorage.getItem(KEYS.username);
  const roleRaw = localStorage.getItem(KEYS.role);
  const role = roleRaw != null && roleRaw !== "" ? String(roleRaw).toLowerCase().trim() : null;
  const userIdRaw = localStorage.getItem(KEYS.userId);
  const userId = userIdRaw ? Number(userIdRaw) : null;
  return { basicToken, username, role, userId: Number.isFinite(userId) ? userId : null };
}

export function isAuthed() {
  const { basicToken } = getAuth();
  return Boolean(basicToken);
}

/**
 * Base64 от UTF-8. Нативный btoa() падает на кириллице и прочем не-Latin1.
 * Парсинг на стороне DRF: base64 → байты → decode UTF-8.
 */
function basicCredentialsToBase64Token(user, pass) {
  const raw = `${String(user)}:${String(pass)}`;
  if (typeof TextEncoder !== "undefined") {
    const bytes = new TextEncoder().encode(raw);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
  return btoa(unescape(encodeURIComponent(raw)));
}

/**
 * Сохраняем "token" как Basic base64. Это работает с текущей backend-реализацией
 * (SessionAuthentication + BasicAuthentication), не требуя CSRF.
 *
 * Безопасность: это хранит пароль в base64 в localStorage (демо-режим).
 * В боевом варианте лучше JWT/DRF Token.
 */
export function setBasicAuth({ username, password, role, userId }) {
  const basicToken = basicCredentialsToBase64Token(username, password);
  localStorage.setItem(KEYS.basicToken, basicToken);
  localStorage.setItem(KEYS.username, username);
  if (role) {
    const rr = String(role).toLowerCase().trim();
    localStorage.setItem(KEYS.role, rr);
    try {
      sessionStorage.setItem(SESSION_ROLE, rr);
    } catch {
      /* */
    }
  }
  if (userId != null && userId !== "") {
    localStorage.setItem(KEYS.userId, String(userId));
  }
}

export function clearAuth() {
  Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
  localStorage.removeItem("patient_without_genetic_test");
  try {
    sessionStorage.removeItem(SESSION_ROLE);
    sessionStorage.removeItem(NURSE_PROBE_ONCE_KEY);
    Object.keys(sessionStorage).forEach((k) => {
      if (k.startsWith("consent_ok_")) {
        sessionStorage.removeItem(k);
      }
    });
  } catch {
    /* ignore */
  }
}

export function getBasicAuthHeaderValue() {
  const { basicToken } = getAuth();
  if (!basicToken) return null;
  return `Basic ${basicToken}`;
}

/** Сравнение ролей в UI (всегда в нижнем регистре). */
export function normalizeRole(role) {
  if (role == null || role === "") return null;
  return String(role).toLowerCase().trim() || null;
}

/** Обновить роль в localStorage после `GET /api/auth/me/`. */
export function setStoredRole(role) {
  if (role == null || String(role).trim() === "") {
    localStorage.removeItem(KEYS.role);
    try {
      sessionStorage.removeItem(SESSION_ROLE);
    } catch {
      /* */
    }
  } else {
    const rr = String(role).toLowerCase().trim();
    localStorage.setItem(KEYS.role, rr);
    try {
      sessionStorage.setItem(SESSION_ROLE, rr);
    } catch {
      /* */
    }
  }
}

/**
 * Роль для навигации: сначала localStorage (тот же источник, что обновляется
 * из `setStoredRole(me)` сразу после `GET /api/auth/me/`), иначе session.
 * Важно: `session` не должен быть приоритетнее: если setItem в session
 * падает (квота/приватный режим), там мог остаться старый `patient` при уже
 * записанном `nurse` в local — и в сайдбаре рисовалось меню пациента.
 */
export function getEffectiveRole() {
  let s = null;
  try {
    s = sessionStorage.getItem(SESSION_ROLE);
  } catch {
    s = null;
  }
  return normalizeRole(getAuth().role) || normalizeRole(s);
}


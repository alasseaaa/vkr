const KEYS = {
  basicToken: "auth_basic_token",
  username: "auth_username",
  role: "auth_role",
  userId: "auth_user_id",
};

export function getAuth() {
  const basicToken = localStorage.getItem(KEYS.basicToken);
  const username = localStorage.getItem(KEYS.username);
  const role = localStorage.getItem(KEYS.role);
  const userIdRaw = localStorage.getItem(KEYS.userId);
  const userId = userIdRaw ? Number(userIdRaw) : null;
  return { basicToken, username, role, userId: Number.isFinite(userId) ? userId : null };
}

export function isAuthed() {
  const { basicToken } = getAuth();
  return Boolean(basicToken);
}

/**
 * Сохраняем "token" как Basic base64. Это работает с текущей backend-реализацией
 * (SessionAuthentication + BasicAuthentication), не требуя CSRF.
 *
 * Безопасность: это хранит пароль в base64 в localStorage (демо-режим).
 * В боевом варианте лучше JWT/DRF Token.
 */
export function setBasicAuth({ username, password, role, userId }) {
  const basicToken = btoa(`${username}:${password}`);
  localStorage.setItem(KEYS.basicToken, basicToken);
  localStorage.setItem(KEYS.username, username);
  if (role) localStorage.setItem(KEYS.role, role);
  if (userId != null && userId !== "") {
    localStorage.setItem(KEYS.userId, String(userId));
  }
}

export function clearAuth() {
  Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
  localStorage.removeItem("patient_without_genetic_test");
  try {
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


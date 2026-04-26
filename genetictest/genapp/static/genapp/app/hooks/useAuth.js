import { getAuth, isAuthed, getEffectiveRole } from "../services/auth.js?v=8";

export function useAuth() {
  return {
    isAuthed: isAuthed(),
    auth: getAuth(),
    role: getEffectiveRole(),
  };
}

export function getRole() {
  return getEffectiveRole();
}


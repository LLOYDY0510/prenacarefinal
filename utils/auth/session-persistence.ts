/* "Remember me" for the sign-in form. */

const PERSISTENCE_KEY = 'prenatrack:session-persistence';
const TAB_MARKER_KEY = 'prenatrack:session-tab';
export const SESSION_MARKER_COOKIE = 'prenatrack-session-active';
export const REMEMBER_COOKIE = 'prenatrack-remember';

function writeSessionPreference(remember: boolean) {
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${REMEMBER_COOKIE}=${remember ? 'persistent' : 'session'}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
  document.cookie = `${SESSION_MARKER_COOKIE}=${remember ? '' : '1'}; Path=/; SameSite=Lax${remember ? '; Max-Age=0' : ''}${secure}`;
}

export function persistRememberPreference(remember: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    writeSessionPreference(remember);
    if (remember) {
      window.localStorage.setItem(PERSISTENCE_KEY, 'persistent');
      window.sessionStorage.removeItem(TAB_MARKER_KEY);
    } else {
      window.localStorage.setItem(PERSISTENCE_KEY, 'session');
      window.sessionStorage.setItem(TAB_MARKER_KEY, '1');
    }
  } catch {
    // Private-mode browsers can refuse storage access; treat that as "persist".
  }
}

export function clearRememberPreference(): void {
  if (typeof window === 'undefined') return;
  try {
    document.cookie = `${REMEMBER_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
    document.cookie = `${SESSION_MARKER_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
    window.localStorage.removeItem(PERSISTENCE_KEY);
    window.sessionStorage.removeItem(TAB_MARKER_KEY);
  } catch {
    // Ignore storage failures.
  }
}

/**
 * True only when the user asked not to be remembered and the browser session
 * that signed in no longer exists.
 */
export function shouldEndSessionOnLoad(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const cookies = document.cookie.split(';').map((cookie) => cookie.trim());
    if (cookies.includes(`${REMEMBER_COOKIE}=persistent`)) return false;
    if (cookies.includes(`${REMEMBER_COOKIE}=session`)) return !cookies.includes(`${SESSION_MARKER_COOKIE}=1`);
    if (window.localStorage.getItem(PERSISTENCE_KEY) !== 'session') return false;
    if (document.cookie.split(';').some((cookie) => cookie.trim() === `${SESSION_MARKER_COOKIE}=1`)) return false;
    if (window.sessionStorage.getItem(TAB_MARKER_KEY) !== null) {
      writeSessionPreference(false);
      return false;
    }
    return true;

  } catch {
    return false;
  }
}

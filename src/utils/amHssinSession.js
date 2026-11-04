
/**
 * Wahret Zmen — Am Hssin
 * Browser session management
 *
 * Session IDs are opaque identifiers,
 * NOT authentication credentials.
 *
 * Never expose INTERNAL_AI_KEY in frontend code.
 */

const SESSION_KEY = "wahret_am_hssin_session_v4";

const SESSION_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;

function getStorage() {
  try {
    if (typeof window === "undefined") {
      return null;
    }

    return window.localStorage;
  } catch {
    return null;
  }
}

export function isValidAmHssinSessionId(id) {
  return (
    typeof id === "string" &&
    SESSION_PATTERN.test(id)
  );
}

export function getAmHssinSessionId() {
  const storage = getStorage();

  if (!storage) return null;

  try {
    const id = storage.getItem(SESSION_KEY);

    if (id === null) return null;

    if (!isValidAmHssinSessionId(id)) {
      storage.removeItem(SESSION_KEY);
      return null;
    }

    return id;
  } catch {
    return null;
  }
}

export function setAmHssinSessionId(id) {
  if (!isValidAmHssinSessionId(id)) {
    return false;
  }

  const storage = getStorage();

  if (!storage) return false;

  try {
    storage.setItem(SESSION_KEY, id);
    return true;
  } catch {
    return false;
  }
}

export function clearAmHssinSessionId() {
  const storage = getStorage();

  if (!storage) return false;

  try {
    storage.removeItem(SESSION_KEY);
    return true;
  } catch {
    return false;
  }
}

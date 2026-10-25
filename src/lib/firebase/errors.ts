const AUTH_MESSAGES: Record<string, string> = {
  'auth/user-disabled': 'This account has been disabled.',
  'auth/too-many-requests': 'Too many attempts. Please wait a few minutes and try again.',
  'auth/network-request-failed': 'Network error. Check your connection and try again.',
  'auth/popup-closed-by-user': 'The Google sign-in window was closed before finishing.',
  'auth/cancelled-popup-request': 'Another sign-in window is already open.',
  'auth/popup-blocked': 'Your browser blocked the sign-in pop-up. Allow pop-ups for this site and retry.',
  'auth/unauthorized-domain': 'This domain is not authorised for sign-in. Add it in Firebase Authentication settings.',
  'auth/operation-not-allowed': 'Google sign-in is not enabled for this Firebase project.',
  'auth/admin-restricted-operation': 'New account registration is disabled for this app.',
  'auth/requires-recent-login': 'Please sign in again to complete this action.',
  'auth/account-exists-with-different-credential': 'An account already exists with this email using a different sign-in method.',
  'auth/web-storage-unsupported': 'This browser blocks the storage needed for sign-in. Disable private mode or allow site data.',
  'auth/operation-not-supported-in-this-environment': 'Sign-in is not supported in this browser view. Open the site in your regular browser.',
  'auth/internal-error': 'Google sign-in failed. Check your connection and try again.',
};

export function errorCode(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'code' in error && typeof (error as { code: unknown }).code === 'string') {
    return (error as { code: string }).code;
  }
  return undefined;
}

export function friendlyAuthError(error: unknown): string {
  const code = errorCode(error);
  return (code && AUTH_MESSAGES[code]) || 'Something went wrong. Please try again.';
}

export function friendlyDataError(error: unknown): string {
  switch (errorCode(error)) {
    case 'permission-denied':
      return 'Permission denied. The change was rejected by the security rules.';
    case 'unavailable':
      return 'Firestore is unreachable. Check your connection and try again.';
    case 'offline':
      return error instanceof Error ? error.message : 'You are offline.';
    case 'resource-exhausted':
      return 'The free-tier quota has been reached for today. Try again later.';
    case 'failed-precondition':
      return 'A required database index is missing or still building.';
    case 'not-found':
      return 'The item no longer exists.';
    default:
      return error instanceof Error ? error.message : 'Unexpected error.';
  }
}

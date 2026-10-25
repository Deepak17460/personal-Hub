const AUTH_MESSAGES: Record<string, string> = {
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/invalid-login-credentials': 'Incorrect email or password.',
  'auth/wrong-password': 'Incorrect email or password.',
  'auth/user-not-found': 'Incorrect email or password.',
  'auth/invalid-email': 'That email address is not valid.',
  'auth/user-disabled': 'This account has been disabled.',
  'auth/too-many-requests': 'Too many attempts. Please wait a few minutes and try again.',
  'auth/network-request-failed': 'Network error. Check your connection and try again.',
  'auth/email-already-in-use': 'An account with this email already exists. Try signing in.',
  'auth/weak-password': 'Password is too weak. Use at least 8 characters.',
  'auth/popup-closed-by-user': 'The sign-in window was closed before finishing.',
  'auth/cancelled-popup-request': 'Another sign-in window is already open.',
  'auth/popup-blocked': 'Your browser blocked the sign-in pop-up. Allow pop-ups for this site and retry.',
  'auth/unauthorized-domain': 'This domain is not authorised for sign-in. Add it in Firebase Authentication settings.',
  'auth/operation-not-allowed': 'This sign-in method is not enabled for the Firebase project.',
  'auth/admin-restricted-operation': 'New account registration is disabled for this app.',
  'auth/requires-recent-login': 'Please sign in again to complete this action.',
  'auth/account-exists-with-different-credential': 'An account already exists with this email using a different sign-in method.',
  'auth/missing-email': 'Enter your email address.',
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
      return 'The database is unreachable. Changes will sync when you are back online.';
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

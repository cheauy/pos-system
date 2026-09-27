export const PASSWORD_HELP = 'Use at least 8 characters with uppercase, lowercase, a number and a symbol.';
export function passwordIssue(value: string): string | null {
  if (value.length > 72) return 'Password cannot exceed 72 characters.';
  return value.length >= 8 && /[A-Z]/.test(value) && /[a-z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9\s]/.test(value) ? null : PASSWORD_HELP;
}

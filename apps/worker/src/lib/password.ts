export class PasswordValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PasswordValidationError';
  }
}

export function validatePassword(password: string): void {
  if (password.length < 8) {
    throw new PasswordValidationError('Password must be at least 8 characters.');
  }

  if (!/[A-Z]/.test(password)) {
    throw new PasswordValidationError('Password must contain at least one uppercase letter.');
  }

  if (!/[a-z]/.test(password)) {
    throw new PasswordValidationError('Password must contain at least one lowercase letter.');
  }

  if (!/[0-9]/.test(password)) {
    throw new PasswordValidationError('Password must contain at least one number.');
  }
}

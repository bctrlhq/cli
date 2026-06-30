export type ApiErrorInfo = {
  status: number;
  code?: string;
  requestId?: string;
  details?: Record<string, unknown>;
};

export class CliError extends Error {
  readonly exitCode: number;
  readonly apiError?: ApiErrorInfo;

  constructor(message: string, options?: { exitCode?: number; cause?: unknown; apiError?: ApiErrorInfo }) {
    super(message, { cause: options?.cause });
    this.name = 'CliError';
    this.exitCode = options?.exitCode ?? 1;
    this.apiError = options?.apiError;
  }
}

export class AuthError extends CliError {
  constructor(message = 'BCTRL_API_KEY is required') {
    super(`${message}\n\nRun:\n  bctrl auth login\n\nOr set:\n  export BCTRL_API_KEY=...`, {
      exitCode: 4,
    });
    this.name = 'AuthError';
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

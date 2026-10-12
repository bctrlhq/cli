import { CliError, type ApiErrorInfo } from '../runtime/errors.js';

type StructuredErrorBody = {
  error?: unknown;
  message?: unknown;
  code?: unknown;
  requestId?: unknown;
  details?: unknown;
};

export async function apiErrorFromResponse(response: Response, context = 'BCTRL API request'): Promise<CliError> {
  const bodyText = await response.text();
  const parsed = parseErrorBody(bodyText);
  const message = parsed.message ?? parsed.error;
  const humanMessage =
    typeof message === 'string' && message.trim()
      ? message.trim()
      : bodyText || `${response.status} ${response.statusText}`;

  const apiError: ApiErrorInfo = {
    status: response.status,
    code: typeof parsed.code === 'string' ? parsed.code : undefined,
    requestId: typeof parsed.requestId === 'string' ? parsed.requestId : undefined,
    details: isRecord(parsed.details) ? parsed.details : undefined,
  };

  return new CliError(formatApiErrorMessage(context, response.status, humanMessage, apiError), {
    apiError,
  });
}

export function isUnauthorizedApiError(error: unknown): boolean {
  if (!(error instanceof CliError)) return false;
  return (
    error.apiError?.status === 401 &&
    (error.apiError.code === 'auth.required' ||
      error.apiError.code === 'auth.invalid' ||
      error.apiError.code === undefined)
  );
}

function parseErrorBody(bodyText: string): StructuredErrorBody {
  if (!bodyText) return {};
  try {
    const parsed = JSON.parse(bodyText) as unknown;
    return isRecord(parsed) ? parsed : { error: bodyText };
  } catch {
    return { error: bodyText };
  }
}

function formatApiErrorMessage(
  context: string,
  status: number,
  message: string,
  apiError: ApiErrorInfo
): string {
  const lines = [`${context} failed: ${status} ${message}`];

  if (apiError.code) {
    lines.push(`Code: ${apiError.code}`);
  }
  if (apiError.requestId) {
    lines.push(`Request ID: ${apiError.requestId}`);
  }

  const suggestion = suggestionForApiError(apiError);
  if (suggestion) {
    lines.push('', 'Try:', `  ${suggestion}`);
  }

  return lines.join('\n');
}

function suggestionForApiError(error: ApiErrorInfo): string | null {
  switch (error.code) {
    case 'auth.required':
    case 'auth.invalid':
      return 'bctrl auth login';
    case 'permission.denied':
    case 'auth.forbidden':
      return 'bctrl auth status';
    case 'space.not_found':
      return 'bctrl spaces list';
    case 'browser.not_found':
      return 'bctrl browsers list';
    case 'sandbox.not_found':
      return 'bctrl sandboxes list';
    case 'task.not_found':
      return 'bctrl tasks list';
    case 'run.not_found':
      return 'bctrl runs list';
    case 'file.not_found':
      return 'bctrl files list';
    case 'tool.not_found':
      return 'bctrl tools list';
    case 'tool_call.not_found':
      return 'bctrl tool-calls list';
    case 'browser_extension.not_found':
      return 'bctrl browser extensions list';
    case 'ai_credential.not_found':
      return 'bctrl ai credentials list';
    case 'proxy.not_found':
      return 'bctrl proxies list';
    case 'subaccount.not_found':
      return 'bctrl subaccounts list';
    case 'subaccount_api_key.not_found':
      return 'bctrl api-keys list';
    default:
      return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

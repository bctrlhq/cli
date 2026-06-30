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
      return 'bctrl space list';
    case 'runtime.not_found':
      return error.details && typeof error.details.spaceId === 'string'
        ? `bctrl runtime list --space ${error.details.spaceId}`
        : 'bctrl runtime list';
    case 'run.not_found':
      return error.details && typeof error.details.runtimeId === 'string'
        ? `bctrl runtime runs ${error.details.runtimeId}`
        : 'bctrl run list';
    case 'file.not_found':
      return error.details && typeof error.details.spaceId === 'string'
        ? `bctrl file list --space ${error.details.spaceId}`
        : 'bctrl file list';
    case 'tool.not_found':
      return commandWithOptionalSpace('bctrl tool list', error.details);
    case 'toolset.not_found':
      return commandWithOptionalSpace('bctrl toolset list', error.details);
    case 'tool_call.not_found':
      return 'bctrl tool-call list';
    case 'vault_secret.not_found':
      return 'bctrl vault list';
    case 'browser_extension.not_found':
      return 'bctrl browser extension list';
    case 'ai_credential.not_found':
      return 'bctrl ai credentials list';
    case 'proxy.not_found':
      return 'bctrl ai proxy list';
    case 'subaccount.not_found':
      return 'bctrl subaccount list';
    case 'subaccount_api_key.not_found':
      return error.details && typeof error.details.subaccountId === 'string'
        ? `bctrl subaccount key list ${error.details.subaccountId}`
        : 'bctrl subaccount list';
    default:
      return null;
  }
}

function commandWithOptionalSpace(command: string, details: Record<string, unknown> | undefined): string {
  return details && typeof details.spaceId === 'string' ? `${command} --space ${details.spaceId}` : command;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

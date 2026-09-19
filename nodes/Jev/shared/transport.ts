import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	ILoadOptionsFunctions,
	IN8nHttpFullResponse,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, sleep } from 'n8n-workflow';

export const DEFAULT_BASE_URL = 'https://api.typesafe.ai';

// 429 = rate limited, 529 = TypeSafe overloaded. Both are safe to retry.
const RETRYABLE_STATUS = new Set([429, 529]);
const MAX_BACKOFF_MS = 30_000;

export interface JevRequestOptions {
	maxRetries?: number;
	timeout?: number;
	itemIndex?: number;
}

function getHeader(headers: IDataObject | undefined, name: string): string | undefined {
	if (!headers) return undefined;
	const match = Object.keys(headers).find((key) => key.toLowerCase() === name);
	return match === undefined ? undefined : String(headers[match]);
}

/** Honors `retry-after` (seconds or HTTP date), otherwise exponential backoff with jitter. */
export function getRetryDelay(attempt: number, retryAfter?: string): number {
	if (retryAfter) {
		const seconds = Number(retryAfter);
		if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, MAX_BACKOFF_MS);
		const date = Date.parse(retryAfter);
		if (!Number.isNaN(date)) return Math.min(Math.max(date - Date.now(), 0), MAX_BACKOFF_MS);
	}
	const base = 1000 * 2 ** attempt;
	return Math.min(base + Math.floor(Math.random() * 250), MAX_BACKOFF_MS);
}

function describeError(body: unknown): string | undefined {
	if (!body || typeof body !== 'object') return typeof body === 'string' ? body : undefined;
	const { detail, message, error } = body as IDataObject;
	// 422 validation errors come back as a list of { loc, msg } entries.
	if (Array.isArray(detail)) {
		return detail
			.map((entry) => {
				const { loc, msg } = (entry ?? {}) as IDataObject;
				return Array.isArray(loc)
					? `${loc.join('.')}: ${msg}`
					: String(msg ?? JSON.stringify(entry));
			})
			.join('; ');
	}
	const text = detail ?? message ?? error;
	if (text === undefined) return undefined;
	return typeof text === 'string' ? text : JSON.stringify(text);
}

export async function jevApiRequest(
	this: IExecuteFunctions | ILoadOptionsFunctions,
	method: IHttpRequestMethods,
	endpoint: string,
	body?: IDataObject,
	options: JevRequestOptions = {},
): Promise<IDataObject> {
	const credentials = await this.getCredentials('jevApi');
	const baseURL = ((credentials.baseUrl as string) || DEFAULT_BASE_URL).replace(/\/+$/, '');
	const maxRetries = options.maxRetries ?? 3;

	for (let attempt = 0; ; attempt++) {
		const response = (await this.helpers.httpRequestWithAuthentication.call(this, 'jevApi', {
			method,
			baseURL,
			url: endpoint,
			body,
			json: true,
			returnFullResponse: true,
			ignoreHttpStatusErrors: true,
			timeout: options.timeout,
		})) as IN8nHttpFullResponse;

		const { statusCode } = response;
		if (statusCode >= 200 && statusCode < 300) return response.body as IDataObject;

		if (RETRYABLE_STATUS.has(statusCode) && attempt < maxRetries) {
			await sleep(getRetryDelay(attempt, getHeader(response.headers, 'retry-after')));
			continue;
		}

		const errorBody =
			response.body && typeof response.body === 'object'
				? (response.body as JsonObject)
				: { message: String(response.body ?? '') };

		throw new NodeApiError(this.getNode(), errorBody, {
			httpCode: String(statusCode),
			description: describeError(response.body),
			itemIndex: options.itemIndex,
		});
	}
}

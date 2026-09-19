import { NodeApiError } from 'n8n-workflow';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getRetryDelay, jevApiRequest } from '../nodes/Jev/shared/transport';
import { createContext, ok } from './helpers.mts';

describe('getRetryDelay', () => {
	afterEach(() => vi.useRealTimers());

	it('uses retry-after seconds, capped at 30 s', () => {
		expect(getRetryDelay(0, '2')).toBe(2000);
		expect(getRetryDelay(0, '0')).toBe(0);
		expect(getRetryDelay(0, '120')).toBe(30_000);
	});

	it('uses a retry-after HTTP date', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-09-19T12:00:00Z'));
		expect(getRetryDelay(0, 'Sat, 19 Sep 2026 12:00:05 GMT')).toBe(5000);
		expect(getRetryDelay(0, 'Sat, 19 Sep 2026 11:00:00 GMT')).toBe(0);
	});

	it('backs off exponentially with jitter when there is no header', () => {
		for (const [attempt, base] of [
			[0, 1000],
			[1, 2000],
			[3, 8000],
		]) {
			const delay = getRetryDelay(attempt);
			expect(delay).toBeGreaterThanOrEqual(base);
			expect(delay).toBeLessThan(base + 250);
		}
		expect(getRetryDelay(10)).toBe(30_000);
	});
});

describe('jevApiRequest', () => {
	const request = (responses: Parameters<typeof createContext>[2], maxRetries?: number) => {
		const context = createContext({}, [], responses);
		const promise = jevApiRequest.call(
			context.executeContext,
			'POST',
			'/v1/systemone',
			{ state: 'x' },
			{ maxRetries, timeout: 5000 },
		);
		return { ...context, promise };
	};

	it('sends an authenticated JSON request to the configured base URL', async () => {
		const { calls, promise } = request([ok({ answers: {} })]);
		await expect(promise).resolves.toEqual({ answers: {} });
		expect(calls).toHaveLength(1);
		expect(calls[0].credentialType).toBe('jevApi');
		expect(calls[0].request).toMatchObject({
			method: 'POST',
			baseURL: 'https://api.typesafe.ai',
			url: '/v1/systemone',
			body: { state: 'x' },
			json: true,
			returnFullResponse: true,
			ignoreHttpStatusErrors: true,
			timeout: 5000,
		});
	});

	it('retries 429 and 529 responses, honoring retry-after', async () => {
		const { calls, promise } = request([
			{ statusCode: 429, headers: { 'Retry-After': '0' } },
			{ statusCode: 529, headers: { 'retry-after': '0' } },
			ok({ answers: {} }),
		]);
		await expect(promise).resolves.toEqual({ answers: {} });
		expect(calls).toHaveLength(3);
	});

	it('stops after the configured number of retries', async () => {
		const { calls, promise } = request(
			[
				{ statusCode: 429, headers: { 'retry-after': '0' } },
				{ statusCode: 429, headers: { 'retry-after': '0' }, body: { detail: 'rate limited' } },
			],
			1,
		);
		const error = await promise.catch((e: unknown) => e);
		expect(error).toBeInstanceOf(NodeApiError);
		expect((error as NodeApiError).httpCode).toBe('429');
		expect(calls).toHaveLength(2);
	});

	it('does not retry other errors', async () => {
		const { calls, promise } = request([{ statusCode: 401, body: { detail: 'Invalid API key' } }]);
		const error = (await promise.catch((e: unknown) => e)) as NodeApiError;
		expect(error.httpCode).toBe('401');
		expect(error.description).toBe('Invalid API key');
		expect(calls).toHaveLength(1);
	});

	it('turns 422 validation details into a readable description', async () => {
		const { promise } = request([
			{
				statusCode: 422,
				body: {
					detail: [
						{ loc: ['body', 'questions', 'x', 'criteria'], msg: 'field required' },
						{ msg: 'second problem' },
					],
				},
			},
		]);
		const error = (await promise.catch((e: unknown) => e)) as NodeApiError;
		expect(error.httpCode).toBe('422');
		expect(error.description).toBe('body.questions.x.criteria: field required; second problem');
	});
});

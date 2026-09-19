import { NodeApiError, NodeOperationError } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';
import { Jev } from '../nodes/Jev/Jev.node';
import { createContext, items, ok, quickstartResponse, routeAnswer } from './helpers.mts';

const node = new Jev();
const model = { __rl: true, mode: 'list', value: 'jev-latest' };

const askParams = {
	operation: 'ask',
	model,
	stateSource: 'text',
	stateText: (item: { json: { message?: string } }) => item.json.message,
	questionMode: 'fields',
	questions: {
		question: [
			{
				id: 'department',
				type: 'choice',
				instructions: 'Which team?',
				choiceOptions: 'billing: Payments\ntechnical\nsales',
			},
			{
				id: 'frustration',
				type: 'score',
				instructions: 'Mood?',
				scoreLevels: 'Calm\nFrustrated\nVery angry',
			},
			{ id: 'is_urgent', type: 'noul', instructions: 'Urgent?' },
		],
	},
	options: {},
};

const routeParams = {
	operation: 'route',
	model,
	stateSource: 'text',
	stateText: (item: { json: { message?: string } }) => item.json.message,
	routeInstructions: 'Which team?',
	routes: {
		values: [
			{ name: 'billing', description: 'Payments' },
			{ name: 'technical' },
			{ name: 'sales' },
		],
	},
	lowConfidence: 'extraOutput',
	confidenceThreshold: 0.7,
	options: {},
};

describe('Ask Questions', () => {
	it('sends all questions in one request and flattens the answers', async () => {
		const input = [{ json: { message: 'Help!', ticket: 7 } }];
		const { calls, executeContext } = createContext(askParams, input, [ok(quickstartResponse)]);

		const [[output]] = await node.execute.call(executeContext);

		expect(calls[0].request.body).toEqual({
			state: 'Help!',
			model: 'jev-latest',
			questions: {
				department: {
					type: 'choice',
					instructions: 'Which team?',
					criteria: { billing: 'Payments', technical: null, sales: null },
				},
				frustration: {
					type: 'score',
					instructions: 'Mood?',
					criteria: ['Calm', 'Frustrated', 'Very angry'],
				},
				is_urgent: { type: 'noul', instructions: 'Urgent?' },
			},
		});
		expect(output.json).toEqual({
			message: 'Help!',
			ticket: 7,
			jev: {
				department: 'billing',
				department_confidence: 0.596,
				frustration: 1.035,
				frustration_level: 'Frustrated',
				frustration_confidence: 0.84,
				is_urgent: 0.999,
				_model: 'jev-1.13.0',
			},
		});
		expect(output.pairedItem).toEqual({ item: 0 });
	});

	it('makes one request per item', async () => {
		const { calls, executeContext } = createContext(askParams, items('a', 'b'), [
			ok(quickstartResponse),
			ok(quickstartResponse),
		]);
		const [output] = await node.execute.call(executeContext);
		expect(calls.map((call) => (call.request.body as { state: string }).state)).toEqual(['a', 'b']);
		expect(output).toHaveLength(2);
	});

	it('supports JSON questions, whole-item state, raw output, and a custom output field', async () => {
		const input = [{ json: { ticket: { subject: 'x' } } }];
		const { calls, executeContext } = createContext(
			{
				...askParams,
				stateSource: 'inputItem',
				questionMode: 'json',
				questionsJson: '{"u":{"type":"noul","instructions":{"ask":"Urgent?"}}}',
				options: { simplify: false, includeInputFields: false, outputField: 'result' },
			},
			input,
			[ok(quickstartResponse)],
		);

		const [[output]] = await node.execute.call(executeContext);

		expect(calls[0].request.body).toMatchObject({
			state: { ticket: { subject: 'x' } },
			questions: { u: { type: 'noul', instructions: { ask: 'Urgent?' } } },
		});
		expect(output.json).toEqual({ result: quickstartResponse });
	});

	it('sends JSON state and object-valued text expressions as structured state', async () => {
		const jsonState = createContext(
			{ ...askParams, stateSource: 'json', stateJson: '{"a":1}' },
			items('x'),
			[ok(quickstartResponse)],
		);
		const objectText = createContext({ ...askParams, stateText: () => ({ b: 2 }) }, items('x'), [
			ok(quickstartResponse),
		]);
		await node.execute.call(jsonState.executeContext);
		await node.execute.call(objectText.executeContext);
		expect((jsonState.calls[0].request.body as { state: unknown }).state).toEqual({ a: 1 });
		expect((objectText.calls[0].request.body as { state: unknown }).state).toEqual({ b: 2 });
	});

	it('uses a model entered by ID', async () => {
		const { calls, executeContext } = createContext(
			{ ...askParams, model: { __rl: true, mode: 'id', value: 'jev-1.13.0' } },
			items('x'),
			[ok(quickstartResponse)],
		);
		await node.execute.call(executeContext);
		expect((calls[0].request.body as { model: string }).model).toBe('jev-1.13.0');
	});

	it.each([
		['empty state', { stateText: () => '  ' }, /State is empty/],
		['invalid state JSON', { stateSource: 'json', stateJson: '{oops' }, /not valid JSON/],
		['non-object state JSON', { stateSource: 'json', stateJson: '"text"' }, /object or array/],
		['invalid questions JSON', { questionMode: 'json', questionsJson: '{' }, /not valid JSON/],
		[
			'unknown question type',
			{ questionMode: 'json', questionsJson: '{"a":{"type":"x"}}' },
			/"type"/,
		],
		['missing model', { model: { __rl: true, mode: 'list', value: '' } }, /Select a model/],
		[
			'invalid question fields',
			{
				questions: {
					question: [{ id: 'x', type: 'choice', instructions: 'q', choiceOptions: 'one' }],
				},
			},
			/at least two options/,
		],
	])('fails on %s without calling the API', async (_case, override, message) => {
		const { calls, executeContext } = createContext({ ...askParams, ...override }, items('x'), []);
		const error = await node.execute.call(executeContext).catch((e: unknown) => e);
		expect(error).toBeInstanceOf(NodeOperationError);
		expect((error as Error).message).toMatch(message);
		expect(calls).toHaveLength(0);
	});

	it('passes API errors through as NodeApiError', async () => {
		const { executeContext } = createContext(askParams, items('x'), [
			{ statusCode: 401, body: { detail: 'Invalid API key' } },
		]);
		await expect(node.execute.call(executeContext)).rejects.toBeInstanceOf(NodeApiError);
	});

	it('continues past failed items when Continue On Fail is on', async () => {
		const { executeContext } = createContext(
			askParams,
			items('a', 'b'),
			[{ statusCode: 422, body: { detail: 'bad' } }, ok(quickstartResponse)],
			{ continueOnFail: true },
		);
		const [output] = await node.execute.call(executeContext);
		expect(output[0].json).toMatchObject({ message: 'a', error: expect.any(String) });
		expect(output[1].json.jev).toMatchObject({ department: 'billing' });
	});
});

describe('Route by Choice', () => {
	it('sends each item to its route and uncertain items to Low Confidence', async () => {
		const { calls, executeContext } = createContext(routeParams, items('a', 'b', 'c'), [
			routeAnswer('technical', 0.9),
			routeAnswer('billing', 0.4),
			routeAnswer('sales', 0.7),
		]);

		const outputs = await node.execute.call(executeContext);

		expect(calls[0].request.body).toMatchObject({
			questions: {
				route: {
					type: 'choice',
					instructions: 'Which team?',
					criteria: { billing: 'Payments', technical: null, sales: null },
				},
			},
		});
		expect(outputs.map((output) => output.map((item) => item.json.message))).toEqual([
			[],
			['a'],
			['c'],
			['b'],
		]);
		expect(outputs[3][0].json.jev).toEqual({
			route: 'billing',
			confidence: 0.4,
			lowConfidence: true,
			probabilities: { billing: 0.4 },
			_model: 'jev-1.13.0',
		});
		expect(outputs[1][0].pairedItem).toEqual({ item: 0 });
	});

	it('has no Low Confidence output when sending to the best route', async () => {
		const { executeContext } = createContext(
			{ ...routeParams, lowConfidence: 'bestRoute' },
			items('a'),
			[routeAnswer('billing', 0.1)],
		);
		const outputs = await node.execute.call(executeContext);
		expect(outputs).toHaveLength(3);
		expect(outputs[0][0].json.jev).toMatchObject({ route: 'billing', lowConfidence: false });
	});

	it('fails when Jev returns an unknown route, or continues on fail', async () => {
		const failing = createContext(routeParams, items('a'), [routeAnswer('marketing', 0.9)]);
		await expect(node.execute.call(failing.executeContext)).rejects.toThrow(
			/not one of the configured routes/,
		);

		const continuing = createContext(routeParams, items('a'), [routeAnswer('marketing', 0.9)], {
			continueOnFail: true,
		});
		const outputs = await node.execute.call(continuing.executeContext);
		expect(outputs[0][0].json.error).toMatch(/not one of the configured routes/);
	});

	it('validates routes before calling the API', async () => {
		const { calls, executeContext } = createContext(
			{ ...routeParams, routes: { values: [{ name: 'only' }] } },
			items('a'),
			[],
		);
		await expect(node.execute.call(executeContext)).rejects.toThrow(/at least two routes/);
		expect(calls).toHaveLength(0);
	});
});

describe('searchModels', () => {
	const models = ok({
		models: [
			{ name: 'jev-latest', description: 'Stable', release_date: '2026-09-01' },
			{ name: 'jev-preview', description: 'Preview' },
		],
	});

	it('lists models from /v1/models', async () => {
		const { calls, loadOptionsContext } = createContext({}, [], [models]);
		const result = await node.methods.listSearch.searchModels.call(loadOptionsContext);
		expect(calls[0].request).toMatchObject({ method: 'GET', url: '/v1/models' });
		expect(result.results).toEqual([
			{ name: 'jev-latest', value: 'jev-latest', description: 'Stable · 2026-09-01' },
			{ name: 'jev-preview', value: 'jev-preview', description: 'Preview' },
		]);
	});

	it('filters by name', async () => {
		const { loadOptionsContext } = createContext({}, [], [models]);
		const result = await node.methods.listSearch.searchModels.call(loadOptionsContext, 'PREV');
		expect(result.results.map((model) => model.value)).toEqual(['jev-preview']);
	});
});

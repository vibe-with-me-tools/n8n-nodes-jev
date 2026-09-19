import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	INodeExecutionData,
} from 'n8n-workflow';

export interface FakeResponse {
	statusCode: number;
	headers?: IDataObject;
	body?: unknown;
}

export interface RecordedCall {
	credentialType: string;
	request: IHttpRequestOptions;
}

type Param = unknown | ((item: INodeExecutionData) => unknown);

function getPath(source: unknown, path: string): unknown {
	return path
		.split('.')
		.reduce<unknown>(
			(value, key) =>
				value === null || value === undefined ? undefined : (value as IDataObject)[key],
			source,
		);
}

/**
 * A minimal stand-in for the context n8n passes to `execute()` and list-search methods.
 * Parameters may be functions of the current item, which is how expressions are simulated.
 * Each HTTP call consumes the next queued response and is recorded for assertions.
 */
export function createContext(
	params: Record<string, Param>,
	items: INodeExecutionData[],
	responses: FakeResponse[],
	{ continueOnFail = false } = {},
) {
	const calls: RecordedCall[] = [];
	const queue = [...responses];

	const context = {
		getInputData: () => items,
		getNode: () => ({
			id: 'jev-test',
			name: 'Jev',
			type: 'n8n-nodes-jev.jev',
			typeVersion: 1,
			position: [0, 0] as [number, number],
			parameters: {},
		}),
		getCredentials: async () => ({ apiKey: 'test-key', baseUrl: 'https://api.typesafe.ai/' }),
		continueOnFail: () => continueOnFail,
		getNodeParameter(
			name: string,
			itemIndex: number,
			fallback?: unknown,
			options?: { extractValue?: boolean },
		) {
			let value = getPath(params, name);
			if (typeof value === 'function') value = value(items[itemIndex]);
			if (options?.extractValue && value && typeof value === 'object' && 'value' in value) {
				return (value as IDataObject).value;
			}
			return value === undefined ? fallback : value;
		},
		helpers: {
			async httpRequestWithAuthentication(credentialType: string, request: IHttpRequestOptions) {
				calls.push({ credentialType, request });
				const response = queue.shift();
				if (!response) throw new Error(`Unexpected request to ${request.url}`);
				return { headers: {}, ...response };
			},
		},
	};

	return {
		calls,
		executeContext: context as unknown as IExecuteFunctions,
		loadOptionsContext: context as unknown as ILoadOptionsFunctions,
	};
}

export const items = (...messages: string[]): INodeExecutionData[] =>
	messages.map((message) => ({ json: { message } }));

export const ok = (body: unknown): FakeResponse => ({ statusCode: 200, body });

/** Builds an API response whose single `route` answer is a Choice. */
export const routeAnswer = (choice: string, confidence: number): FakeResponse =>
	ok({
		model: 'jev-1.13.0',
		answers: {
			route: { type: 'choice', choice, confidence, probabilities: { [choice]: confidence } },
		},
	});

/** The response from the quickstart in the TypeSafe docs. */
export const quickstartResponse = {
	model: 'jev-1.13.0',
	answers: {
		department: {
			type: 'choice',
			choice: 'billing',
			probabilities: { billing: 0.84, technical: 0.159, sales: 0.001 },
			confidence: 0.596,
		},
		frustration: {
			type: 'score',
			score: 1.035,
			legend: { 0: 'Calm', 1: 'Frustrated', 2: 'Very angry' },
			probabilities: { 0: 0.1, 1: 0.75, 2: 0.15 },
			confidence: 0.84,
		},
		is_urgent: { type: 'noul', noul: 0.999 },
	},
	usage: { input_tokens: 312, output_tokens: 48 },
};

import type { INodeProperties } from 'n8n-workflow';

const showForAsk = { show: { operation: ['ask'] } };
const showForAll = { show: { operation: ['ask', 'route'] } };
const showForRoute = { show: { operation: ['route'] } };

export const operationProperty: INodeProperties = {
	displayName: 'Operation',
	name: 'operation',
	type: 'options',
	noDataExpression: true,
	options: [
		{
			name: 'Ask Questions',
			value: 'ask',
			description: 'Evaluate a state against typed Choice, Score, and Noul questions',
			action: 'Ask questions about a state',
		},
		{
			name: 'Route by Choice',
			value: 'route',
			description: 'Send each item to the output of the route Jev picks for it',
			action: 'Route items by choice',
		},
	],
	default: 'ask',
};

export const modelProperty: INodeProperties = {
	displayName: 'Model',
	name: 'model',
	type: 'resourceLocator',
	default: { mode: 'list', value: 'jev-latest' },
	required: true,
	description:
		'The Jev model to use. Aliases like jev-latest move with new releases; pin a version ID to keep answers stable.',
	modes: [
		{
			displayName: 'From List',
			name: 'list',
			type: 'list',
			typeOptions: {
				searchListMethod: 'searchModels',
				searchable: true,
			},
		},
		{
			displayName: 'ID',
			name: 'id',
			type: 'string',
			placeholder: 'e.g. jev-1.13.0',
		},
	],
	displayOptions: showForAll,
};

export const stateProperties: INodeProperties[] = [
	{
		displayName: 'State Source',
		name: 'stateSource',
		type: 'options',
		noDataExpression: true,
		options: [
			{
				name: 'Text',
				value: 'text',
				description: 'A single message, article, or passage',
			},
			{
				name: 'JSON',
				value: 'json',
				description: 'An object or array with named fields, records, or a conversation',
			},
			{
				name: 'Whole Input Item',
				value: 'inputItem',
				description: "Send the incoming item's JSON as the state",
			},
		],
		default: 'text',
		description:
			'The content Jev evaluates. Every question sees the same state. Objects with descriptive field names usually work best.',
		displayOptions: showForAll,
	},
	{
		displayName: 'State',
		name: 'stateText',
		type: 'string',
		typeOptions: { rows: 4 },
		default: '',
		required: true,
		placeholder: 'e.g. {{ $json.message }}',
		displayOptions: { show: { operation: ['ask', 'route'], stateSource: ['text'] } },
	},
	{
		displayName: 'State (JSON)',
		name: 'stateJson',
		type: 'json',
		default: '{\n  "message": ""\n}',
		required: true,
		displayOptions: { show: { operation: ['ask', 'route'], stateSource: ['json'] } },
	},
];

export const questionProperties: INodeProperties[] = [
	{
		displayName: 'Define Questions',
		name: 'questionMode',
		type: 'options',
		noDataExpression: true,
		options: [
			{
				name: 'Using Fields Below',
				value: 'fields',
			},
			{
				name: 'Using JSON',
				value: 'json',
				description:
					'Write the questions map as in the API reference; supports structured instructions and criteria',
			},
		],
		default: 'fields',
		displayOptions: showForAsk,
	},
	{
		displayName: 'Questions',
		name: 'questions',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true, sortable: true },
		placeholder: 'Add Question',
		default: {},
		description:
			'Keep each question atomic: one decision per question. All questions are answered in a single request.',
		displayOptions: { show: { operation: ['ask'], questionMode: ['fields'] } },
		options: [
			{
				name: 'question',
				displayName: 'Question',
				values: [
					{
						displayName: 'Answer Type',
						name: 'type',
						type: 'options',
						options: [
							{
								name: 'Choice',
								value: 'choice',
								description:
									'Pick one option from a set. Returns the option, probabilities, and confidence.',
							},
							{
								name: 'Noul (Yes/No)',
								value: 'noul',
								description: 'Returns the probability (0-1) that the answer is yes',
							},
							{
								name: 'Score',
								value: 'score',
								description:
									'Rate against ordered levels. Returns a weighted score and confidence.',
							},
						],
						default: 'noul',
					},
					{
						displayName: 'ID',
						name: 'id',
						type: 'string',
						default: '',
						required: true,
						placeholder: 'e.g. is_urgent',
						description: 'Key the answer is returned under. Not sent to the model.',
					},
					{
						displayName: 'Instructions',
						name: 'instructions',
						type: 'string',
						typeOptions: { rows: 2 },
						default: '',
						required: true,
						placeholder: 'e.g. Does this message convey urgency?',
						description:
							'The exact question or condition. Jev reads literally, so state boundary cases explicitly.',
					},
					{
						displayName: 'Levels',
						name: 'scoreLevels',
						type: 'string',
						typeOptions: { rows: 4 },
						default: '',
						required: true,
						placeholder:
							'Calm, just stating facts\nFrustrated but civil\nVery angry, strong language',
						description:
							'One level description per line, lowest first. At least two. Level numbers start at 0.',
						displayOptions: { show: { type: ['score'] } },
					},
					{
						displayName: 'No Means',
						name: 'falseCriterion',
						type: 'string',
						default: '',
						placeholder: 'e.g. No urgency expressed',
						description: 'Optional: what a no (value near 0) means',
						displayOptions: { show: { type: ['noul'] } },
					},
					{
						displayName: 'Options',
						name: 'choiceOptions',
						type: 'string',
						typeOptions: { rows: 4 },
						default: '',
						required: true,
						placeholder:
							'billing: Payments, invoicing, refunds\ntechnical: Bugs, outages, integrations\nsales',
						description:
							'One option per line, optionally followed by ": description". At least two.',
						displayOptions: { show: { type: ['choice'] } },
					},
					{
						displayName: 'Yes Means',
						name: 'trueCriterion',
						type: 'string',
						default: '',
						placeholder: 'e.g. Explicitly time-sensitive',
						description: 'Optional: what a yes (value near 1) means',
						displayOptions: { show: { type: ['noul'] } },
					},
				],
			},
		],
	},
	{
		displayName: 'Questions (JSON)',
		name: 'questionsJson',
		type: 'json',
		default:
			'{\n  "is_urgent": {\n    "type": "noul",\n    "instructions": "Does this message convey urgency?"\n  }\n}',
		required: true,
		description: 'Map of question ID to question. See https://docs.typesafe.ai/api.',
		displayOptions: { show: { operation: ['ask'], questionMode: ['json'] } },
	},
];

export const optionsProperty: INodeProperties = {
	displayName: 'Options',
	name: 'options',
	type: 'collection',
	placeholder: 'Add Option',
	default: {},
	displayOptions: showForAll,
	options: [
		{
			displayName: 'Include Input Fields',
			name: 'includeInputFields',
			type: 'boolean',
			default: true,
			description: 'Whether to keep the fields of the incoming item next to the answers',
		},
		{
			displayName: 'Max Retries',
			name: 'maxRetries',
			type: 'number',
			typeOptions: { minValue: 0, maxValue: 10 },
			default: 3,
			description:
				'How many times to retry when TypeSafe is rate limiting (429) or overloaded (529), with backoff',
		},
		{
			displayName: 'Output Field',
			name: 'outputField',
			type: 'string',
			default: 'jev',
			description: 'Name of the field the answers are written to',
		},
		{
			displayName: 'Simplify Output',
			name: 'simplify',
			type: 'boolean',
			default: true,
			description:
				'Whether to return one flat value per question (plus _confidence and _level fields) instead of the full API response with probabilities and usage',
			displayOptions: { show: { '/operation': ['ask'] } },
		},
		{
			displayName: 'Timeout (Ms)',
			name: 'timeout',
			type: 'number',
			typeOptions: { minValue: 1000 },
			default: 60000,
			description: 'How long to wait for a response before failing the request',
		},
	],
};

export const routeProperties: INodeProperties[] = [
	{
		displayName: 'Instructions',
		name: 'routeInstructions',
		type: 'string',
		typeOptions: { rows: 2 },
		default: '',
		required: true,
		placeholder: 'e.g. Which team should handle this ticket?',
		description:
			'What Jev should decide. Jev reads literally, so state boundary cases in the route descriptions.',
		displayOptions: showForRoute,
	},
	{
		displayName: 'Routes',
		name: 'routes',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true, sortable: true },
		placeholder: 'Add Route',
		default: {},
		description: 'Each route becomes an output of this node. Add at least two.',
		displayOptions: showForRoute,
		options: [
			{
				name: 'values',
				displayName: 'Route',
				values: [
					{
						displayName: 'Name',
						name: 'name',
						type: 'string',
						default: '',
						required: true,
						noDataExpression: true,
						placeholder: 'e.g. billing',
						description: 'Option name sent to Jev and label of the output',
					},
					{
						displayName: 'Use When',
						name: 'description',
						type: 'string',
						default: '',
						placeholder: 'e.g. Payments, invoicing, or refunds',
						description:
							'Optional: what belongs in this route. Clear, non-overlapping descriptions route best.',
					},
				],
			},
		],
	},
	{
		displayName: 'Low Confidence Handling',
		name: 'lowConfidence',
		type: 'options',
		noDataExpression: true,
		options: [
			{
				name: 'Send to Best Route Anyway',
				value: 'bestRoute',
			},
			{
				name: 'Send to Low Confidence Output',
				value: 'extraOutput',
				description: 'Adds an extra output for items Jev is unsure about, e.g. for human review',
			},
		],
		default: 'extraOutput',
		displayOptions: showForRoute,
	},
	{
		displayName: 'Confidence Threshold',
		name: 'confidenceThreshold',
		type: 'number',
		typeOptions: { minValue: 0, maxValue: 1, numberPrecision: 2 },
		default: 0.5,
		description:
			'Items whose confidence is below this go to the Low Confidence output. Use higher values when a wrong route is costly.',
		displayOptions: { show: { operation: ['route'], lowConfidence: ['extraOutput'] } },
	},
];

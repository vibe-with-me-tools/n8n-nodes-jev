import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { IDataObject, INodeExecutionData } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';
import { Jev } from '../nodes/Jev/Jev.node';
import { createContext, ok } from './helpers.mts';

interface WorkflowNode {
	name: string;
	type: string;
	parameters: IDataObject;
	credentials?: Record<string, { id?: string; name: string }>;
}

interface Workflow {
	nodes: WorkflowNode[];
	connections: Record<string, { main: unknown[][] }>;
}

const examplesDir = fileURLToPath(new URL('../examples/', import.meta.url));
const files = readdirSync(examplesDir).filter((file) => file.endsWith('.json'));

/** Resolves the `={{ $json.path }}` expressions the examples use. */
function resolve(value: unknown, item: INodeExecutionData): unknown {
	if (typeof value !== 'string' || !value.startsWith('={{')) return value;
	const path = value
		.slice(3, -2)
		.trim()
		.replace(/^\$json\.?/, '');
	return path
		.split('.')
		.reduce<unknown>((current, key) => (current as IDataObject)?.[key], item.json);
}

/** Answers every question with a valid answer of the right type. */
function fakeAnswers(questions: Record<string, IDataObject>) {
	const answers: IDataObject = {};
	for (const [id, question] of Object.entries(questions)) {
		const criteria = question.criteria as IDataObject;
		answers[id] =
			question.type === 'noul'
				? { type: 'noul', noul: 0.9 }
				: question.type === 'choice'
					? { type: 'choice', choice: Object.keys(criteria)[0], confidence: 0.9, probabilities: {} }
					: { type: 'score', score: 1, legend: { 0: 'a', 1: 'b' }, confidence: 0.9 };
	}
	return { model: 'jev-1.13.0', answers };
}

describe.each(files)('examples/%s', (file) => {
	const workflow = JSON.parse(readFileSync(examplesDir + file, 'utf8')) as Workflow;
	const jevNode = workflow.nodes.find((n) => n.type === 'n8n-nodes-jev.jev');
	const sampleNode = workflow.nodes.find((n) => n.type === 'n8n-nodes-base.code');

	it('uses the published node type and carries no credential ID', () => {
		expect(jevNode).toBeDefined();
		expect(workflow.nodes.some((n) => n.type.startsWith('CUSTOM.'))).toBe(false);
		expect(jevNode?.credentials?.jevApi?.id).toBeUndefined();
	});

	it('builds valid requests from its sample data, with outputs matching its connections', async () => {
		const sample = new Function(sampleNode!.parameters.jsCode as string)() as INodeExecutionData[];
		const parameters = jevNode!.parameters;
		const { calls, executeContext } = createContext({}, sample, []);
		const requests: IDataObject[] = [];

		Object.assign(executeContext, {
			getNodeParameter(name: string, itemIndex: number, fallback?: unknown) {
				const value = name
					.split('.')
					.reduce<unknown>((current, key) => (current as IDataObject)?.[key], parameters);
				if (value && typeof value === 'object' && '__rl' in value)
					return (value as IDataObject).value;
				const resolved = resolve(value, sample[itemIndex]);
				return resolved === undefined ? fallback : resolved;
			},
		});
		executeContext.helpers.httpRequestWithAuthentication = (async (
			_type: string,
			request: IDataObject,
		) => {
			const body = request.body as IDataObject;
			requests.push(body);
			return ok(fakeAnswers(body.questions as Record<string, IDataObject>));
		}) as never;

		const outputs = await new Jev().execute.call(executeContext);

		expect(calls).toHaveLength(0);
		expect(requests).toHaveLength(sample.length);
		for (const body of requests) {
			expect(body.model).toBe('jev-latest');
			expect(body.state).toBeTruthy();
		}
		expect(outputs).toHaveLength(workflow.connections[jevNode!.name].main.length);
	});
});

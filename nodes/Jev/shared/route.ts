import type { IDataObject } from 'n8n-workflow';
import { QuestionDefinitionError } from './questions';

export const ROUTE_QUESTION_ID = 'route';
export const LOW_CONFIDENCE_OUTPUT = 'Low Confidence';

export interface RouteField {
	name?: string;
	description?: string;
}

/**
 * Computes the node's outputs from its parameters. n8n evaluates this in the editor via
 * `outputs: '={{(fn)($parameter)}}'`, so it is stringified: it must stay self-contained
 * (no imports, no helpers from outside its own body).
 */
export const configuredOutputs = (parameters: IDataObject) => {
	if (parameters.operation !== 'route') return [{ type: 'main' }];

	const routesParam = (parameters.routes || {}) as IDataObject;
	const routes = (routesParam.values || []) as Array<{ name?: string }>;
	const outputs = routes.map((route, index) => ({
		type: 'main',
		displayName: route.name || 'Route ' + (index + 1),
	}));
	if (parameters.lowConfidence !== 'bestRoute') {
		outputs.push({ type: 'main', displayName: 'Low Confidence' });
	}
	return outputs;
};

export function buildRouteQuestion(instructions: string, routes: RouteField[]): IDataObject {
	if (!instructions.trim()) throw new QuestionDefinitionError('Instructions are empty');
	if (routes.length < 2) throw new QuestionDefinitionError('Add at least two routes');

	const criteria: Record<string, string | null> = {};
	for (const [index, route] of routes.entries()) {
		const name = (route.name ?? '').trim();
		if (!name) throw new QuestionDefinitionError(`Route ${index + 1} has no name`);
		if (name in criteria) throw new QuestionDefinitionError(`Route name "${name}" is used twice`);
		criteria[name] = route.description?.trim() || null;
	}

	return { type: 'choice', instructions: instructions.trim(), criteria };
}

export interface RouteDecision {
	outputIndex: number;
	result: IDataObject;
}

/**
 * Picks the output for one answer. Routes map to outputs in order; when the low
 * confidence output is enabled it is the last output.
 */
export function decideRoute(
	response: IDataObject,
	routeNames: string[],
	lowConfidenceOutput: boolean,
	threshold: number,
): RouteDecision {
	const answers = (response.answers ?? {}) as Record<string, IDataObject>;
	const answer = answers[ROUTE_QUESTION_ID];
	const choice = answer?.choice as string | undefined;
	const routeIndex = choice === undefined ? -1 : routeNames.indexOf(choice);
	if (routeIndex === -1) {
		throw new QuestionDefinitionError(
			`Jev returned route "${String(choice)}", which is not one of the configured routes`,
		);
	}

	const confidence = answer.confidence as number;
	const isLowConfidence = lowConfidenceOutput && confidence < threshold;

	return {
		outputIndex: isLowConfidence ? routeNames.length : routeIndex,
		result: {
			route: choice,
			confidence,
			lowConfidence: isLowConfidence,
			probabilities: answer.probabilities,
			_model: response.model,
		},
	};
}

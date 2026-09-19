import type { IDataObject } from 'n8n-workflow';

export type QuestionType = 'noul' | 'choice' | 'score';

const QUESTION_TYPES: QuestionType[] = ['noul', 'choice', 'score'];

/** One entry of the "Questions" fixed collection, as n8n hands it to us. */
export interface QuestionField {
	id?: string;
	type?: QuestionType;
	instructions?: string;
	choiceOptions?: unknown;
	scoreLevels?: unknown;
	trueCriterion?: string;
	falseCriterion?: string;
}

/** Thrown for problems in how the user defined the questions; the node turns these into NodeOperationErrors. */
export class QuestionDefinitionError extends Error {}

function splitLines(text: string): string[] {
	return text
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line.length > 0);
}

/**
 * Choice options come from a multi-line field: one option per line, optionally
 * followed by `: description`. An expression may also return an array of option
 * names or an `{ option: description }` object.
 */
export function parseChoiceOptions(value: unknown, id: string): Record<string, string | null> {
	const criteria: Record<string, string | null> = {};

	if (Array.isArray(value)) {
		for (const option of value) criteria[String(option).trim()] = null;
	} else if (value && typeof value === 'object') {
		for (const [option, description] of Object.entries(value)) {
			criteria[option] = description === null || description === '' ? null : String(description);
		}
	} else {
		for (const line of splitLines(String(value ?? ''))) {
			const colon = line.indexOf(':');
			const option = (colon === -1 ? line : line.slice(0, colon)).trim();
			const description = colon === -1 ? '' : line.slice(colon + 1).trim();
			if (!option) throw new QuestionDefinitionError(`Question "${id}" has an option with no name`);
			if (option in criteria) {
				throw new QuestionDefinitionError(`Question "${id}" lists option "${option}" twice`);
			}
			criteria[option] = description || null;
		}
	}

	if (Object.keys(criteria).length < 2) {
		throw new QuestionDefinitionError(`Choice question "${id}" needs at least two options`);
	}
	return criteria;
}

/** Score levels: one per line, lowest level first. An expression may also return an array. */
export function parseScoreLevels(value: unknown, id: string): string[] {
	const levels = Array.isArray(value)
		? value.map((level) => String(level).trim()).filter((level) => level.length > 0)
		: splitLines(String(value ?? ''));

	if (levels.length < 2) {
		throw new QuestionDefinitionError(`Score question "${id}" needs at least two levels`);
	}
	return levels;
}

export function buildQuestionsFromFields(fields: QuestionField[]): IDataObject {
	if (fields.length === 0) throw new QuestionDefinitionError('Add at least one question');

	const questions: IDataObject = {};
	for (const [index, field] of fields.entries()) {
		const id = (field.id ?? '').trim();
		if (!id) throw new QuestionDefinitionError(`Question ${index + 1} has no ID`);
		if (id in questions) throw new QuestionDefinitionError(`Question ID "${id}" is used twice`);

		const instructions = (field.instructions ?? '').trim();
		if (!instructions) throw new QuestionDefinitionError(`Question "${id}" has no instructions`);

		const type = field.type ?? 'noul';
		const question: IDataObject = { type, instructions };

		if (type === 'choice') {
			question.criteria = parseChoiceOptions(field.choiceOptions, id);
		} else if (type === 'score') {
			question.criteria = parseScoreLevels(field.scoreLevels, id);
		} else {
			const criteria: IDataObject = {};
			if (field.trueCriterion?.trim()) criteria.true = field.trueCriterion.trim();
			if (field.falseCriterion?.trim()) criteria.false = field.falseCriterion.trim();
			if (Object.keys(criteria).length > 0) question.criteria = criteria;
		}

		questions[id] = question;
	}
	return questions;
}

/** Light shape check for the raw JSON mode; the API does full validation and reports 422s. */
export function validateQuestionsJson(value: unknown): IDataObject {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new QuestionDefinitionError(
			'Questions JSON must be an object mapping question IDs to questions',
		);
	}
	const entries = Object.entries(value as IDataObject);
	if (entries.length === 0) throw new QuestionDefinitionError('Add at least one question');

	for (const [id, question] of entries) {
		const type = (question as IDataObject | null)?.type;
		if (!QUESTION_TYPES.includes(type as QuestionType)) {
			throw new QuestionDefinitionError(
				`Question "${id}" must have "type" set to one of: ${QUESTION_TYPES.join(', ')}`,
			);
		}
	}
	return value as IDataObject;
}

function mostLikelyLevel(answer: IDataObject): string | undefined {
	const legend = answer.legend as Record<string, string> | undefined;
	if (!legend) return undefined;

	const probabilities = answer.probabilities as Record<string, number> | undefined;
	if (probabilities && Object.keys(probabilities).length > 0) {
		const [best] = Object.entries(probabilities).sort(([, a], [, b]) => b - a)[0];
		return legend[best];
	}
	if (typeof answer.score === 'number') return legend[String(Math.round(answer.score))];
	return undefined;
}

/**
 * Flattens `answers` into one value per question so downstream nodes can use
 * `{{ $json.jev.department }}` instead of digging through the raw response:
 *
 * - noul:   `<id>` = probability of yes (0-1)
 * - choice: `<id>` = chosen option, `<id>_confidence`
 * - score:  `<id>` = weighted score, `<id>_level` = most likely level's description, `<id>_confidence`
 *
 * `_model` records the versioned model that answered, since aliases like `jev-latest` move.
 */
export function simplifyResponse(response: IDataObject): IDataObject {
	const answers = (response.answers ?? {}) as Record<string, IDataObject>;
	const result: IDataObject = {};

	for (const [id, answer] of Object.entries(answers)) {
		switch (answer.type) {
			case 'noul':
				result[id] = answer.noul;
				break;
			case 'choice':
				result[id] = answer.choice;
				result[`${id}_confidence`] = answer.confidence;
				break;
			case 'score':
				result[id] = answer.score;
				result[`${id}_level`] = mostLikelyLevel(answer);
				result[`${id}_confidence`] = answer.confidence;
				break;
			default:
				result[id] = answer;
		}
	}

	result._model = response.model;
	return result;
}

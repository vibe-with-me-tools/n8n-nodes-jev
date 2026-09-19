import { describe, expect, it } from 'vitest';
import {
	buildQuestionsFromFields,
	parseChoiceOptions,
	parseScoreLevels,
	QuestionDefinitionError,
	simplifyResponse,
	validateQuestionsJson,
} from '../nodes/Jev/shared/questions';
import { quickstartResponse } from './helpers.mts';

describe('parseChoiceOptions', () => {
	it('reads one option per line with optional descriptions', () => {
		expect(
			parseChoiceOptions('billing: Payments, refunds\n\ntechnical:  Bugs \nsales', 'q'),
		).toEqual({
			billing: 'Payments, refunds',
			technical: 'Bugs',
			sales: null,
		});
	});

	it('splits on the first colon only', () => {
		expect(parseChoiceOptions('a: see https://x.io\nb', 'q')).toEqual({
			a: 'see https://x.io',
			b: null,
		});
	});

	it('accepts an array or object from an expression', () => {
		expect(parseChoiceOptions(['x', ' y '], 'q')).toEqual({ x: null, y: null });
		expect(parseChoiceOptions({ x: 'desc', y: '' }, 'q')).toEqual({ x: 'desc', y: null });
	});

	it('rejects fewer than two options, duplicates, and empty names', () => {
		expect(() => parseChoiceOptions('only', 'q')).toThrow(/at least two options/);
		expect(() => parseChoiceOptions('a\na', 'q')).toThrow(/"a" twice/);
		expect(() => parseChoiceOptions('a\n: desc', 'q')).toThrow(/no name/);
	});
});

describe('parseScoreLevels', () => {
	it('keeps levels in order and skips blank lines', () => {
		expect(parseScoreLevels('Calm\n\n Angry \n', 'q')).toEqual(['Calm', 'Angry']);
		expect(parseScoreLevels(['lo', 'hi'], 'q')).toEqual(['lo', 'hi']);
	});

	it('rejects fewer than two levels', () => {
		expect(() => parseScoreLevels('one', 'q')).toThrow(/at least two levels/);
	});
});

describe('buildQuestionsFromFields', () => {
	it('builds each question type in the API format', () => {
		expect(
			buildQuestionsFromFields([
				{ id: 'team', type: 'choice', instructions: ' Which team? ', choiceOptions: 'a\nb' },
				{ id: 'mood', type: 'score', instructions: 'Mood?', scoreLevels: 'calm\nangry' },
				{
					id: 'urgent',
					type: 'noul',
					instructions: 'Urgent?',
					trueCriterion: 'Now',
					falseCriterion: ' ',
				},
				{ id: 'plain', type: 'noul', instructions: 'Plain?' },
			]),
		).toEqual({
			team: { type: 'choice', instructions: 'Which team?', criteria: { a: null, b: null } },
			mood: { type: 'score', instructions: 'Mood?', criteria: ['calm', 'angry'] },
			urgent: { type: 'noul', instructions: 'Urgent?', criteria: { true: 'Now' } },
			plain: { type: 'noul', instructions: 'Plain?' },
		});
	});

	it('defaults the type to noul', () => {
		expect(buildQuestionsFromFields([{ id: 'x', instructions: 'q' }]).x).toEqual({
			type: 'noul',
			instructions: 'q',
		});
	});

	it.each([
		[[], /at least one question/],
		[[{ id: ' ', instructions: 'q' }], /has no ID/],
		[[{ id: 'x', instructions: ' ' }], /has no instructions/],
		[
			[
				{ id: 'x', instructions: 'q' },
				{ id: 'x', instructions: 'q' },
			],
			/used twice/,
		],
	])('rejects invalid definitions (%#)', (fields, message) => {
		expect(() => buildQuestionsFromFields(fields)).toThrow(message);
		expect(() => buildQuestionsFromFields(fields)).toThrow(QuestionDefinitionError);
	});
});

describe('validateQuestionsJson', () => {
	it('passes a valid questions map through unchanged', () => {
		const questions = { a: { type: 'noul', instructions: { nested: 'structure' } } };
		expect(validateQuestionsJson(questions)).toBe(questions);
	});

	it.each([
		[null, /must be an object/],
		[[], /must be an object/],
		[{}, /at least one question/],
		[{ a: { type: 'bogus' } }, /must have "type"/],
		[{ a: null }, /must have "type"/],
	])('rejects %j', (value, message) => {
		expect(() => validateQuestionsJson(value)).toThrow(message);
	});
});

describe('simplifyResponse', () => {
	it('flattens each answer type', () => {
		expect(simplifyResponse(quickstartResponse)).toEqual({
			department: 'billing',
			department_confidence: 0.596,
			frustration: 1.035,
			frustration_level: 'Frustrated',
			frustration_confidence: 0.84,
			is_urgent: 0.999,
			_model: 'jev-1.13.0',
		});
	});

	it('picks the most probable level, falling back to the rounded score', () => {
		const legend = { 0: 'low', 1: 'mid', 2: 'high' };
		const withProbabilities = simplifyResponse({
			answers: {
				s: { type: 'score', score: 1.4, legend, probabilities: { 0: 0.1, 1: 0.2, 2: 0.7 } },
			},
		});
		const withoutProbabilities = simplifyResponse({
			answers: { s: { type: 'score', score: 1.4, legend } },
		});
		expect(withProbabilities.s_level).toBe('high');
		expect(withoutProbabilities.s_level).toBe('mid');
	});

	it('passes unknown answer types through as-is', () => {
		const answer = { type: 'future', value: 1 };
		expect(simplifyResponse({ answers: { x: answer } }).x).toEqual(answer);
	});
});

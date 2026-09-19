import { createRequire } from 'node:module';
import { defineConfig } from 'vitest/config';

const require = createRequire(import.meta.url);

export default defineConfig({
	resolve: {
		// Use n8n-workflow's CommonJS build, the one n8n loads nodes with. Its ESM build ships
		// source maps that point to unpublished files, which floods the test output.
		alias: { 'n8n-workflow': require.resolve('n8n-workflow') },
	},
	test: {
		// Tests are .mts so n8n's node linter, which enforces n8n Cloud's runtime rules on **/*.ts,
		// skips them: they run in Node with Vitest and are never shipped.
		include: ['test/**/*.test.mts'],
	},
});

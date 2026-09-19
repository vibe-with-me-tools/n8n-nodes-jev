import type { IDataObject, ILoadOptionsFunctions, INodeListSearchResult } from 'n8n-workflow';
import { jevApiRequest } from '../shared/transport';

export async function searchModels(
	this: ILoadOptionsFunctions,
	filter?: string,
): Promise<INodeListSearchResult> {
	const response = await jevApiRequest.call(this, 'GET', '/v1/models');
	const models = (response.models ?? []) as IDataObject[];
	const query = filter?.toLowerCase();

	return {
		results: models
			.map((model) => ({
				name: String(model.name),
				value: String(model.name),
				description: [model.description, model.release_date].filter(Boolean).join(' · '),
			}))
			.filter((model) => !query || model.name.toLowerCase().includes(query)),
	};
}

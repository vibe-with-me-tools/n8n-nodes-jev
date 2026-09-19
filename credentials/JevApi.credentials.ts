import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class JevApi implements ICredentialType {
	name = 'jevApi';

	displayName = 'Jev (TypeSafe) API';

	icon: Icon = { light: 'file:../icons/jev.svg', dark: 'file:../icons/jev.dark.svg' };

	documentationUrl = 'https://docs.typesafe.ai/introduction/quickstart';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description: 'Create a key at https://console.typesafe.ai/keys',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://api.typesafe.ai',
			description: 'Only change this if TypeSafe has given you a different API host',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl.replace(/\\/+$/, "")}}',
			url: '/v1/models',
			method: 'GET',
		},
	};
}

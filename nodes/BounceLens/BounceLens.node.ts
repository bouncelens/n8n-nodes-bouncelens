import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import disposableDomains from './disposable.json';
import { checkEmails, dohUrl, makeDomainCache, parseDohJson } from './engine';

const disposable = new Set<string>(disposableDomains);

// The engine is generated, untyped JavaScript; these are the two signatures the node relies on.
type DnsAnswer = { rcode: number; answers: string[] };
type DomainLookup = (domain: string) => Promise<IDataObject>;
const domainCache = makeDomainCache as unknown as (
	resolve: (name: string, type: string) => Promise<DnsAnswer>,
) => DomainLookup;
const check = checkEmails as unknown as (
	list: string[],
	options: { disposable: Set<string>; lookup: DomainLookup; concurrency: number },
) => Promise<IDataObject[]>;

export class BounceLens implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'BounceLens Email Check',
		name: 'bounceLens',
		icon: { light: 'file:bouncelens.svg', dark: 'file:bouncelens.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: 'Check email address',
		description:
			'Check email addresses for bad format, dead domains, typos like gmial.com, throwaway domains and duplicates. No API key.',
		defaults: {
			name: 'BounceLens Email Check',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		properties: [
			{
				displayName: 'Email',
				name: 'email',
				type: 'string',
				default: '={{ $json.email }}',
				required: true,
				placeholder: 'e.g. jane@example.com',
				description: 'The email address to check',
			},
			{
				displayName: 'Put Result in Field',
				name: 'outputField',
				type: 'string',
				default: 'emailCheck',
				required: true,
				description:
					'Name of the field that receives the result: status (invalid, risky or unconfirmed), reasons, flags, did_you_mean, provider and mx',
			},
			{
				displayName:
					'The check runs inside n8n. Only domain names are looked up, over DNS-over-HTTPS (Cloudflare). The mailbox itself is not checked, so the best status is "unconfirmed".',
				name: 'notice',
				type: 'notice',
				default: '',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const emails: string[] = [];
		const fields: string[] = [];

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			const field = (
				this.getNodeParameter('outputField', itemIndex, 'emailCheck') as string
			).trim();
			if (!field) {
				throw new NodeOperationError(this.getNode(), '"Put Result in Field" cannot be empty', {
					itemIndex,
				});
			}
			fields.push(field);
			// A missing value is not an error: it comes back as status "invalid", like any bad address.
			emails.push(String(this.getNodeParameter('email', itemIndex, '') ?? ''));
		}

		// One DNS lookup per unique domain, through n8n's HTTP helper.
		const lookup = domainCache(async (name, type) => {
			const body = await this.helpers.httpRequest({
				method: 'GET',
				url: dohUrl(name, type),
				headers: { accept: 'application/dns-json' },
				json: true,
			});
			return parseDohJson(typeof body === 'string' ? JSON.parse(body) : body, type) as DnsAnswer;
		});

		// Duplicates are flagged across all items of this run (Gmail dot and +tag variants included).
		const results = await check(emails, { disposable, lookup, concurrency: 6 });

		return [
			items.map((item, itemIndex) => ({
				json: { ...item.json, [fields[itemIndex]]: results[itemIndex] },
				binary: item.binary,
				pairedItem: { item: itemIndex },
			})),
		];
	}
}

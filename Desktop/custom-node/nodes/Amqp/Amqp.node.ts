import type {
	IExecuteFunctions,
	IDataObject,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	ICredentialTestFunctions,
	INodeCredentialTestResult,
	ICredentialsDecrypted,
	ICredentialDataDecryptedObject,
} from 'n8n-workflow';
import { NodeConnectionType, NodeOperationError } from 'n8n-workflow';
import type { Connection, ConnectionOptions, Dictionary, EventContext, Sender } from 'rhea';
import { create_container } from 'rhea';
import { formatPrivateKey } from '../../src/utils/utilities';

import type { AmqpCredential } from './types';

function createConnectOptions(credentials: IDataObject, extra?: Partial<ConnectionOptions>): ConnectionOptions {
	const connectOptions: ConnectionOptions = {
		host: credentials.hostname as string,
		hostname: credentials.hostname as string,
		port: credentials.port as number,
		username: credentials.username ? (credentials.username as string) : undefined,
		password: credentials.password ? (credentials.password as string) : undefined,
		transport: credentials.transportType ? (credentials.transportType as 'tcp' | 'tls') : undefined,
		...extra,
	} as unknown as ConnectionOptions;

	if (credentials.transportType === 'tls') {
		const sslOptions: any = {
			rejectUnauthorized: credentials.rejectUnauthorized ?? true,
		};
        
		if (credentials.ca && typeof credentials.ca === 'string') {
			sslOptions.ca = formatPrivateKey(credentials.ca);
		}
		
		if (credentials.cert && typeof credentials.cert === 'string') {
			sslOptions.cert = formatPrivateKey(credentials.cert);
		}
			
		if (credentials.key && typeof credentials.key === 'string') {
			sslOptions.key = formatPrivateKey(credentials.key);
		}
			
		if (credentials.passphrase) {
			sslOptions.passphrase = credentials.passphrase;
		}
		
		if (credentials.servername) {
			sslOptions.servername = credentials.servername;
		} else if (credentials.hostname) {
			sslOptions.servername = credentials.hostname;
		}
		
		(connectOptions as any).transport_options = sslOptions;
		
		if (credentials.certificateAuth) {
			delete connectOptions.username;
			delete connectOptions.password;
			(connectOptions as any).sasl_init_hostname = credentials.hostname;
			(connectOptions as any).sasl_mechanisms = ['EXTERNAL'];
		}
	}
	
	return connectOptions;
}

async function checkIfCredentialsValid(
	credentials: IDataObject,
): Promise<INodeCredentialTestResult> {
	const connectOptions = createConnectOptions(credentials, { reconnect: false });

	let conn: Connection | undefined = undefined;
	try {
		const container: any = create_container();
		await new Promise<void>((resolve, reject) => {
			container.on('connection_open', function (_context: EventContext) {
				resolve();
			});
			container.on('disconnected', function (context: EventContext) {
				reject(context.error ?? new Error('unknown error'));
			});
			conn = container.connect(connectOptions);
		});
	} catch (error) {
		return {
			status: 'Error',
			message: (error as Error).message,
		};
	} finally {
		if (conn) (conn as Connection).close();
	}

	return {
		status: 'OK',
		message: 'Connection successful!',
	};
}

export class Amqp implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'AMQP Sender Test',
		name: 'amqp',
		icon: 'file:amqp.svg',
		group: ['transform'],
		version: 1,
		description: 'Sends a raw-message via AMQP 1.0, executed once per item',
		defaults: {
			name: 'AMQP Sendertest',
		},
		usableAsTool: true,
		inputs: [NodeConnectionType.Main],
		outputs: [NodeConnectionType.Main],
		credentials: [
			{
				name: 'amqp',
				required: true,
				testedBy: 'amqpConnectionTest',
			},
		],
		properties: [
			{
				displayName: 'Queue / Topic',
				name: 'sink',
				type: 'string',
				default: '',
				placeholder: 'e.g. topic://sourcename.something',
				description: 'Name of the queue or topic to publish to',
			},
			{
				displayName: 'Headers',
				name: 'headerParametersJson',
				type: 'json',
				default: '{}',
				description:
					'Header parameters as JSON (flat object). Sent as application_properties in amqp-message meta info.',
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				options: [
					{
						displayName: 'Container ID',
						name: 'containerId',
						type: 'string',
						default: '',
						description: 'Passes container_id to the RHEA backend',
					},
					{
						displayName: 'Data as Object',
						name: 'dataAsObject',
						type: 'boolean',
						default: false,
						description: 'Whether to send the data as an object',
					},
					{
						displayName: 'Reconnect',
						name: 'reconnect',
						type: 'boolean',
						default: true,
						description: 'Whether to automatically reconnect if disconnected',
					},
					{
						displayName: 'Reconnect Limit',
						name: 'reconnectLimit',
						type: 'number',
						default: 50,
						description: 'Maximum number of reconnect attempts',
					},
					{
						displayName: 'Send Property',
						name: 'sendOnlyProperty',
						type: 'string',
						default: '',
						description: 'The only property to send. If empty the whole item will be sent.',
					},
				],
			},
		],
	};

	methods = {
		credentialTest: {
			async amqpConnectionTest(
				this: ICredentialTestFunctions,
				credential: ICredentialsDecrypted,
			): Promise<INodeCredentialTestResult> {
				const credentials = credential.data as ICredentialDataDecryptedObject;
				return await checkIfCredentialsValid(credentials);
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const container: any = create_container();
		let connection: Connection | undefined = undefined;
		let sender: Sender | undefined = undefined;

		try {
			const credentials = await this.getCredentials<AmqpCredential>('amqp');
			console.log('AMQP creds keys:', Object.keys(credentials));
			// validate credentials first
			const credentialsTestResult = await checkIfCredentialsValid(credentials);
			if (credentialsTestResult.status === 'Error') {
				throw new NodeOperationError(this.getNode(), credentialsTestResult.message, {
					description: 'Check your credentials and try again',
				});
			}

			const sink = this.getNodeParameter('sink', 0, '') as string;
			const applicationProperties = this.getNodeParameter('headerParametersJson', 0, {}) as
				| string
				| object;
			const options = this.getNodeParameter('options', 0, {});
			const containerId = options.containerId as string;
			const containerReconnect = (options.reconnect as boolean) ?? true;
			const containerReconnectLimit = (options.reconnectLimit as number) ?? 50;

			let headerProperties: Dictionary<any>;
			if (typeof applicationProperties === 'string' && applicationProperties !== '') {
				headerProperties = JSON.parse(applicationProperties);
			} else {
				headerProperties = applicationProperties as object;
			}

			if (sink === '') {
				throw new NodeOperationError(this.getNode(), 'Queue or Topic required!');
			}

			const connectOptions = createConnectOptions(credentials, {
				reconnect: containerReconnect,
				reconnect_limit: containerReconnectLimit,
				all_errors_non_fatal: true,
				container_id: containerId || undefined,
				id: containerId || undefined,
			});

			const node = this.getNode();

			const responseData: INodeExecutionData[] = await new Promise((resolve, reject) => {
				const conn = container.connect(connectOptions) as Connection;
				connection = conn;
                sender = conn.open_sender(sink);
				let limit = containerReconnectLimit;

				container.on('disconnected', function (context: EventContext) {
					if (limit <= 0) {
						connection!.options.reconnect = false;
						const error = new NodeOperationError(
							node,
							((context.error as Error) ?? {}).message ?? 'Disconnected',
							{
								description: `Check your credentials${options.reconnect ? '' : ', and consider enabling reconnect in the options'}`,
								itemIndex: 0,
							},
						);

						reject(error);
					}
					limit--;
				});

				container.once('sendable', (context: EventContext) => {
					const returnData: INodeExecutionData[] = [];

					const items = this.getInputData();
					for (let i = 0; i < items.length; i++) {
						const item = items[i];

						let body: IDataObject | string = item.json;
						const sendOnlyProperty = options.sendOnlyProperty as string;

						if (sendOnlyProperty) {
							body = body[sendOnlyProperty] as string;
						}

						if (options.dataAsObject !== true) {
							body = JSON.stringify(body);
						}

						const result = context.sender?.send({
							application_properties: headerProperties,
							body,
						});

						returnData.push({ json: { id: result?.id }, pairedItems: { item: i } });
					}

					resolve(returnData);
				});
			});

			return [responseData];
		} catch (error) {
			if (this.continueOnFail()) {
				return [[{ json: { error: error.message }, pairedItems: { item: 0 } }]];
			} else {
				throw error;
			}
		} finally {
			if (sender) (sender as Sender).close();
			if (connection) (connection as Connection).close();
		}
	}
}

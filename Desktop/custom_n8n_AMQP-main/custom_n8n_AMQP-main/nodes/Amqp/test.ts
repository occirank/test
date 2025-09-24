// Amqp.node.ts — ultra-verbose debug version
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

/** Redact helpers */
const redact = (s?: string) => (s ? '***' : undefined);
const firstLine = (pem?: string) =>
	pem ? (pem.split('\n')[0] || '').slice(0, 40) : undefined;
const trimLines = (pem?: string) =>
	pem
		? pem
				.split('\n')
				.filter((l) => l.startsWith('-----BEGIN') || l.startsWith('-----END'))
				.join(' | ')
		: undefined;

/** Log with timestamp */
const log = (...a: any[]) => console.log(new Date().toISOString(), '[AMQP]', ...a);

/** Build rhea ConnectionOptions with VERY explicit logging */
function createConnectOptions(credentials: IDataObject, extra?: Partial<ConnectionOptions>): ConnectionOptions {
	const base: any = {
		host: credentials.hostname as string,
		hostname: credentials.hostname as string,
		port: credentials.port as number,
		username: credentials.username ? (credentials.username as string) : undefined,
		password: credentials.password ? (credentials.password as string) : undefined,
		transport: (credentials.transportType as 'tcp' | 'tls') || 'tcp',
		...extra,
	};

	if (credentials.transportType === 'tls') {
		const sslOptions: Record<string, unknown> = {
			rejectUnauthorized: credentials.rejectUnauthorized ?? true,
			servername: (credentials.servername as string) || (credentials.hostname as string),
		};

		// IMPORTANT: only "format" the KEY; pass cert/ca raw
		if (credentials.ca && typeof credentials.ca === 'string') {
			sslOptions['ca'] = credentials.ca; // may contain multiple certs
		}
		if (credentials.cert && typeof credentials.cert === 'string') {
			sslOptions['cert'] = credentials.cert; // leaf + intermediates (NO "Bag Attributes")
		}
		if (credentials.key && typeof credentials.key === 'string') {
			sslOptions['key'] = formatPrivateKey(credentials.key); // normalize only the key
		}
		if (credentials.passphrase) {
			sslOptions['passphrase'] = credentials.passphrase;
		}

		(base as any).transport_options = sslOptions;

		if (credentials.certificateAuth) {
			// SASL EXTERNAL (mTLS only)
			delete base.username;
			delete base.password;
			(base as any).sasl_init_hostname = credentials.hostname;
			(base as any).sasl_mechanisms = ['EXTERNAL'];
		}
	}

	// ===== Logging (safe) =====
	log('ConnectOptions preview:', {
		host: base.host,
		hostname: base.hostname,
		port: base.port,
		transport: base.transport,
		username: base.username,
		password: redact(base.password),
		sasl_mechanisms: (base as any).sasl_mechanisms,
		sasl_init_hostname: (base as any).sasl_init_hostname,
		transport_options: base.transport_options
			? {
					rejectUnauthorized: (base.transport_options as any).rejectUnauthorized,
					servername: (base.transport_options as any).servername,
					ca_summary: trimLines((base.transport_options as any).ca as string),
					cert_first_line: firstLine((base.transport_options as any).cert as string),
					key_first_line: firstLine((base.transport_options as any).key as string),
					passphrase: redact((base.transport_options as any).passphrase as string),
			  }
			: undefined,
	});

	return base as ConnectionOptions;
}

/** Attach exhaustive event logs to a rhea container */
function attachRheaLogs(container: any, label = 'conn') {
	const showErr = (e?: any) => (e && (e.message || e.toString())) || e || 'unknown';

	container.on('connection_open', (ctx: EventContext) => log(`[${label}] connection_open`));
	container.on('connection_close', (ctx: EventContext) =>
		log(`[${label}] connection_close`, showErr(ctx?.connection?.error)),
	);
	container.on('connection_error', (ctx: EventContext) =>
		log(`[${label}] connection_error`, showErr(ctx?.connection?.error)),
	);
	container.on('protocol_error', (ctx: EventContext) =>
		log(`[${label}] protocol_error`, showErr(ctx?.connection?.error)),
	);
	container.on('disconnected', (ctx: EventContext) =>
		log(
			`[${label}] disconnected`,
			showErr((ctx as any)?.error || (ctx?.connection as any)?.error),
		),
	);
	container.on('accepted', (ctx: EventContext) => log(`[${label}] accepted`, ctx?.delivery?.id));
	container.on('rejected', (ctx: EventContext) =>
		log(`[${label}] rejected`, showErr(ctx?.delivery?.remote_state)),
	);
	container.on('released', (ctx: EventContext) =>
		log(`[${label}] released`, ctx?.delivery?.id),
	);
	container.on('modified', (ctx: EventContext) =>
		log(`[${label}] modified`, ctx?.delivery?.id),
	);
	container.on('sendable', () => log(`[${label}] sendable`));
	container.on('settled', (ctx: EventContext) => log(`[${label}] settled`, ctx?.delivery?.id));
	container.on('receiver_open', () => log(`[${label}] receiver_open`));
	container.on('sender_open', () => log(`[${label}] sender_open`));
	container.on('sender_draining', () => log(`[${label}] sender_draining`));
}

/** Active TLS probe + AMQP connect for credential test */
async function checkIfCredentialsValid(credentials: IDataObject): Promise<INodeCredentialTestResult> {
	const connectOptions = createConnectOptions(credentials, { reconnect: false });
	let conn: Connection | undefined;

	try {
		const container: any = create_container();
		attachRheaLogs(container, 'credtest');

		// watchdog so UI doesn't hang forever
		const watchdog = setTimeout(() => {
			log('[credtest] timeout waiting for connection_open (20s)');
			try {
				conn?.close();
			} catch {}
		}, 20000);

		return await new Promise<INodeCredentialTestResult>((resolve) => {
			container.on('connection_open', () => {
				clearTimeout(watchdog);
				resolve({ status: 'OK', message: 'Connection successful!' });
			});
			container.on('disconnected', (ctx: EventContext) => {
				clearTimeout(watchdog);
				const err = (ctx as any)?.error || (ctx?.connection as any)?.error;
				resolve({ status: 'Error', message: (err && err.message) || String(err) || 'disconnected' });
			});
			container.on('connection_error', (ctx: EventContext) => {
				clearTimeout(watchdog);
				resolve({
					status: 'Error',
					message: (ctx.connection?.error && ctx.connection.error.message) || 'connection_error',
				});
			});
			container.on('protocol_error', (ctx: EventContext) => {
				clearTimeout(watchdog);
				resolve({
					status: 'Error',
					message: (ctx.connection?.error && ctx.connection.error.message) || 'protocol_error',
				});
			});

			log('[credtest] connecting…');
			conn = container.connect(connectOptions);
		});
	} catch (error: any) {
		return { status: 'Error', message: error?.message || String(error) };
	} finally {
		try {
			conn?.close();
		} catch {}
	}
}

export class Amqp implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'AMQP Sender (Verbose)',
		name: 'amqp',
		icon: 'file:amqp.svg',
		group: ['transform'],
		version: 1,
		description: 'Sends a raw-message via AMQP 1.0, with very verbose logs',
		defaults: { name: 'AMQP Sender (Verbose)' },
		usableAsTool: true,
		inputs: [NodeConnectionType.Main],
		outputs: [NodeConnectionType.Main],
		credentials: [{ name: 'amqp', required: true, testedBy: 'amqpConnectionTest' }],
		properties: [
			{
				displayName: 'Queue / Topic',
				name: 'sink',
				type: 'string',
				default: '',
				placeholder: 'e.g. topic://sourcename.something',
			},
			{
				displayName: 'Headers',
				name: 'headerParametersJson',
				type: 'json',
				default: '{}',
				description: 'Flat object → application_properties',
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				default: {},
				options: [
					{ displayName: 'Container ID', name: 'containerId', type: 'string', default: '' },
					{ displayName: 'Data as Object', name: 'dataAsObject', type: 'boolean', default: false },
					{ displayName: 'Reconnect', name: 'reconnect', type: 'boolean', default: true },
					{ displayName: 'Reconnect Limit', name: 'reconnectLimit', type: 'number', default: 50 },
					{
						displayName: 'Send Property',
						name: 'sendOnlyProperty',
						type: 'string',
						default: '',
						description: 'Only send this property; otherwise send whole item',
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
		attachRheaLogs(container, 'exec');

		let connection: Connection | undefined;
		let sender: Sender | undefined;

		try {
			const credentials = await this.getCredentials<AmqpCredential>('amqp');

			// 1) Preflight credential test (returns precise error messages)
			const test = await checkIfCredentialsValid(credentials);
			log('Credential test result:', test);
			if (test.status === 'Error') {
				throw new NodeOperationError(this.getNode(), test.message, {
					description: 'TLS/AMQP preflight failed',
				});
			}

			// 2) Params
			const sink = this.getNodeParameter('sink', 0, '') as string;
			const applicationProperties = this.getNodeParameter('headerParametersJson', 0, {}) as
				| string
				| object;
			const options = this.getNodeParameter('options', 0, {});
			const containerId = (options as any).containerId as string;
			const containerReconnect = ((options as any).reconnect as boolean) ?? true;
			const containerReconnectLimit = ((options as any).reconnectLimit as number) ?? 50;
			const sendOnlyProperty = (options as any).sendOnlyProperty as string;

			if (!sink) throw new NodeOperationError(this.getNode(), 'Queue/Topic (sink) is required');

			const headerProperties: Dictionary<any> =
				typeof applicationProperties === 'string' && applicationProperties !== ''
					? JSON.parse(applicationProperties)
					: (applicationProperties as object);

			// 3) Build connect options for the sending phase
			const connectOptions = createConnectOptions(credentials, {
				reconnect: containerReconnect,
				reconnect_limit: containerReconnectLimit,
				all_errors_non_fatal: true,
				container_id: containerId || undefined,
				id: containerId || undefined,
			});

			// 4) Connect + send
			const node = this.getNode();

			const responseData: INodeExecutionData[] = await new Promise((resolve, reject) => {
				let remaining = containerReconnectLimit;

				container.on('disconnected', (ctx: EventContext) => {
					const err = (ctx as any)?.error || (ctx?.connection as any)?.error;
					log('[exec] disconnected during send', err?.message || err);
					if (remaining <= 0) {
						(connection as any).options.reconnect = false;
						reject(
							new NodeOperationError(node, err?.message || 'Disconnected', {
								description: `Check credentials${containerReconnect ? '' : ', and consider enabling reconnect'}`,
								itemIndex: 0,
							}),
						);
					}
					remaining--;
				});

				container.once('sendable', (ctx: EventContext) => {
					const items = this.getInputData();
					const out: INodeExecutionData[] = [];

					for (let i = 0; i < items.length; i++) {
						let body: IDataObject | string = items[i].json;
						if (sendOnlyProperty) body = (body as any)[sendOnlyProperty] as string;
						if ((options as any).dataAsObject !== true) body = JSON.stringify(body);

						const res = ctx.sender?.send({ application_properties: headerProperties, body });
						out.push({ json: { id: res?.id }, pairedItems: { item: i } });
						log('[exec] sent message id=', res?.id);
					}
					resolve(out);
				});

				log('[exec] connecting & opening sender:', sink);
				connection = container.connect(connectOptions);
				sender = connection.open_sender(sink);
			});

			return [responseData];
		} catch (error: any) {
			log('[exec] error:', error?.message || error);
			if (this.continueOnFail()) {
				return [[{ json: { error: error.message }, pairedItems: { item: 0 } }]];
			}
			throw error;
		} finally {
			try {
				sender?.close();
			} catch {}
			try {
				connection?.close();
			} catch {}
		}
	}
}

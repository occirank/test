import type { ICredentialType, INodeProperties } from 'n8n-workflow';

export class Amqp implements ICredentialType {
	name = 'amqp';
	displayName = 'AMQP';
	documentationUrl = 'amqp';

	properties: INodeProperties[] = [
		{
			displayName: 'Hostname',
			name: 'hostname',
			type: 'string',
			placeholder: 'e.g. localhost',
			default: '',
		},
		{
			displayName: 'Port',
			name: 'port',
			type: 'number',
			default: 5672,
		},
		{
			displayName: 'User',
			name: 'username',
			type: 'string',
			placeholder: 'e.g. guest',
			default: '',
		},
		{
			displayName: 'Password',
			name: 'password',
			type: 'string',
			typeOptions: { password: true },
			default: '',
		},
		{
			displayName: 'Transport Type',
			name: 'transportType',
			type: 'options',
			options: [
				{ name: 'TCP', value: 'tcp' },
				{ name: 'TLS/SSL', value: 'tls' },
			],
			default: 'tcp',
			description: 'Protocol to use for connection',
		},
		// Toggle to show/hide SSL options
		{
			displayName: 'Enable SSL Options',
			name: 'enableSsl',
			type: 'boolean',
			displayOptions: { show: { transportType: ['tls'] } },
			default: false,
			description: 'Enable SSL configuration fields',
		},
		// SSL fields, only shown when toggle is true
		{
			displayName: 'CA Certificate',
			name: 'ca',
			type: 'string',
			typeOptions: { password: true },
			displayOptions: { show: { enableSsl: [true], transportType: ['tls'] } },
			default: '',
			description: 'Certificate Authority certificate to validate server certificate',
		},
		{
			displayName: 'Client Certificate',
			name: 'cert',
			type: 'string',
			typeOptions: { password: true },
			displayOptions: { show: { enableSsl: [true], transportType: ['tls'] } },
			default: '',
			description: 'Client certificate for mutual TLS authentication',
		},
		{
			displayName: 'Client Private Key',
			name: 'key',
			type: 'string',
			typeOptions: { password: true },
			displayOptions: { show: { enableSsl: [true], transportType: ['tls'] } },
			default: '',
			description: 'Private key corresponding to the client certificate',
		},
		{
			displayName: 'Passphrase',
			name: 'passphrase',
			type: 'string',
			typeOptions: { password: true },
			displayOptions: { show: { enableSsl: [true], transportType: ['tls'] } },
			default: '',
			description: 'Passphrase for the private key (if encrypted)',
		},
		{
			displayName: 'Certificate-Only Authentication',
			name: 'certificateAuth',
			type: 'boolean',
			displayOptions: { show: { enableSsl: [true], transportType: ['tls'] } },
			default: false,
			description: 'Whether to use only certificate authentication (no username/password)',
		},
		{
			displayName: 'Reject Unauthorized Certificates',
			name: 'rejectUnauthorized',
			type: 'boolean',
			displayOptions: { show: { enableSsl: [true], transportType: ['tls'] } },
			default: true,
			description: 'Whether to reject connections with invalid certificates',
		},
		{
			displayName: 'Server Name (SNI)',
			name: 'servername',
			type: 'string',
			displayOptions: { show: { enableSsl: [true], transportType: ['tls'] } },
			default: '',
			description: 'Server name for SNI (Server Name Indication). Leave empty to use hostname.',
		},
	];
}

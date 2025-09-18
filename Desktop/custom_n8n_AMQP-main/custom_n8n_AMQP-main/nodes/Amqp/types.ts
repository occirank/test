export type AmqpCredential = {
    hostname: string;
    port: number;
    username?: string;
    password?: string;
    transportType?: 'tcp' | 'tls';
    ca?: string;
    cert?: string;
    key?: string;
    passphrase?: string;
    certificateAuth?: boolean;
    rejectUnauthorized?: boolean;
    servername?: string;
};
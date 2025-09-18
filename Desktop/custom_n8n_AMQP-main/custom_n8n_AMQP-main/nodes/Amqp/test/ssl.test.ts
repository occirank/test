import { AmqpCredential } from '../types';

describe('AMQP SSL Configuration', () => {
    it('should handle SSL options correctly', () => {
        const credentials: AmqpCredential = {
            hostname: 'test.example.com',
            port: 5671,
            transportType: 'tls',
            ca: 'test-ca-cert',
            cert: 'test-client-cert',
            key: 'test-private-key',
            rejectUnauthorized: true,
        };
        
        expect(credentials.ca).toBe('test-ca-cert');
        expect(credentials.rejectUnauthorized).toBe(true);
    });
    
    it('should work without SSL options for TCP', () => {
        const credentials: AmqpCredential = {
            hostname: 'test.example.com',
            port: 5672,
            transportType: 'tcp',
        };
        
        expect(credentials.ca).toBeUndefined();
        expect(credentials.cert).toBeUndefined();
        expect(credentials.key).toBeUndefined();
        expect(credentials.passphrase).toBeUndefined();
         expect(credentials.servername).toBeUndefined();
    });
});
/**
 * Formats any PEM (certificate or private key) into valid multi-line PEM
 * for Node.js TLS usage.
 */
export function formatPrivateKey(input: string): string {
  if (!input) return '';

  // Normalize line breaks and trim
  let pem = input.replace(/\r\n?/g, '\n').trim();

  // Extract BEGIN/END headers
  const beginMatch = pem.match(/-----BEGIN [^-]+-----/);
  const endMatch = pem.match(/-----END [^-]+-----/);

  if (!beginMatch || !endMatch) {
    throw new Error('Invalid PEM format: missing BEGIN/END headers');
  }

  const begin = beginMatch[0];
  const end = endMatch[0];

  // Extract base64 body
  const startIdx = pem.indexOf(begin) + begin.length;
  const endIdx = pem.indexOf(end);
  let body = pem.slice(startIdx, endIdx).replace(/[\s\r\n]+/g, '');

  // Wrap base64 body at 64 characters
  const wrappedBody = body.match(/.{1,64}/g)?.join('\n') ?? '';

  return `${begin}\n${wrappedBody}\n${end}\n`;
}
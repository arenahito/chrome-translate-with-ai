import { Vault } from './vault.js';

const vault = new Vault();
try {
  if (await vault.load() === null) {
    await vault.save({
      hostId: `urn:uuid:${crypto.randomUUID()}`, generation: 1,
      registration: { clientId: 'synthetic-issued-client', subject: 'synthetic-user',
        email: 'synthetic@example.invalid' },
      tokens: { accessToken: 'synthetic-access-token', refreshToken: 'synthetic-refresh-token',
        idToken: 'synthetic-id-token', scopes: ['chatgpt.tokens.use.direct'],
        expiresAt: Date.now() + 3600000 },
      pending: null,
    });
  }
} catch {
  // Corrupt credentials must reach the production recovery flow unchanged.
}

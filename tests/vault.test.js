import test from 'node:test';
import assert from 'node:assert/strict';
import { encryptRecord, decryptRecord } from '../src/vault.js';

test('vault encryption is authenticated, randomized, and nonextractable', async () => {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 },
    false, ['encrypt', 'decrypt']);
  const value = { refreshToken: 'private-token', generation: 3 };
  const first = await encryptRecord(key, value);
  const second = await encryptRecord(key, value);
  assert.notDeepEqual(first.iv, second.iv);
  assert.deepEqual(await decryptRecord(key, first), value);
  assert.equal(new TextDecoder().decode(first.ciphertext).includes('private-token'), false);
  await assert.rejects(crypto.subtle.exportKey('raw', key));
  first.iv[0] ^= 1;
  await assert.rejects(decryptRecord(key, first));
});

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export async function encryptRecord(key, value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode('vault-v1') },
    key, encoder.encode(JSON.stringify(value)),
  );
  return { iv, ciphertext };
}

export async function decryptRecord(key, record) {
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: record.iv,
      additionalData: encoder.encode('vault-v1') }, key, record.ciphertext,
  );
  return JSON.parse(decoder.decode(plaintext));
}

const request = operation => new Promise((resolve, reject) => {
  operation.onsuccess = () => resolve(operation.result);
  operation.onerror = () => reject(operation.error);
});

export class Vault {
  constructor(indexedDB = globalThis.indexedDB) {
    this.indexedDB = indexedDB;
    this.ready = null;
  }

  async open() {
    if (!this.ready) this.ready = this.initialize();
    return this.ready;
  }

  async initialize() {
    const opening = this.indexedDB.open('chatgpt-translate-vault', 1);
    opening.onupgradeneeded = () => opening.result.createObjectStore('vault');
    const db = await request(opening);
    const generated = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
    );
    const transaction = db.transaction('vault', 'readwrite');
    const store = transaction.objectStore('vault');
    const [key, marker, record] = await Promise.all([
      request(store.get('key')), request(store.get('initialized')),
      request(store.get('state')),
    ]);
    if (!key && (marker || record)) {
      throw Object.assign(new Error('保存済み接続情報の暗号鍵がありません。'),
        { code: 'VAULT_KEY_MISSING' });
    }
    if (key && (!(key instanceof CryptoKey) || key.type !== 'secret' ||
      key.algorithm.name !== 'AES-GCM' || key.extractable ||
      !key.usages.includes('encrypt') || !key.usages.includes('decrypt'))) {
      throw Object.assign(new Error('保存済み接続情報の暗号鍵が不正です。'),
        { code: 'VAULT_CORRUPT' });
    }
    if (!key) {
      store.put(generated, 'key');
      store.put(true, 'initialized');
    }
    await new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    return { db, key: key || generated };
  }

  async load() {
    const { db, key } = await this.open();
    const record = await request(db.transaction('vault').objectStore('vault')
      .get('state'));
    if (!record) return null;
    try {
      const value = await decryptRecord(key, record);
      if (value === null) throw new Error();
      return value;
    } catch {
      throw Object.assign(new Error('保存済み接続情報を復号できません。'),
        { code: 'VAULT_CORRUPT' });
    }
  }

  async reset(value) {
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 },
      false, ['encrypt', 'decrypt']);
    const record = await encryptRecord(key, value);
    const opening = this.indexedDB.open('chatgpt-translate-vault', 1);
    opening.onupgradeneeded = () => opening.result.createObjectStore('vault');
    const db = await request(opening);
    await new Promise((resolve, reject) => {
      const transaction = db.transaction('vault', 'readwrite');
      const store = transaction.objectStore('vault');
      store.clear();
      store.put(key, 'key');
      store.put(true, 'initialized');
      store.put(record, 'state');
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    this.ready = Promise.resolve({ db, key });
  }

  async save(value) {
    const { db, key } = await this.open();
    const record = await encryptRecord(key, value);
    await new Promise((resolve, reject) => {
      const transaction = db.transaction('vault', 'readwrite');
      transaction.objectStore('vault').put(record, 'state');
      transaction.oncomplete = resolve;
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }
}

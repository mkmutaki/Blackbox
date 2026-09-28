// Client-side AES-256-GCM encrypt/decrypt used by VideoRecorder (encrypt
// before upload) and VideoPlayer (decrypt for playback). Extracted to its
// own module so both call sites share one implementation and it can be
// exercised directly in tests.

export const generateEncryptionKey = async (): Promise<CryptoKey> => {
  return await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
};

export const exportKey = async (key: CryptoKey): Promise<JsonWebKey> => {
  return await crypto.subtle.exportKey('jwk', key);
};

const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');

const hexToBytes = (hex: string): Uint8Array => {
  const pairs = hex.match(/.{1,2}/g) || [];
  return new Uint8Array(pairs.map((byte) => parseInt(byte, 16)));
};

export const encryptVideo = async (blob: Blob) => {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await generateEncryptionKey();
  const exportedKey = await exportKey(key);
  const arrayBuffer = await blob.arrayBuffer();
  const encryptedData = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    arrayBuffer
  );
  const encryptedBlob = new Blob([encryptedData], { type: 'application/octet-stream' });

  return {
    encryptedBlob,
    iv: bytesToHex(iv),
    jwk: exportedKey,
  };
};

export const decryptVideo = async (
  encryptedData: ArrayBuffer,
  iv: string,
  jwk: JsonWebKey | string
): Promise<ArrayBuffer> => {
  const keyData: JsonWebKey = typeof jwk === 'string' ? JSON.parse(jwk) : jwk;
  const ivArray = hexToBytes(iv);

  const key = await crypto.subtle.importKey(
    'jwk',
    keyData,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );

  return await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivArray },
    key,
    encryptedData
  );
};

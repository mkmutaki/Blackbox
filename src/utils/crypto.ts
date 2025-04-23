
/**
 * Utility functions for encryption and decryption of video content
 */

/**
 * Generate an AES-GCM 256-bit key for encryption/decryption
 */
export const generateKey = async (): Promise<CryptoKey> => {
  return await window.crypto.subtle.generateKey(
    {
      name: "AES-GCM",
      length: 256
    },
    true, // extractable
    ["encrypt", "decrypt"]
  );
};

/**
 * Export a CryptoKey to JWK (JSON Web Key) format
 */
export const exportJwk = async (key: CryptoKey): Promise<string> => {
  const jwk = await window.crypto.subtle.exportKey("jwk", key);
  return JSON.stringify(jwk);
};

/**
 * Import a JWK (JSON Web Key) to a CryptoKey
 */
export const importKey = async (jwkString: string): Promise<CryptoKey> => {
  const jwk = JSON.parse(jwkString);
  return await window.crypto.subtle.importKey(
    "jwk",
    jwk,
    {
      name: "AES-GCM",
      length: 256
    },
    false, // extractable
    ["encrypt", "decrypt"]
  );
};

/**
 * Encrypt a Blob with a given CryptoKey
 */
export const encryptBlob = async (
  blob: Blob,
  key: CryptoKey
): Promise<{ encryptedBlob: Blob; iv: number[] }> => {
  // Generate a random IV
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  
  // Convert Blob to ArrayBuffer
  const arrayBuffer = await blob.arrayBuffer();
  
  // Encrypt the data
  const encryptedData = await window.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv
    },
    key,
    arrayBuffer
  );
  
  // Create a new Blob from encrypted data
  const encryptedBlob = new Blob([encryptedData], { type: 'application/octet-stream' });
  
  // Convert iv to array for storage
  const ivArray = Array.from(iv);
  
  return { encryptedBlob, iv: ivArray };
};

/**
 * Decrypt an ArrayBuffer with a given CryptoKey and IV
 */
export const decryptArrayBuffer = async (
  data: ArrayBuffer,
  key: CryptoKey,
  iv: Uint8Array
): Promise<Blob> => {
  // Decrypt the data
  const decryptedData = await window.crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv
    },
    key,
    data
  );
  
  // Return as Blob
  return new Blob([decryptedData], { type: 'video/webm' });
};

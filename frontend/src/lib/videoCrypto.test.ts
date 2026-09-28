// @vitest-environment node
//
// Node's environment runs this file in the same realm as node:crypto's
// webcrypto, so Blob/ArrayBuffer instances match what SubtleCrypto expects.
// jsdom runs tests in a separate vm context, and cross-realm ArrayBuffers
// fail SubtleCrypto's instanceof checks even after polyfilling `crypto`.
import { describe, it, expect } from 'vitest';
import { encryptVideo, decryptVideo } from './videoCrypto';

describe('videoCrypto', () => {
  it('round-trips a payload through encrypt then decrypt', async () => {
    const original = new TextEncoder().encode('mission log contents');
    const blob = new Blob([original], { type: 'application/octet-stream' });

    const { encryptedBlob, iv, jwk } = await encryptVideo(blob);

    expect(iv).toMatch(/^[0-9a-f]{24}$/); // 12-byte IV, hex-encoded
    expect(encryptedBlob.type).toBe('application/octet-stream');

    const encryptedBuffer = await encryptedBlob.arrayBuffer();
    const decryptedBuffer = await decryptVideo(encryptedBuffer, iv, jwk);

    expect(new Uint8Array(decryptedBuffer)).toEqual(original);
  });

  it('also round-trips when the jwk is passed as a JSON string, like the server returns it', async () => {
    const original = new Uint8Array([9, 8, 7, 6, 5]);
    const blob = new Blob([original]);

    const { encryptedBlob, iv, jwk } = await encryptVideo(blob);
    const encryptedBuffer = await encryptedBlob.arrayBuffer();

    const decryptedBuffer = await decryptVideo(encryptedBuffer, iv, JSON.stringify(jwk));

    expect(new Uint8Array(decryptedBuffer)).toEqual(original);
  });

  it('generates a fresh key and IV on every call, never reusing either', async () => {
    const blob = new Blob([new Uint8Array([1, 2, 3])]);

    const a = await encryptVideo(blob);
    const b = await encryptVideo(blob);

    expect(a.iv).not.toBe(b.iv);
    expect(a.jwk.k).not.toBe(b.jwk.k);
  });

  it('fails to decrypt with a key from a different recording', async () => {
    const blob = new Blob([new TextEncoder().encode('secret')]);
    const { encryptedBlob, iv } = await encryptVideo(blob);
    const unrelated = await encryptVideo(blob);

    const buffer = await encryptedBlob.arrayBuffer();

    await expect(decryptVideo(buffer, iv, unrelated.jwk)).rejects.toThrow();
  });
});

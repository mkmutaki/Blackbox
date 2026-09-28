import '@testing-library/jest-dom/vitest';
import { webcrypto } from 'node:crypto';

// jsdom's Crypto implementation has getRandomValues but not SubtleCrypto.
// Swap in Node's webcrypto (same interface the browser exposes) so
// AES-GCM encrypt/decrypt code under test runs against the real API.
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    configurable: true,
  });
}

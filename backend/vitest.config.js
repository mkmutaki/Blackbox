const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup.js'],
    hookTimeout: 60000,
    testTimeout: 20000,
    fileParallelism: false,
  },
});

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'server',
          environment: 'node',
          include: ['apps/server/test/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'integration',
          environment: 'node',
          include: ['apps/server/test-integration/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'web',
          environment: 'node',
          include: ['apps/web/src/**/*.test.ts'],
        },
      },
    ],
  },
});

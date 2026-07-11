import { describe, expect, it } from 'vitest';
import type { AiChatRequest } from '@fluentdb/shared';
import { buildSystemPrompt } from '../src/ai/prompts.js';

function req(partial: Partial<AiChatRequest>): AiChatRequest {
  return {
    mode: 'chat',
    messages: [{ role: 'user', content: 'x' }],
    ...partial,
  } as AiChatRequest;
}

describe('buildSystemPrompt', () => {
  it('includes the index-advisor instruction and plan summary for index_advice', () => {
    const prompt = buildSystemPrompt(
      req({
        mode: 'index_advice',
        context: {
          currentSql: 'SELECT * FROM albums WHERE year > 2000',
          planSummary: 'Sequential scans:\n- table albums, filter year > 2000',
        },
      }),
      '- albums (id INTEGER PK, year INTEGER)',
      'SQLite',
    );
    expect(prompt.toLowerCase()).toContain('index advisor');
    expect(prompt).toContain('CREATE INDEX');
    expect(prompt).toContain('Execution plan summary:');
    expect(prompt).toContain('table albums, filter year > 2000');
    // schema is included as context
    expect(prompt).toContain('albums (id INTEGER PK');
  });

  it('omits the plan summary section when absent', () => {
    const prompt = buildSystemPrompt(req({ mode: 'chat' }), null, null);
    expect(prompt).not.toContain('Execution plan summary:');
  });
});

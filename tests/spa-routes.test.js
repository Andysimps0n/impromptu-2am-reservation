import { describe, expect, it } from 'vitest';
import { api } from './helpers.js';

// 화면 경로는 react-router가 그리므로 Worker는 같은 index.html을 돌려줘야 한다.
describe('화면 경로', () => {
  it('react-router 경로는 모두 index.html을 돌려준다', async () => {
    for (const path of ['/', '/booking', '/booking/seats', '/booking/guide', '/booking/lookup', '/admin', '/admin/events/EVT-1', '/ticket']) {
      const result = await api(path);
      expect(result.status, path).toBe(200);
      expect(result.headers.get('content-type'), path).toContain('text/html');
    }
  });

  it('모르는 경로는 404로 남긴다', async () => {
    for (const path of ['/nope', '/booking/other', '/admin/events/a/b']) {
      expect((await api(path)).status, path).toBe(404);
    }
  });
});

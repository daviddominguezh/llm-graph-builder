import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

describe('fly.toml replay_cache', () => {
  it('pins /internal/mcp/ by the x-mcp-poolkey header for 60s', () => {
    const path = fileURLToPath(new URL('../../../../../../fly.toml', import.meta.url));
    const toml = readFileSync(path, 'utf8');
    expect(toml).toContain('replay_cache');
    expect(toml).toContain('path_prefix = "/internal/mcp/"');
    expect(toml).toContain('name = "x-mcp-poolkey"');
    expect(toml).toContain('ttl_seconds = 60');
    expect(toml).toContain('type = "header"');
  });
});

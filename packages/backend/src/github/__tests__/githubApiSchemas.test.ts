import { describe, expect, it } from '@jest/globals';

import {
  parseAccessTokenResponse,
  parseInstallationResponse,
  parseRepoListResponse,
} from '../githubApiSchemas.js';

const INSTALLATION_ID = 12345;
const ACCOUNT_ID = 1;
const APP_ID = 99;
const REPO_COUNT = 2;
const REPO_A_ID = 1;
const REPO_B_ID = 2;
const FIRST_REPO_INDEX = 0;

describe('parseInstallationResponse', () => {
  it('parses a valid installation response', () => {
    const data = {
      id: INSTALLATION_ID,
      account: { login: 'test-org', id: ACCOUNT_ID, type: 'Organization' },
      app_id: APP_ID,
      target_type: 'Organization',
      permissions: { contents: 'read' },
      events: ['push'],
      suspended_at: null,
    };

    const result = parseInstallationResponse(data);
    expect(result.id).toBe(INSTALLATION_ID);
    expect(result.account.login).toBe('test-org');
    expect(result.account.type).toBe('Organization');
  });

  it('rejects invalid data', () => {
    expect(() => parseInstallationResponse({ id: 'not-a-number' })).toThrow();
  });
});

describe('parseAccessTokenResponse', () => {
  it('parses a valid access token response', () => {
    const data = {
      token: 'ghs_abc123',
      expires_at: '2026-03-30T12:00:00Z',
      permissions: { contents: 'read' },
    };

    const result = parseAccessTokenResponse(data);
    expect(result.token).toBe('ghs_abc123');
    expect(result.expires_at).toBe('2026-03-30T12:00:00Z');
  });

  it('rejects when token is missing', () => {
    expect(() => parseAccessTokenResponse({ expires_at: '2026-03-30T12:00:00Z' })).toThrow();
  });
});

describe('parseRepoListResponse', () => {
  it('parses a valid repo list response', () => {
    const data = {
      total_count: REPO_COUNT,
      repositories: [
        { id: REPO_A_ID, full_name: 'org/repo-a', private: false },
        { id: REPO_B_ID, full_name: 'org/repo-b', private: true },
      ],
    };

    const result = parseRepoListResponse(data);
    expect(result.total_count).toBe(REPO_COUNT);
    expect(result.repositories).toHaveLength(REPO_COUNT);
    expect(result.repositories[FIRST_REPO_INDEX]?.full_name).toBe('org/repo-a');
  });

  it('rejects when repositories is not an array', () => {
    expect(() => parseRepoListResponse({ total_count: FIRST_REPO_INDEX, repositories: 'bad' })).toThrow();
  });
});

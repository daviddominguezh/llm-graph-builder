import { describe, expect, it } from '@jest/globals';

import { extractChildConfig } from './executeCoreInlineDispatch.js';

describe('extractChildConfig skills', () => {
  it('preserves skills array into the override', () => {
    const skills = [{ name: 'y', description: 'd', content: 'c' }];
    expect(extractChildConfig({ systemPrompt: 's', skills }).skills).toEqual(skills);
  });

  it('non-array skills → []', () => {
    expect(extractChildConfig({ systemPrompt: 's' }).skills).toEqual([]);
  });
});

import { describe, expect, it } from '@jest/globals';

import { buildConfigFromGraphData } from './simulateChildResolver.js';

const FIRST_SORT_ORDER = 0;

describe('buildConfigFromGraphData skills', () => {
  it("sources the child's own skills from its graph_data", () => {
    const cfg = buildConfigFromGraphData(
      {
        systemPrompt: 's',
        skills: [{ name: 'y', description: 'd', content: 'c', repoUrl: null, sortOrder: FIRST_SORT_ORDER }],
      },
      {}
    );
    expect(cfg.skills).toEqual([{ name: 'y', description: 'd', content: 'c' }]);
  });

  it('no skills → []', () => {
    expect(buildConfigFromGraphData({ systemPrompt: 's' }, {}).skills).toEqual([]);
  });
});

import { describe, expect, it } from '@jest/globals';

import { WEB_DESCRIPTORS } from './descriptors.js';

describe('WEB_DESCRIPTORS', () => {
  it('declares exactly the four tools by name', () => {
    expect(WEB_DESCRIPTORS.map((d) => d.toolName)).toEqual(['search', 'extract', 'crawl', 'map']);
  });

  it('marks the required field per tool', () => {
    const byName = new Map(WEB_DESCRIPTORS.map((d) => [d.toolName, d]));
    expect(byName.get('search')?.inputSchema.required).toEqual(['query']);
    expect(byName.get('extract')?.inputSchema.required).toEqual(['urls']);
    expect(byName.get('crawl')?.inputSchema.required).toEqual(['url']);
    expect(byName.get('map')?.inputSchema.required).toEqual(['url']);
  });

  it('exposes the search parameter surface', () => {
    const search = WEB_DESCRIPTORS.find((d) => d.toolName === 'search');
    const props = Object.keys(search?.inputSchema.properties ?? {});
    expect(props).toContain('query');
    expect(props).toContain('search_depth');
    expect(props).toContain('exact_match');
    expect(props).not.toContain('include_usage');
  });
});

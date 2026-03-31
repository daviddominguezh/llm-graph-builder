import { describe, expect, it } from '@jest/globals';

import { findSymbolsInContent } from '../symbolPatterns.js';

const ONE_MATCH = 1;
const TWO_MATCHES = 2;
const ZERO_MATCHES = 0;
const FIRST_MATCH = 0;
const FIRST_LINE = 1;

function describeJsTsPatterns(): void {
  it('finds function declarations', () => {
    const content = 'export async function authenticateUser(email: string): Promise<User> {';
    const matches = findSymbolsInContent(content, 'typescript', 'auth', 'function');
    expect(matches).toHaveLength(ONE_MATCH);
    expect(matches[FIRST_MATCH]?.kind).toBe('function');
    expect(matches[FIRST_MATCH]?.line).toBe(FIRST_LINE);
  });

  it('finds arrow functions', () => {
    const content = 'export const handleLogin = async (req: Request) => {';
    const matches = findSymbolsInContent(content, 'typescript', 'handle', 'function');
    expect(matches).toHaveLength(ONE_MATCH);
  });

  it('finds classes', () => {
    const content = 'export class UserService {';
    const matches = findSymbolsInContent(content, 'typescript', 'User', 'class');
    expect(matches).toHaveLength(ONE_MATCH);
    expect(matches[FIRST_MATCH]?.kind).toBe('class');
  });

  it('finds interfaces', () => {
    const content = 'export interface AuthConfig {';
    const matches = findSymbolsInContent(content, 'typescript', 'Auth', 'interface');
    expect(matches).toHaveLength(ONE_MATCH);
  });
}

function describePythonPatterns(): void {
  it('finds async def functions', () => {
    const content = 'async def process_request(self, data):';
    const matches = findSymbolsInContent(content, 'python', 'process', 'function');
    expect(matches).toHaveLength(ONE_MATCH);
  });
}

function describeGoPatterns(): void {
  it('finds method receiver functions', () => {
    const content = 'func (s *Server) HandleRequest(w http.ResponseWriter, r *http.Request) {';
    const matches = findSymbolsInContent(content, 'go', 'Handle', 'function');
    expect(matches).toHaveLength(ONE_MATCH);
  });
}

function describeEdgeCases(): void {
  it('returns empty for unsupported languages', () => {
    const matches = findSymbolsInContent('fn main() {}', 'rust', 'main', 'function');
    expect(matches).toHaveLength(ZERO_MATCHES);
  });

  it('prefix matches symbol names', () => {
    const content = 'function authenticate() {}\nfunction authorize() {}';
    const matches = findSymbolsInContent(content, 'typescript', 'auth', 'any');
    expect(matches).toHaveLength(TWO_MATCHES);
  });

  it('filters by kind when not "any"', () => {
    const content = 'class Auth {}\nfunction authHelper() {}';
    const matches = findSymbolsInContent(content, 'typescript', 'Auth', 'class');
    expect(matches).toHaveLength(ONE_MATCH);
    expect(matches[FIRST_MATCH]?.kind).toBe('class');
  });
}

describe('findSymbolsInContent', () => {
  describe('JS/TS patterns', describeJsTsPatterns);
  describe('Python patterns', describePythonPatterns);
  describe('Go patterns', describeGoPatterns);
  describe('edge cases', describeEdgeCases);
});

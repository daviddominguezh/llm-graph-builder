// GitHubSourceProvider — implements SourceProvider using GitHub API
import type { RateLimitInfo, SourceProvider, TreeEntry } from '../types.js';
import { fetchGitHubBlob } from './githubBlob.js';
import { fetchGitHubTree } from './githubTree.js';
import type { GitHubSourceConfig } from './githubTypes.js';

const EPOCH_ZERO = 0;
const INITIAL_RESET = new Date(EPOCH_ZERO);

export class GitHubSourceProvider implements SourceProvider {
  readonly commitSha: string;
  rateLimit: RateLimitInfo;

  private readonly config: GitHubSourceConfig;
  private pathToSha: Map<string, string> | null = null;

  constructor(config: GitHubSourceConfig) {
    this.config = config;
    const { commitSha } = config;
    this.commitSha = commitSha;
    this.rateLimit = {
      remaining: Infinity,
      resetAt: INITIAL_RESET,
      limit: Infinity,
    };
  }

  async fetchTree(): Promise<TreeEntry[]> {
    const { entries, pathToSha } = await fetchGitHubTree(this.config, this.rateLimit);
    this.pathToSha = pathToSha;
    return entries;
  }

  async fetchFileContent(path: string): Promise<Uint8Array> {
    return await fetchGitHubBlob(this.config, this.rateLimit, this.pathToSha, path);
  }
}

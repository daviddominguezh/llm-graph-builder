const REPO = 'daviddominguezh/llm-graph-builder';

interface GitHubRepo {
  stargazers_count: number;
}

export async function fetchGitHubStars(): Promise<number | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}`, {
      next: { revalidate: 3600 },
    });

    if (!res.ok) return null;

    const data: GitHubRepo = await res.json();
    return data.stargazers_count;
  } catch {
    return null;
  }
}

export function formatStarCount(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}k`;
  }
  return String(count);
}

type SkillList = Record<string, string>;

interface JsDelivrFile {
  type: 'file';
  name: string;
}

interface JsDelivrDirectory {
  type: 'directory';
  name: string;
  files: JsDelivrEntry[];
}

type JsDelivrEntry = JsDelivrFile | JsDelivrDirectory;

interface JsDelivrPackage {
  files: JsDelivrEntry[];
}

function parseGitHubUrl(url: string): { owner: string; repo: string } | null {
  const match = /github\.com\/([^/]+)\/([^/]+)/.exec(url);
  if (!match) return null;
  const owner = match[1];
  const repoRaw = match[2];
  if (owner === undefined || repoRaw === undefined) return null;
  return { owner, repo: repoRaw.replace(/\.git$/, '') };
}

function parseFrontmatter(content: string): Record<string, string> {
  const fmMatch = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
  if (fmMatch?.[1] === undefined) return {};
  const result: Record<string, string> = {};
  for (const line of fmMatch[1].split('\n')) {
    const kv = /^(\w+)\s*:\s*(.+)$/.exec(line);
    if (kv?.[1] !== undefined && kv[2] !== undefined) {
      result[kv[1]] = kv[2].replace(/^['"]|['"]$/g, '');
    }
  }
  return result;
}

function findSkillPaths(entries: JsDelivrEntry[], prefix = ''): string[] {
  const paths: string[] = [];
  for (const entry of entries) {
    const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.type === 'file' && entry.name === 'SKILL.md') {
      paths.push(fullPath);
    } else if (entry.type === 'directory') {
      paths.push(...findSkillPaths(entry.files, fullPath));
    }
  }
  return paths;
}

async function fetchTree(slug: string): Promise<{ tree: JsDelivrPackage; branch: string } | null> {
  for (const branch of ['main', 'master']) {
    const res = await fetch(`https://data.jsdelivr.com/v1/packages/gh/${slug}@${branch}`);
    if (res.ok) {
      const tree = (await res.json()) as JsDelivrPackage;
      return { tree, branch };
    }
  }
  return null;
}

export async function getSkills(url: string): Promise<SkillList | null> {
  const parsed = parseGitHubUrl(url);
  if (!parsed) return null;

  const slug = `${parsed.owner}/${parsed.repo}`;
  const result = await fetchTree(slug);
  if (!result) return null;

  const { tree, branch } = result;
  const skillPaths = findSkillPaths(tree.files);
  if (skillPaths.length === 0) return null;

  const skills: SkillList = {};
  await Promise.all(
    skillPaths.map(async (path) => {
      const res = await fetch(`https://cdn.jsdelivr.net/gh/${slug}@${branch}/${path}`);
      if (!res.ok) return;
      const content = await res.text();
      const fm = parseFrontmatter(content);
      if (fm.name) {
        skills[fm.name] = content;
      }
    })
  );

  return Object.keys(skills).length > 0 ? skills : null;
}

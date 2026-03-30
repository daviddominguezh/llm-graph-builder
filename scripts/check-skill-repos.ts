/**
 * Checks all hardcoded skill repos to verify we can fetch skills from each.
 * Run: npx tsx scripts/check-skill-repos.ts
 */

const SKILLS_REPOS = [
  'vercel-labs/skills', 'vercel-labs/agent-skills', 'anthropics/skills',
  'remotion-dev/skills', 'microsoft/github-copilot-for-azure', 'vercel-labs/agent-browser',
  'microsoft/azure-skills', 'inferen-sh/skills', 'nextlevelbuilder/ui-ux-pro-max-skill',
  'obra/superpowers', 'coreyhaines31/marketingskills',
  'supabase/agent-skills', 'vercel-labs/next-skills',
  'roin-orca/skills', 'squirrelscan/skills', 'pbakaus/impeccable',
  'sleekdotdesign/agent-skills', 'better-auth/skills', 'xixu-me/skills',
  'google-labs-code/stitch-skills', 'wshobson/agents', 'expo/skills',
  'firecrawl/cli', 'charon-fan/agent-playbook', 'github/awesome-copilot',
  'anthropics/claude-code', 'resciencelab/opc-skills',
  'currents-dev/playwright-best-practices-skill', 'pexoai/pexo-skills',
  'jimliu/baoyu-skills', 'larksuite/cli', 'neondatabase/agent-skills',
  'aaron-he-zhu/seo-geo-claude-skills',
  'hyf0/vue-skills', 'antfu/skills',
  'googleworkspace/cli', 'giuseppe-trisciuoglio/developer-kit',
  'microsoft/playwright-cli', 'avdlee/swiftui-agent-skill',
  'useai-pro/openclaw-skills-security', 'mattpocock/skills',
];

// -- jsdelivr types --

interface JsDelivrFile { type: 'file'; name: string; }
interface JsDelivrDirectory { type: 'directory'; name: string; files: JsDelivrEntry[]; }
type JsDelivrEntry = JsDelivrFile | JsDelivrDirectory;
interface JsDelivrPackage { files: JsDelivrEntry[]; }

function findSkillPaths(entries: JsDelivrEntry[], prefix = ''): string[] {
  const paths: string[] = [];
  for (const entry of entries) {
    const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.type === 'file' && entry.name === 'SKILL.md') {
      paths.push(fullPath);
    } else if (entry.type === 'directory') {
      paths.push(...findSkillPaths((entry as JsDelivrDirectory).files, fullPath));
    }
  }
  return paths;
}

function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match || !match[1]) return {};
  const result: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^(\w+)\s*:\s*(.+)$/);
    if (kv && kv[1] && kv[2]) result[kv[1]] = kv[2].replace(/^['"]|['"]$/g, '');
  }
  return result;
}

async function checkRepo(slug: string): Promise<{ skills: number; names: string[]; branch: string } | null> {
  for (const branch of ['main', 'master']) {
    const res = await fetch(`https://data.jsdelivr.com/v1/packages/gh/${slug}@${branch}`);
    if (!res.ok) continue;

    const tree = (await res.json()) as JsDelivrPackage;
    const skillPaths = findSkillPaths(tree.files);
    if (skillPaths.length === 0) return null;

    const names: string[] = [];
    await Promise.all(
      skillPaths.map(async (path) => {
        const fileRes = await fetch(`https://cdn.jsdelivr.net/gh/${slug}@${branch}/${path}`);
        if (!fileRes.ok) return;
        const content = await fileRes.text();
        const fm = parseFrontmatter(content);
        if (fm.name) names.push(fm.name);
      })
    );

    return { skills: names.length, names, branch };
  }
  return null;
}

async function main() {
  console.log(`Checking ${SKILLS_REPOS.length} repositories...\n`);

  const results: Array<{ slug: string; status: string; skills: number; names: string[] }> = [];
  let passed = 0;
  let failed = 0;

  for (const slug of SKILLS_REPOS) {
    process.stdout.write(`  ${slug} ... `);
    try {
      const result = await checkRepo(slug);
      if (result && result.skills > 0) {
        console.log(`\x1b[32m✓\x1b[0m ${result.skills} skill(s) [${result.branch}]`);
        results.push({ slug, status: 'ok', skills: result.skills, names: result.names });
        passed++;
      } else {
        console.log(`\x1b[33m⚠\x1b[0m no skills found`);
        results.push({ slug, status: 'no-skills', skills: 0, names: [] });
        failed++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`\x1b[31m✗\x1b[0m error: ${msg}`);
      results.push({ slug, status: 'error', skills: 0, names: [] });
      failed++;
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Results: ${passed} passed, ${failed} failed/empty, ${SKILLS_REPOS.length} total\n`);

  if (failed > 0) {
    console.log('Failed/empty repos:');
    for (const r of results) {
      if (r.status !== 'ok') {
        console.log(`  \x1b[31m✗\x1b[0m ${r.slug} (${r.status})`);
      }
    }
    console.log('');
  }

  console.log('Working repos with skill counts:');
  for (const r of results) {
    if (r.status === 'ok') {
      console.log(`  \x1b[32m✓\x1b[0m ${r.slug}: ${r.names.join(', ')}`);
    }
  }
}

main().catch(console.error);

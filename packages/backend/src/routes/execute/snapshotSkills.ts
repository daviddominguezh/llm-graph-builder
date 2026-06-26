import type { SkillDefinition } from '@daviddh/llm-graph-runner';
import { z } from 'zod';

const SkillSnapshotSchema = z.object({
  name: z.string(),
  description: z.string(),
  content: z.string(),
});

/** Validates skill rows from a published snapshot, dropping malformed entries
 *  and stripping non-runtime fields (repoUrl, sortOrder). */
export function parseSnapshotSkills(raw: unknown): SkillDefinition[] {
  if (!Array.isArray(raw)) return [];
  const skills: SkillDefinition[] = [];
  for (const entry of raw) {
    const parsed = SkillSnapshotSchema.safeParse(entry);
    if (parsed.success) skills.push(parsed.data);
  }
  return skills;
}

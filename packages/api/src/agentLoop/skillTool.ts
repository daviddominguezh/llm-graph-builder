import type { Tool } from 'ai';
import { zodSchema } from 'ai';
import { z } from 'zod';

import type { SkillDefinition } from './agentLoopTypes.js';

const TOOL_NAME = 'get_skill_content';

const SkillNameSchema = z.object({
  skillName: z.string().describe('The exact name of the skill to retrieve'),
});

/**
 * Builds the `get_skill_content` tool that lets the agent retrieve
 * the full content of a skill by name.
 */
export function buildSkillTool(skills: SkillDefinition[]): Record<string, Tool> {
  const skillMap = new Map<string, string>();
  for (const s of skills) {
    skillMap.set(s.name, s.content);
  }

  const names = [...skillMap.keys()];

  const skillTool: Tool = {
    description:
      'Retrieve the full content of a skill by its name. Use this when you need detailed instructions from a specific skill.',
    inputSchema: zodSchema(SkillNameSchema),
    execute: (args: { skillName: string }) => {
      const content = skillMap.get(args.skillName);
      if (content === undefined) {
        return `Skill "${args.skillName}" not found. Available: ${names.join(', ')}`;
      }
      return content;
    },
  };

  return { [TOOL_NAME]: skillTool };
}

/**
 * Builds the system prompt suffix that describes available skills.
 */
export function buildSkillsPromptSuffix(skills: SkillDefinition[]): string {
  const lines = skills.map((s) => `- **${s.name}**: ${s.description}`);
  return [
    '',
    '## Available Skills',
    '',
    'You have the following skills available. To use a skill, call the `get_skill_content` tool with the skill name to retrieve its full instructions, then follow those instructions.',
    '',
    ...lines,
  ].join('\n');
}

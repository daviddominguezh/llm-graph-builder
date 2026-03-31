import z from 'zod';

export const ReadFileSchema = z.object({
  path: z.string().describe('Relative path from repo root'),
  start_line: z.number().int().min(1).optional().describe('1-based start line'),
  end_line: z.number().int().min(1).optional().describe('1-based end line (inclusive)'),
});

export const ListDirectorySchema = z.object({
  path: z.string().default('').describe('Directory path, defaults to repo root'),
  recursive: z.boolean().default(false),
  max_depth: z.number().int().min(1).default(2),
});

export const FindFilesSchema = z.object({
  pattern: z.string().describe('Glob pattern, e.g. "**/*.ts"'),
  path: z.string().optional().describe('Directory scope'),
  exclude: z.array(z.string()).optional().describe('Glob patterns to exclude'),
  max_results: z.number().int().min(1).default(100),
});

export const SearchTextSchema = z.object({
  pattern: z.string().describe('Search string or regex'),
  is_regex: z.boolean().default(false),
  path: z.string().optional().describe('Directory scope'),
  include_glob: z.string().optional().describe('Only search matching files, e.g. "*.ts"'),
  ignore_case: z.boolean().default(false),
  max_results: z.number().int().min(1).default(50),
});

export const GetFileMetadataSchema = z.object({
  path: z.string().describe('Relative path to the file'),
});

export const GetFileTreeSchema = z.object({
  path: z.string().default('').describe('Root of the subtree, defaults to repo root'),
  max_depth: z.number().int().min(1).default(3),
});

export const CountLinesSchema = z.object({
  path: z.string().describe('File path (file only, not directory)'),
  pattern: z.string().optional().describe('Count only lines matching this'),
  is_regex: z.boolean().default(false),
});

export const SearchSymbolSchema = z.object({
  name: z.string().describe('Symbol name or prefix to search for'),
  kind: z.enum(['function', 'class', 'interface', 'variable', 'type', 'any']).default('any'),
  path: z.string().optional().describe('Directory scope'),
});

export const CreateFileSchema = z.object({
  path: z.string().describe('Relative path for the new file'),
  content: z.string().describe('Full content of the file'),
});

const EditSchema = z.object({
  old_text: z.string().describe('Exact text to find (must match once)'),
  new_text: z.string().describe('Replacement text'),
});

export const EditFileSchema = z
  .object({
    path: z.string().describe('Relative path of the file to edit'),
    edits: z.array(EditSchema).optional(),
    full_content: z.string().optional().describe('Replace entire file content'),
  })
  .refine(
    (data) => {
      const hasEdits = data.edits !== undefined && data.edits.length > 0;
      const hasFullContent = data.full_content !== undefined;
      return hasEdits !== hasFullContent;
    },
    { message: 'Provide either edits or full_content, not both and not neither' }
  );

export const DeleteFileSchema = z.object({
  path: z.string().describe('Relative path to the file to delete'),
});

export const RenameFileSchema = z.object({
  old_path: z.string().describe('Current relative path'),
  new_path: z.string().describe('Target relative path'),
});

export type ReadFileInput = z.infer<typeof ReadFileSchema>;
export type ListDirectoryInput = z.infer<typeof ListDirectorySchema>;
export type FindFilesInput = z.infer<typeof FindFilesSchema>;
export type SearchTextInput = z.infer<typeof SearchTextSchema>;
export type GetFileMetadataInput = z.infer<typeof GetFileMetadataSchema>;
export type GetFileTreeInput = z.infer<typeof GetFileTreeSchema>;
export type CountLinesInput = z.infer<typeof CountLinesSchema>;
export type SearchSymbolInput = z.infer<typeof SearchSymbolSchema>;
export type CreateFileInput = z.infer<typeof CreateFileSchema>;
export type EditFileInput = z.infer<typeof EditFileSchema>;
export type DeleteFileInput = z.infer<typeof DeleteFileSchema>;
export type RenameFileInput = z.infer<typeof RenameFileSchema>;

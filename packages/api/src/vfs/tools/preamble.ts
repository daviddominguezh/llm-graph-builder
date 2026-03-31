export const VFS_TOOLS_PREAMBLE = `## Virtual File System Tools

You have access to a virtual file system for reading and modifying code. Key guidelines:

- Use \`get_file_metadata\` before reading large files to check size
- Use \`search_text\` to find relevant code instead of reading entire files
- Use \`read_file\` with start_line/end_line for specific sections of large files
- Use \`find_files\` with glob patterns to locate files by name or extension
- Use \`search_symbol\` to find function, class, or type definitions
- Use \`edit_file\` with search-and-replace edits for precise changes
- Use \`edit_file\` with full_content only for small files or complete rewrites
- All paths are relative to the repository root. No leading slashes or ".." traversal.
`;

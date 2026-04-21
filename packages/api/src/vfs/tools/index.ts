import type { Tool } from 'ai';

import type { Context } from '@src/types/tools.js';

import type { VFSContext } from '../vfsContext.js';
import { createCountLinesTool } from './countLines.js';
import { createCreateFileTool } from './createFile.js';
import { createDeleteFileTool } from './deleteFile.js';
import { createEditFileTool } from './editFile.js';
import { createFindFilesTool } from './findFiles.js';
import { createGetFileMetadataTool } from './getFileMetadata.js';
import { createGetFileTreeTool } from './getFileTree.js';
import { createListDirectoryTool } from './listDirectory.js';
import { createReadFileTool } from './readFile.js';
import { createRenameFileTool } from './renameFile.js';
import { createSearchSymbolTool } from './searchSymbol.js';
import { createSearchTextTool } from './searchText.js';
import { VFSTool } from './toolEnum.js';

export function generateVFSTools(_context: Context, vfs: VFSContext): Record<string, Tool> {
  return {
    [VFSTool.read_file]: createReadFileTool(vfs),
    [VFSTool.list_directory]: createListDirectoryTool(vfs),
    [VFSTool.find_files]: createFindFilesTool(vfs),
    [VFSTool.search_text]: createSearchTextTool(vfs),
    [VFSTool.get_file_metadata]: createGetFileMetadataTool(vfs),
    [VFSTool.get_file_tree]: createGetFileTreeTool(vfs),
    [VFSTool.count_lines]: createCountLinesTool(vfs),
    [VFSTool.search_symbol]: createSearchSymbolTool(vfs),
    [VFSTool.create_file]: createCreateFileTool(vfs),
    [VFSTool.edit_file]: createEditFileTool(vfs),
    [VFSTool.delete_file]: createDeleteFileTool(vfs),
    [VFSTool.rename_file]: createRenameFileTool(vfs),
  };
}

export { VFS_TOOLS_PREAMBLE } from './preamble.js';
export { VFSTool } from './toolEnum.js';

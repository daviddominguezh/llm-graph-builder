import { describe, expect, it, jest } from '@jest/globals';

import type { ToolResponsePrompt } from '../../../types/tools.js';
import { VFSError, VFSErrorCode } from '../../types.js';
import type { VFSContext } from '../../vfsContext.js';
import { createEditFileTool } from '../editFile.js';

const TOOL_CALL_ID = 'call-edit-abc';

const MOCK_EDIT_RESULT = {
  path: 'src/a.ts',
  editsApplied: 2,
  newLineCount: 15,
};

function makeMockVfs(): VFSContext {
  return {
    editFile: jest.fn<VFSContext['editFile']>().mockResolvedValue(MOCK_EDIT_RESULT),
  } as unknown as VFSContext;
}

function makeMockVfsWithError(error: unknown): VFSContext {
  return {
    editFile: jest.fn<VFSContext['editFile']>().mockRejectedValue(error),
  } as unknown as VFSContext;
}

async function executeEditFileWithEdits(vfs: VFSContext): Promise<ToolResponsePrompt> {
  const editTool = createEditFileTool(vfs);
  if (editTool.execute === undefined) {
    throw new Error('execute is not defined on editTool');
  }
  const result = await editTool.execute(
    {
      path: 'src/a.ts',
      edits: [{ old_text: 'foo', new_text: 'bar' }],
    },
    { toolCallId: TOOL_CALL_ID, messages: [] }
  );
  return result as ToolResponsePrompt;
}

async function executeEditFileWithFullContent(vfs: VFSContext): Promise<ToolResponsePrompt> {
  const editTool = createEditFileTool(vfs);
  if (editTool.execute === undefined) {
    throw new Error('execute is not defined on editTool');
  }
  const result = await editTool.execute(
    {
      path: 'src/a.ts',
      full_content: 'const x = 1;\n',
    },
    { toolCallId: TOOL_CALL_ID, messages: [] }
  );
  return result as ToolResponsePrompt;
}

function describeHappyPathWithEdits(): void {
  it('returns success: true with snake_case fields', async () => {
    const vfs = makeMockVfs();
    const response = await executeEditFileWithEdits(vfs);
    expect(response.type).toBe('tool-result');
    expect(response.result).toMatchObject({
      result: {
        success: true,
        path: 'src/a.ts',
        edits_applied: 2,
        new_line_count: 15,
      },
    });
  });

  it('sets toolCallId and toolName on the response', async () => {
    const vfs = makeMockVfs();
    const response = await executeEditFileWithEdits(vfs);
    expect(response.toolCallId).toBe(TOOL_CALL_ID);
    expect(response.toolName).toBe('edit_file');
  });

  it('calls vfs.editFile with mapped edits', async () => {
    const vfs = makeMockVfs();
    await executeEditFileWithEdits(vfs);
    expect(vfs.editFile).toHaveBeenCalledWith('src/a.ts', [{ old_text: 'foo', new_text: 'bar' }], undefined);
  });
}

function describeHappyPathWithFullContent(): void {
  it('calls vfs.editFile with fullContent and no edits', async () => {
    const vfs = makeMockVfs();
    await executeEditFileWithFullContent(vfs);
    expect(vfs.editFile).toHaveBeenCalledWith('src/a.ts', undefined, 'const x = 1;\n');
  });

  it('returns success: true with snake_case fields', async () => {
    const vfs = makeMockVfs();
    const response = await executeEditFileWithFullContent(vfs);
    expect(response.result).toMatchObject({
      result: { success: true, path: 'src/a.ts', edits_applied: 2, new_line_count: 15 },
    });
  });
}

function describeVFSError(): void {
  it('returns isError: true on VFSError MATCH_NOT_FOUND', async () => {
    const error = new VFSError(VFSErrorCode.MATCH_NOT_FOUND, 'Text not found');
    const vfs = makeMockVfsWithError(error);
    const response = await executeEditFileWithEdits(vfs);
    expect(response.isError).toBe(true);
    expect(response.result).toMatchObject({
      result: { success: false, error: 'Text not found', error_code: VFSErrorCode.MATCH_NOT_FOUND },
    });
  });

  it('rethrows non-VFSError errors', async () => {
    const unexpectedError = new Error('unexpected');
    const vfs = makeMockVfsWithError(unexpectedError);
    await expect(executeEditFileWithEdits(vfs)).rejects.toThrow('unexpected');
  });
}

describe('createEditFileTool', () => {
  describe('happy path with edits', describeHappyPathWithEdits);
  describe('happy path with full_content', describeHappyPathWithFullContent);
  describe('VFSError handling', describeVFSError);
});

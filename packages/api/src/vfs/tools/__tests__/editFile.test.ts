import { describe, expect, it, jest } from '@jest/globals';

import type { ToolResponsePrompt } from '../../../types/tools.js';
import { VFSError, VFSErrorCode } from '../../types.js';
import type { VFSContext } from '../../vfsContext.js';
import { createEditFileTool } from '../editFile.js';

const TOOL_CALL_ID = 'call-edit-abc';
const EDITS_APPLIED = 2;
const NEW_LINE_COUNT = 15;

const MOCK_EDIT_RESULT = {
  path: 'src/a.ts',
  editsApplied: EDITS_APPLIED,
  newLineCount: NEW_LINE_COUNT,
};

function createMockEditFile(): VFSContext['editFile'] {
  return jest.fn<VFSContext['editFile']>().mockResolvedValue(MOCK_EDIT_RESULT);
}

function createMockEditFileWithError(error: unknown): VFSContext['editFile'] {
  return jest.fn<VFSContext['editFile']>().mockRejectedValue(error);
}

function isVFSContext(value: unknown): value is VFSContext {
  return typeof value === 'object' && value !== null && 'editFile' in value;
}

function wrapAsVfs(editFile: VFSContext['editFile']): VFSContext {
  const obj: { editFile: VFSContext['editFile'] } = { editFile };
  if (isVFSContext(obj)) return obj;
  throw new Error('Failed to create mock VFSContext');
}

function isToolResponsePrompt(value: unknown): value is ToolResponsePrompt {
  return typeof value === 'object' && value !== null && 'type' in value;
}

async function executeEditFileWithEdits(editFile: VFSContext['editFile']): Promise<ToolResponsePrompt> {
  const editTool = createEditFileTool(wrapAsVfs(editFile));
  if (editTool.execute === undefined) {
    throw new Error('execute is not defined on editTool');
  }
  const result: unknown = await editTool.execute(
    {
      path: 'src/a.ts',
      edits: [{ old_text: 'foo', new_text: 'bar' }],
    },
    { toolCallId: TOOL_CALL_ID, messages: [] }
  );
  if (!isToolResponsePrompt(result)) throw new Error('Unexpected result type');
  return result;
}

async function executeEditFileWithFullContent(editFile: VFSContext['editFile']): Promise<ToolResponsePrompt> {
  const editTool = createEditFileTool(wrapAsVfs(editFile));
  if (editTool.execute === undefined) {
    throw new Error('execute is not defined on editTool');
  }
  const result: unknown = await editTool.execute(
    {
      path: 'src/a.ts',
      full_content: 'const x = 1;\n',
    },
    { toolCallId: TOOL_CALL_ID, messages: [] }
  );
  if (!isToolResponsePrompt(result)) throw new Error('Unexpected result type');
  return result;
}

function describeHappyPathWithEdits(): void {
  it('returns success: true with snake_case fields', async () => {
    const editFile = createMockEditFile();
    const response = await executeEditFileWithEdits(editFile);
    expect(response.type).toBe('tool-result');
    expect(response.result).toMatchObject({
      result: {
        success: true,
        path: 'src/a.ts',
        edits_applied: EDITS_APPLIED,
        new_line_count: NEW_LINE_COUNT,
      },
    });
  });

  it('sets toolCallId and toolName on the response', async () => {
    const editFile = createMockEditFile();
    const response = await executeEditFileWithEdits(editFile);
    expect(response.toolCallId).toBe(TOOL_CALL_ID);
    expect(response.toolName).toBe('edit_file');
  });

  it('calls vfs.editFile with mapped edits', async () => {
    const editFile = createMockEditFile();
    await executeEditFileWithEdits(editFile);
    expect(editFile).toHaveBeenCalledWith('src/a.ts', [{ old_text: 'foo', new_text: 'bar' }], undefined);
  });
}

function describeHappyPathWithFullContent(): void {
  it('calls vfs.editFile with fullContent and no edits', async () => {
    const editFile = createMockEditFile();
    await executeEditFileWithFullContent(editFile);
    expect(editFile).toHaveBeenCalledWith('src/a.ts', undefined, 'const x = 1;\n');
  });

  it('returns success: true with snake_case fields', async () => {
    const editFile = createMockEditFile();
    const response = await executeEditFileWithFullContent(editFile);
    expect(response.result).toMatchObject({
      result: {
        success: true,
        path: 'src/a.ts',
        edits_applied: EDITS_APPLIED,
        new_line_count: NEW_LINE_COUNT,
      },
    });
  });
}

function describeVFSError(): void {
  it('returns isError: true on VFSError MATCH_NOT_FOUND', async () => {
    const error = new VFSError(VFSErrorCode.MATCH_NOT_FOUND, 'Text not found');
    const editFile = createMockEditFileWithError(error);
    const response = await executeEditFileWithEdits(editFile);
    expect(response.isError).toBe(true);
    expect(response.result).toMatchObject({
      result: { success: false, error: 'Text not found', error_code: VFSErrorCode.MATCH_NOT_FOUND },
    });
  });

  it('rethrows non-VFSError errors', async () => {
    const unexpectedError = new Error('unexpected');
    const editFile = createMockEditFileWithError(unexpectedError);
    await expect(executeEditFileWithEdits(editFile)).rejects.toThrow('unexpected');
  });
}

describe('createEditFileTool', () => {
  describe('happy path with edits', describeHappyPathWithEdits);
  describe('happy path with full_content', describeHappyPathWithFullContent);
  describe('VFSError handling', describeVFSError);
});

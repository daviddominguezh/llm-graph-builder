import { describe, expect, it, jest } from '@jest/globals';

import type { ToolResponsePrompt } from '../../../types/tools.js';
import type { ReadFileResult } from '../../types.js';
import { VFSError, VFSErrorCode } from '../../types.js';
import type { VFSContext } from '../../vfsContext.js';
import { createReadFileTool } from '../readFile.js';

const TOOL_CALL_ID = 'call-abc';

const MOCK_READ_RESULT: ReadFileResult = {
  path: 'src/a.ts',
  content: 'hello',
  startLine: 1,
  endLine: 5,
  totalLines: 5,
  tokenEstimate: 2,
};

function makeMockVfs(): VFSContext {
  return {
    readFile: jest.fn<VFSContext['readFile']>().mockResolvedValue(MOCK_READ_RESULT),
  } as unknown as VFSContext;
}

function makeMockVfsWithError(error: unknown): VFSContext {
  return {
    readFile: jest.fn<VFSContext['readFile']>().mockRejectedValue(error),
  } as unknown as VFSContext;
}

async function executeReadFile(vfs: VFSContext, path = 'src/a.ts'): Promise<ToolResponsePrompt> {
  const readTool = createReadFileTool(vfs);
  if (readTool.execute === undefined) {
    throw new Error('execute is not defined on readTool');
  }
  const result = await readTool.execute({ path }, { toolCallId: TOOL_CALL_ID, messages: [] });
  return result as ToolResponsePrompt;
}

function describeHappyPath(): void {
  it('returns a tool-result with success: true', async () => {
    const vfs = makeMockVfs();
    const response = await executeReadFile(vfs);
    expect(response.type).toBe('tool-result');
    expect(response.result).toMatchObject({ result: { success: true } });
  });

  it('maps camelCase result fields to snake_case', async () => {
    const vfs = makeMockVfs();
    const response = await executeReadFile(vfs);
    expect(response.result).toMatchObject({
      result: {
        path: 'src/a.ts',
        content: 'hello',
        start_line: 1,
        end_line: 5,
        total_lines: 5,
        token_estimate: 2,
      },
    });
  });

  it('sets toolCallId and toolName on the response', async () => {
    const vfs = makeMockVfs();
    const response = await executeReadFile(vfs);
    expect(response.toolCallId).toBe(TOOL_CALL_ID);
    expect(response.toolName).toBe('read_file');
  });
}

function describeVFSError(): void {
  it('returns a tool-result with isError: true on VFSError', async () => {
    const error = new VFSError(VFSErrorCode.FILE_NOT_FOUND, 'File missing');
    const vfs = makeMockVfsWithError(error);
    const response = await executeReadFile(vfs);
    expect(response.isError).toBe(true);
    expect(response.result).toMatchObject({
      result: { success: false, error: 'File missing', error_code: VFSErrorCode.FILE_NOT_FOUND },
    });
  });

  it('rethrows non-VFSError errors', async () => {
    const unexpectedError = new Error('unexpected');
    const vfs = makeMockVfsWithError(unexpectedError);
    await expect(executeReadFile(vfs)).rejects.toThrow('unexpected');
  });
}

describe('createReadFileTool', () => {
  describe('happy path', describeHappyPath);
  describe('VFSError handling', describeVFSError);
});

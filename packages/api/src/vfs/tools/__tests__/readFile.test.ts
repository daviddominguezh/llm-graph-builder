import { describe, expect, it, jest } from '@jest/globals';

import type { ToolResponsePrompt } from '../../../types/tools.js';
import type { ReadFileResult } from '../../types.js';
import { VFSError, VFSErrorCode } from '../../types.js';
import type { VFSContext } from '../../vfsContext.js';
import { createReadFileTool } from '../readFile.js';

const TOOL_CALL_ID = 'call-abc';
const START_LINE = 1;
const END_LINE = 5;
const TOTAL_LINES = 5;
const TOKEN_ESTIMATE = 2;

const MOCK_READ_RESULT: ReadFileResult = {
  path: 'src/a.ts',
  content: 'hello',
  startLine: START_LINE,
  endLine: END_LINE,
  totalLines: TOTAL_LINES,
  tokenEstimate: TOKEN_ESTIMATE,
};

function isVFSContext(value: unknown): value is VFSContext {
  return typeof value === 'object' && value !== null && 'readFile' in value;
}

function wrapAsVfs(readFile: VFSContext['readFile']): VFSContext {
  const obj: { readFile: VFSContext['readFile'] } = { readFile };
  if (isVFSContext(obj)) return obj;
  throw new Error('Failed to create mock VFSContext');
}

function createMockReadFile(): VFSContext['readFile'] {
  return jest.fn<VFSContext['readFile']>().mockResolvedValue(MOCK_READ_RESULT);
}

function createMockReadFileWithError(error: unknown): VFSContext['readFile'] {
  return jest.fn<VFSContext['readFile']>().mockRejectedValue(error);
}

function isToolResponsePrompt(value: unknown): value is ToolResponsePrompt {
  return typeof value === 'object' && value !== null && 'type' in value;
}

async function executeReadFile(
  readFile: VFSContext['readFile'],
  path = 'src/a.ts'
): Promise<ToolResponsePrompt> {
  const readTool = createReadFileTool(wrapAsVfs(readFile));
  if (readTool.execute === undefined) {
    throw new Error('execute is not defined on readTool');
  }
  const result: unknown = await readTool.execute({ path }, { toolCallId: TOOL_CALL_ID, messages: [] });
  if (!isToolResponsePrompt(result)) throw new Error('Unexpected result type');
  return result;
}

function describeHappyPath(): void {
  it('returns a tool-result with success: true', async () => {
    const readFile = createMockReadFile();
    const response = await executeReadFile(readFile);
    expect(response.type).toBe('tool-result');
    expect(response.result).toMatchObject({ result: { success: true } });
  });

  it('maps camelCase result fields to snake_case', async () => {
    const readFile = createMockReadFile();
    const response = await executeReadFile(readFile);
    expect(response.result).toMatchObject({
      result: {
        path: 'src/a.ts',
        content: 'hello',
        start_line: START_LINE,
        end_line: END_LINE,
        total_lines: TOTAL_LINES,
        token_estimate: TOKEN_ESTIMATE,
      },
    });
  });

  it('sets toolCallId and toolName on the response', async () => {
    const readFile = createMockReadFile();
    const response = await executeReadFile(readFile);
    expect(response.toolCallId).toBe(TOOL_CALL_ID);
    expect(response.toolName).toBe('read_file');
  });
}

function describeVFSError(): void {
  it('returns a tool-result with isError: true on VFSError', async () => {
    const error = new VFSError(VFSErrorCode.FILE_NOT_FOUND, 'File missing');
    const readFile = createMockReadFileWithError(error);
    const response = await executeReadFile(readFile);
    expect(response.isError).toBe(true);
    expect(response.result).toMatchObject({
      result: { success: false, error: 'File missing', error_code: VFSErrorCode.FILE_NOT_FOUND },
    });
  });

  it('rethrows non-VFSError errors', async () => {
    const unexpectedError = new Error('unexpected');
    const readFile = createMockReadFileWithError(unexpectedError);
    await expect(executeReadFile(readFile)).rejects.toThrow('unexpected');
  });
}

describe('createReadFileTool', () => {
  describe('happy path', describeHappyPath);
  describe('VFSError handling', describeVFSError);
});

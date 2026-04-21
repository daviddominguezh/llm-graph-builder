import { describe, expect, it } from '@jest/globals';

import { VFSError, VFSErrorCode } from '../../types.js';
import { toToolError, toToolSuccess } from '../toolResponse.js';

const TOOL_CALL_ID = 'call-123';
const TOOL_NAME = 'read_file';
const DETAILS_LINE = 99;

function describeToToolSuccess(): void {
  it('wraps data with success: true at result.result', () => {
    const data = { path: 'src/foo.ts', content: 'hello' };
    const response = toToolSuccess(TOOL_CALL_ID, TOOL_NAME, data);
    expect(response.result).toEqual({ result: { success: true, ...data } });
  });

  it('sets toolCallId and toolName', () => {
    const response = toToolSuccess(TOOL_CALL_ID, TOOL_NAME, {});
    expect(response.toolCallId).toBe(TOOL_CALL_ID);
    expect(response.toolName).toBe(TOOL_NAME);
  });

  it('sets type to tool-result', () => {
    const response = toToolSuccess(TOOL_CALL_ID, TOOL_NAME, {});
    expect(response.type).toBe('tool-result');
  });
}

function describeToToolError(): void {
  it('wraps VFSError with success: false and sets isError: true', () => {
    const error = new VFSError(VFSErrorCode.FILE_NOT_FOUND, 'File missing');
    const response = toToolError(TOOL_CALL_ID, TOOL_NAME, error);
    expect(response.isError).toBe(true);
    expect(response.result).toEqual({
      result: { success: false, error: 'File missing', error_code: VFSErrorCode.FILE_NOT_FOUND },
    });
  });

  it('maps error.message to error and error.code to error_code', () => {
    const error = new VFSError(VFSErrorCode.PERMISSION_DENIED, 'Access denied');
    const response = toToolError(TOOL_CALL_ID, TOOL_NAME, error);
    expect(response.result).toEqual(
      expect.objectContaining({
        result: expect.objectContaining({
          error: 'Access denied',
          error_code: VFSErrorCode.PERMISSION_DENIED,
        }),
      })
    );
  });

  it('includes details when VFSError has details', () => {
    const details = { line: DETAILS_LINE, context: 'some context' };
    const error = new VFSError(VFSErrorCode.MATCH_NOT_FOUND, 'No match', details);
    const response = toToolError(TOOL_CALL_ID, TOOL_NAME, error);
    expect(response.result).toEqual(
      expect.objectContaining({ result: expect.objectContaining({ details }) })
    );
  });

  it('omits details when VFSError has no details', () => {
    const error = new VFSError(VFSErrorCode.INVALID_PATH, 'Bad path');
    const response = toToolError(TOOL_CALL_ID, TOOL_NAME, error);
    expect(response.result).toEqual({
      result: { success: false, error: 'Bad path', error_code: VFSErrorCode.INVALID_PATH },
    });
  });
}

describe('toToolSuccess', describeToToolSuccess);
describe('toToolError', describeToToolError);

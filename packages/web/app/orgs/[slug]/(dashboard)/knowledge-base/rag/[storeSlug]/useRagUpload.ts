'use client';

import { confirmUploadAction, initUploadAction } from '@/app/actions/ragFiles';
import { useCallback } from 'react';

interface UseRagUploadInput {
  storeId: string;
  tenantId: string;
}

export interface UploadFileInput {
  file: File;
  languages: string[];
}

export interface UploadResult {
  fileId: string;
  filename: string;
  error?: string;
}

interface UploadOneOptions {
  onUploading?: (fileId: string) => void;
  onConfirmed?: (fileId: string) => void;
}

interface UseRagUploadReturn {
  uploadOne: (input: UploadFileInput, options?: UploadOneOptions) => Promise<UploadResult>;
}

const DEFAULT_MIME = 'application/octet-stream';

function resolveMime(file: File): string {
  return file.type === '' ? DEFAULT_MIME : file.type;
}

export function useRagUpload({ storeId, tenantId }: UseRagUploadInput): UseRagUploadReturn {
  const uploadOne = useCallback(
    async (input: UploadFileInput, options: UploadOneOptions = {}): Promise<UploadResult> => {
      const { file, languages } = input;
      const mime = resolveMime(file);
      const { result, error } = await initUploadAction({
        storeId,
        tenantId,
        filename: file.name,
        mimeType: mime,
        sizeBytes: file.size,
        languageHints: languages,
      });
      if (result === null || error !== null) {
        return { fileId: '', filename: file.name, error: error ?? 'init failed' };
      }
      options.onUploading?.(result.fileId);
      const putRes = await fetch(result.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': mime },
        body: file,
      });
      if (!putRes.ok) {
        return {
          fileId: result.fileId,
          filename: file.name,
          error: `upload failed: ${String(putRes.status)}`,
        };
      }
      const { error: confirmErr } = await confirmUploadAction(storeId, result.fileId);
      if (confirmErr !== null) {
        return { fileId: result.fileId, filename: file.name, error: confirmErr };
      }
      options.onConfirmed?.(result.fileId);
      return { fileId: result.fileId, filename: file.name };
    },
    [storeId, tenantId]
  );

  return { uploadOne };
}

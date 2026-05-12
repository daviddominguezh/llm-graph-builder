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
  ocrEnabled: boolean;
  ocrMode: 'standard' | 'advanced';
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
      const { file, languages, ocrEnabled, ocrMode } = input;
      const mime = resolveMime(file);
      const sentMode = ocrEnabled ? ocrMode : null;
      const sentHints = ocrEnabled && ocrMode === 'standard' ? languages : [];
      console.log(
        `[ragUpload] init filename=${file.name} mime=${mime} mode=${sentMode ?? 'off'} languages=${JSON.stringify(sentHints)}`
      );
      const { result, error } = await initUploadAction({
        storeId,
        tenantId,
        filename: file.name,
        mimeType: mime,
        sizeBytes: file.size,
        languageHints: sentHints,
        ocrMode: sentMode,
      });
      if (result === null || error !== null) {
        console.error(`[ragUpload] init failed filename=${file.name} error=${String(error)}`);
        return { fileId: '', filename: file.name, error: error ?? 'init failed' };
      }
      console.log(`[ragUpload] init ok fileId=${result.fileId} filename=${file.name}`);
      options.onUploading?.(result.fileId);
      const putRes = await fetch(result.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': mime },
        body: file,
      });
      if (!putRes.ok) {
        console.error(`[ragUpload] PUT failed fileId=${result.fileId} status=${String(putRes.status)}`);
        return {
          fileId: result.fileId,
          filename: file.name,
          error: `upload failed: ${String(putRes.status)}`,
        };
      }
      console.log(`[ragUpload] PUT ok fileId=${result.fileId}`);
      const { error: confirmErr } = await confirmUploadAction(storeId, result.fileId);
      if (confirmErr !== null) {
        console.error(`[ragUpload] confirm failed fileId=${result.fileId} error=${confirmErr}`);
        return { fileId: result.fileId, filename: file.name, error: confirmErr };
      }
      console.log(`[ragUpload] confirm ok fileId=${result.fileId}`);
      options.onConfirmed?.(result.fileId);
      return { fileId: result.fileId, filename: file.name };
    },
    [storeId, tenantId]
  );

  return { uploadOne };
}

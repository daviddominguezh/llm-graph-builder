'use client';

import { confirmUploadAction, initUploadAction } from '@/app/actions/ragFiles';
import { useCallback, useState } from 'react';

interface UseRagUploadInput {
  storeId: string;
  tenantId: string;
  onFileQueued: (fileId: string) => void;
}

export interface UploadResult {
  fileId: string;
  filename: string;
  error?: string;
}

interface UseRagUploadReturn {
  uploading: boolean;
  uploadFiles: (files: FileList) => Promise<UploadResult[]>;
}

const DEFAULT_MIME = 'application/octet-stream';

function resolveMime(file: File): string {
  return file.type === '' ? DEFAULT_MIME : file.type;
}

export function useRagUpload({ storeId, tenantId, onFileQueued }: UseRagUploadInput): UseRagUploadReturn {
  const [uploading, setUploading] = useState(false);

  const uploadOne = useCallback(
    async (file: File): Promise<UploadResult> => {
      const mime = resolveMime(file);
      const { result, error } = await initUploadAction({
        storeId,
        tenantId,
        filename: file.name,
        mimeType: mime,
        sizeBytes: file.size,
      });
      if (result === null || error !== null) {
        return { fileId: '', filename: file.name, error: error ?? 'init failed' };
      }
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
      onFileQueued(result.fileId);
      return { fileId: result.fileId, filename: file.name };
    },
    [onFileQueued, storeId, tenantId]
  );

  const uploadFiles = useCallback(
    async (files: FileList): Promise<UploadResult[]> => {
      setUploading(true);
      const list = Array.from(files);
      const final = await list.reduce<Promise<UploadResult[]>>(async (accP, file) => {
        const acc = await accP;
        const r = await uploadOne(file);
        return [...acc, r];
      }, Promise.resolve([]));
      setUploading(false);
      return final;
    },
    [uploadOne]
  );

  return { uploading, uploadFiles };
}

import { DocumentProcessorServiceClient } from '@google-cloud/documentai';

import { type RagConfig, requireRagConfig } from './config.js';
import { gcsUriFor } from './gcs.js';

const CHUNK_SIZE_DEFAULT = 300;

let cachedClient: DocumentProcessorServiceClient | null = null;
function getClient(): DocumentProcessorServiceClient {
  cachedClient ??= new DocumentProcessorServiceClient();
  return cachedClient;
}

function processorName(cfg: RagConfig): string {
  return `projects/${cfg.projectId}/locations/${cfg.location}/processors/${cfg.processorId}`;
}

export interface BatchSubmitInput {
  inputObjectPath: string;
  outputPrefix: string;
  mimeType: string;
}

export interface BatchSubmitResult {
  operationName: string;
  outputGcsUri: string;
}

export async function submitBatch(input: BatchSubmitInput): Promise<BatchSubmitResult> {
  const cfg = requireRagConfig();
  const outputGcsUri = gcsUriFor(input.outputPrefix);
  const [operation] = await getClient().batchProcessDocuments({
    name: processorName(cfg),
    inputDocuments: {
      gcsDocuments: {
        documents: [{ gcsUri: gcsUriFor(input.inputObjectPath), mimeType: input.mimeType }],
      },
    },
    documentOutputConfig: {
      gcsOutputConfig: { gcsUri: outputGcsUri },
    },
    processOptions: {
      ocrConfig: {
        enableNativePdfParsing: true,
      },
      layoutConfig: {
        chunkingConfig: {
          chunkSize: CHUNK_SIZE_DEFAULT,
        },
        enableImageAnnotation: true,
      },
    },
  });
  const operationName = operation.name ?? '';
  if (operationName === '') {
    throw new Error('Document AI batch did not return an operation name');
  }
  return { operationName, outputGcsUri };
}

export type OperationStatus = 'running' | 'done' | 'failed';
export interface OperationState {
  status: OperationStatus;
  error?: string;
}

export async function checkOperation(operationName: string): Promise<OperationState> {
  const op = await getClient().checkBatchProcessDocumentsProgress(operationName);
  if (op.done !== true) return { status: 'running' };
  if (op.error !== undefined) {
    const message = typeof op.error.message === 'string' ? op.error.message : 'unknown error';
    return { status: 'failed', error: message };
  }
  return { status: 'done' };
}

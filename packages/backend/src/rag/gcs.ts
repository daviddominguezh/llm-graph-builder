import { Storage } from '@google-cloud/storage';

import { type RagConfig, requireRagConfig } from './config.js';

const SIGNED_URL_TTL_MINUTES = 15;
const SECONDS_PER_MINUTE = 60;
const MS_PER_SECOND = 1000;
const SIGNED_URL_EXPIRES_MS = SIGNED_URL_TTL_MINUTES * SECONDS_PER_MINUTE * MS_PER_SECOND;

let cachedStorage: Storage | null = null;
function getStorage(): Storage {
  cachedStorage ??= new Storage();
  return cachedStorage;
}

function bucketName(): string {
  const cfg: RagConfig = requireRagConfig();
  return cfg.bucket;
}

export function gcsUriFor(objectPath: string): string {
  return `gs://${bucketName()}/${objectPath}`;
}

export async function createUploadSignedUrl(objectPath: string, contentType: string): Promise<string> {
  const file = getStorage().bucket(bucketName()).file(objectPath);
  const [url] = await file.getSignedUrl({
    version: 'v4',
    action: 'write',
    expires: Date.now() + SIGNED_URL_EXPIRES_MS,
    contentType,
  });
  return url;
}

export async function listObjectsUnder(prefix: string): Promise<string[]> {
  const [files] = await getStorage().bucket(bucketName()).getFiles({ prefix });
  return files.map((f) => f.name);
}

export async function deleteObject(objectPath: string): Promise<void> {
  try {
    await getStorage().bucket(bucketName()).file(objectPath).delete();
  } catch (err) {
    process.stdout.write(`[gcs] delete failed for ${objectPath}: ${String(err)}\n`);
  }
}

export async function deletePrefix(prefix: string): Promise<void> {
  try {
    await getStorage().bucket(bucketName()).deleteFiles({ prefix });
  } catch (err) {
    process.stdout.write(`[gcs] deletePrefix failed for ${prefix}: ${String(err)}\n`);
  }
}

export async function writeBytesObject(
  objectPath: string,
  bytes: Uint8Array,
  contentType: string
): Promise<void> {
  await getStorage().bucket(bucketName()).file(objectPath).save(Buffer.from(bytes), {
    contentType,
    resumable: false,
  });
}

export async function readBytesObject(objectPath: string): Promise<Uint8Array> {
  const [buffer] = await getStorage().bucket(bucketName()).file(objectPath).download();
  return new Uint8Array(buffer);
}

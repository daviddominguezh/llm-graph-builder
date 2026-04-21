/**
 * Audio Converter Utility
 * Converts audio files to WhatsApp-compatible MP3 format using FFmpeg
 * Uses in-memory streams to avoid disk I/O on instances with limited storage
 */
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffmpeg from 'fluent-ffmpeg';
import { PassThrough, Readable } from 'node:stream';

// Set FFmpeg path from the installer
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

/* ─── Constants ─── */

const MONO_CHANNELS = 1;
const SAMPLE_RATE = 44_100;

interface ConversionResult {
  buffer: Buffer;
  mimeType: string;
  extension: string;
}

/* ─── Stream helpers ─── */

const bufferToStream = (buffer: Buffer): Readable => Readable.from(buffer);

async function collectStreamChunks(stream: PassThrough): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    if (Buffer.isBuffer(chunk)) {
      chunks.push(chunk);
    }
  }
  return Buffer.concat(chunks);
}

/* ─── MIME to FFmpeg format map ─── */

const MIME_TO_FORMAT: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/webm;codecs=opus': 'webm',
  'audio/webm; codecs=opus': 'webm',
  'audio/mp4': 'mp4',
  'audio/m4a': 'mp4',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/ogg': 'ogg',
  'audio/ogg; codecs=opus': 'ogg',
  'audio/aac': 'aac',
  'audio/amr': 'amr',
  'audio/wav': 'wav',
  'audio/wave': 'wav',
};

function getFormatFromMimeType(mimeType: string): string | undefined {
  const normalized = mimeType.toLowerCase().trim();
  return MIME_TO_FORMAT[normalized];
}

/* ─── FFmpeg command builders ─── */

function applyInputFormat(command: ffmpeg.FfmpegCommand, format: string | undefined): void {
  if (format !== undefined) command.inputFormat(format);
}

function buildMp3Command(inputStream: Readable, inputFormat: string | undefined): ffmpeg.FfmpegCommand {
  const command = ffmpeg(inputStream);
  applyInputFormat(command, inputFormat);
  return command
    .audioCodec('libmp3lame')
    .audioChannels(MONO_CHANNELS)
    .audioFrequency(SAMPLE_RATE)
    .audioBitrate('128k')
    .format('mp3');
}

function buildM4aCommand(inputStream: Readable, inputFormat: string | undefined): ffmpeg.FfmpegCommand {
  const command = ffmpeg(inputStream);
  applyInputFormat(command, inputFormat);
  return command
    .audioCodec('aac')
    .audioChannels(MONO_CHANNELS)
    .audioFrequency(SAMPLE_RATE)
    .audioBitrate('128k')
    .format('ipod');
}

/* ─── Run conversion pipeline ─── */

async function runConversion(
  command: ffmpeg.FfmpegCommand,
  outputStream: PassThrough,
  logKey: string
): Promise<Buffer> {
  command
    .on('start', (cmd) => {
      process.stdout.write(`${logKey}FFmpeg command: ${cmd}\n`);
    })
    .on('error', (err: Error) => {
      process.stdout.write(`${logKey}FFmpeg error: ${err.message}\n`);
      outputStream.destroy(err);
    })
    .on('end', () => {
      process.stdout.write(`${logKey}FFmpeg conversion completed\n`);
    })
    .pipe(outputStream, { end: true });

  return await collectStreamChunks(outputStream);
}

/* ─── Public API: MP3 (WhatsApp) ─── */

export async function convertAudioToMp3(
  inputBuffer: Buffer,
  inputMimeType: string
): Promise<ConversionResult> {
  const logKey = '[convertAudioToMp3] ';
  process.stdout.write(`${logKey}Converting ${inputMimeType} to MP3 (in-memory)\n`);
  process.stdout.write(`${logKey}Input size: ${String(inputBuffer.length)} bytes\n`);

  const inputFormat = getFormatFromMimeType(inputMimeType);
  const inputStream = bufferToStream(inputBuffer);
  const outputStream = new PassThrough();
  const command = buildMp3Command(inputStream, inputFormat);
  const outputBuffer = await runConversion(command, outputStream, logKey);

  process.stdout.write(`${logKey}Output size: ${String(outputBuffer.length)} bytes\n`);
  return { buffer: outputBuffer, mimeType: 'audio/mpeg', extension: 'mp3' };
}

/* ─── Public API: M4A (Instagram) ─── */

export async function convertAudioToM4a(
  inputBuffer: Buffer,
  inputMimeType: string
): Promise<ConversionResult> {
  const logKey = '[convertAudioToM4a] ';
  process.stdout.write(`${logKey}Converting ${inputMimeType} to M4A/AAC (in-memory)\n`);
  process.stdout.write(`${logKey}Input size: ${String(inputBuffer.length)} bytes\n`);

  const inputFormat = getFormatFromMimeType(inputMimeType);
  const inputStream = bufferToStream(inputBuffer);
  const outputStream = new PassThrough();
  const command = buildM4aCommand(inputStream, inputFormat);
  const outputBuffer = await runConversion(command, outputStream, logKey);

  process.stdout.write(`${logKey}Output size: ${String(outputBuffer.length)} bytes\n`);
  return { buffer: outputBuffer, mimeType: 'audio/mp4', extension: 'm4a' };
}

/* ─── Needs conversion check ─── */

/**
 * Check if audio needs conversion for WhatsApp.
 * WhatsApp accepts: audio/aac, audio/amr, audio/mpeg, audio/mp4, audio/ogg (opus only)
 * But browser-recorded audio often has mismatched headers,
 * so we convert everything except known good OGG Opus files.
 */
export function needsConversion(mimeType: string): boolean {
  return !mimeType.toLowerCase().includes('ogg');
}

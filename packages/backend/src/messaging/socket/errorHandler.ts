import type { Socket } from 'socket.io';

/* ─── Stream error detection ─── */

const STREAM_ERROR_PATTERNS = ['terminated', 'BodyTimeoutError', 'UND_ERR_BODY_TIMEOUT', 'Stream reading error'];

function isStreamError(message: string): boolean {
  return STREAM_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
}

function extractErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/* ─── Wrapped handler HOF ─── */

/**
 * Wraps async socket event handlers to catch and handle errors properly.
 * Stream-related errors are suppressed (logged at debug level).
 */
export function wrapSocketHandler<T extends unknown[]>(
  handler: (...args: T) => Promise<void> | void,
  socket: Socket,
  eventName: string
): (...args: T) => Promise<void> {
  return async (...args: T) => {
    try {
      await handler(...args);
    } catch (error) {
      handleSocketError(error, socket, eventName);
    }
  };
}

function handleSocketError(error: unknown, socket: Socket, eventName: string): void {
  const errorMessage = extractErrorMessage(error);

  if (isStreamError(errorMessage)) {
    emitStreamError(socket, eventName);
    return;
  }

  logAndEmitError(error, socket, eventName, errorMessage);
}

function emitStreamError(socket: Socket, eventName: string): void {
  process.stdout.write(`[socket] Suppressed stream error in '${eventName}'\n`);
  if (socket.connected) {
    socket.emit('error', {
      code: 'OPERATION_INTERRUPTED',
      message: 'Operation was interrupted. Please try again.',
      event: eventName,
    });
  }
}

function logAndEmitError(error: unknown, socket: Socket, eventName: string, errorMessage: string): void {
  const stack = error instanceof Error ? error.stack : undefined;
  process.stdout.write(`[socket] Error in '${eventName}': ${errorMessage} ${stack ?? ''}\n`);
  if (socket.connected) {
    socket.emit('error', {
      code: 'INTERNAL_ERROR',
      message: 'An error occurred processing your request',
      event: eventName,
    });
  }
}

/* ─── Socket-level error boundaries ─── */

/**
 * Sets up error boundaries for a socket connection.
 * Suppresses stream-related errors at debug level.
 */
export function setupSocketErrorHandling(socket: Socket): void {
  socket.on('error', (error) => {
    const errorMessage = extractErrorMessage(error);

    if (isStreamError(errorMessage)) {
      process.stdout.write(`[socket] Suppressed socket stream error: ${errorMessage}\n`);
      return;
    }

    process.stdout.write(`[socket] Socket error: ${errorMessage}\n`);
  });

  socket.on('disconnect', () => {
    socket.removeAllListeners();
  });
}

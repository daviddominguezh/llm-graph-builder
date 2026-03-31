'use no memo';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

import { Loader2, Mic, Pause, Play, Send, Square, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';

type RecordingState = 'idle' | 'recording' | 'recorded' | 'uploading';

interface VoiceRecorderProps {
  onRecordingComplete: (audioBlob: Blob, duration: number) => Promise<void>;
  onCancel: () => void;
}

export const getSupportedMimeType = (): string => {
  if (MediaRecorder.isTypeSupported('audio/mp4')) {
    return 'audio/mp4';
  }
  throw new Error('audio/mp4 not supported');
};

/**
 * VoiceRecorder
 *
 * Inline voice recording component that replaces the message input area.
 * Features:
 * - Recording state with visual indicator and duration timer
 * - Cancel button to discard and return to normal input
 * - Stop button to finish recording
 * - Play/pause button to preview recorded audio before sending
 * - Audio range selector/progress bar for seeking through the recording
 * - Send button after stopping (shows recorded duration)
 * - Records in WebM format, converts to OGG Opus for WhatsApp compatibility
 */
export const VoiceRecorder: React.FC<VoiceRecorderProps> = ({ onRecordingComplete, onCancel }) => {
  const t = useTranslations('messages');
  const [state, setState] = useState<RecordingState>('idle');
  const [duration, setDuration] = useState(0);
  const [finalDuration, setFinalDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const isStartingRef = useRef<boolean>(false);
  const mimeTypeRef = useRef<string>('');

  // Format duration as mm:ss
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Start the duration timer
  const startTimer = useCallback(() => {
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      setDuration(elapsed);
    }, 1000);
  }, []);

  // Stop the duration timer
  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Clean up media stream - stops all tracks to release microphone
  const cleanupStream = useCallback(() => {
    if (streamRef.current) {
      const tracks = streamRef.current.getTracks();
      tracks.forEach((track) => {
        track.stop();
      });
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
  }, []);

  // Clean up audio URL
  const cleanupAudioUrl = useCallback(() => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
  }, [audioUrl]);

  // Start recording
  const startRecording = useCallback(async () => {
    // Prevent multiple simultaneous calls (React StrictMode calls effects twice)
    if (isStartingRef.current || streamRef.current) {
      return;
    }
    isStartingRef.current = true;

    try {
      setError(null);
      chunksRef.current = [];

      // Request microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Get best supported MIME type for this browser
      const mimeType = getSupportedMimeType();
      mimeTypeRef.current = mimeType;
      const options: MediaRecorderOptions = { mimeType };
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        // Create blob with recorded format (WebM Opus or MP4)
        // The backend will handle conversion to WhatsApp-compatible format if needed
        const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current });
        setAudioBlob(blob);

        // Create URL for playback
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        setState('recorded');
        mediaRecorderRef.current = null;
      };

      mediaRecorder.onerror = () => {
        setError(t('Recording failed'));
        setState('idle');
        cleanupStream();
        stopTimer();
      };

      mediaRecorder.start();
      setState('recording');
      startTimer();
    } catch (err) {
      isStartingRef.current = false;
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        setError(t('Microphone permission denied'));
      } else {
        setError(t('Failed to access microphone'));
      }
      setState('idle');
    }
  }, [cleanupStream, startTimer, stopTimer, t]);

  // Stop recording
  const stopRecording = useCallback(() => {
    // Stop the timer first and capture final duration
    stopTimer();
    setFinalDuration(duration);

    // Store reference to mediaRecorder before stopping
    const recorder = mediaRecorderRef.current;

    // Stop the media recorder
    if (recorder && recorder.state === 'recording') {
      recorder.stop();
    }

    // Stop all tracks immediately to release microphone and clear Chrome indicator
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
  }, [stopTimer, duration]);

  // Handle cancel
  const handleCancel = useCallback(() => {
    stopTimer();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    cleanupStream();
    cleanupAudioUrl();
    onCancel();
  }, [cleanupStream, cleanupAudioUrl, onCancel, stopTimer]);

  // Handle play/pause
  const togglePlayback = useCallback(() => {
    if (!audioUrl) return;

    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      if (!audioRef.current) {
        audioRef.current = new Audio(audioUrl);
        audioRef.current.onended = () => {
          setIsPlaying(false);
          setCurrentTime(0);
        };
        audioRef.current.ontimeupdate = () => {
          if (audioRef.current) {
            setCurrentTime(audioRef.current.currentTime);
          }
        };
        audioRef.current.onloadedmetadata = () => {
          if (audioRef.current) {
            // Use finalDuration if audio duration is Infinity (common with WebM)
            const dur = audioRef.current.duration;
            setAudioDuration(isFinite(dur) ? dur : finalDuration || duration);
          }
        };
      }
      audioRef.current.play();
      setIsPlaying(true);
    }
  }, [audioUrl, isPlaying, finalDuration, duration]);

  // Handle seek on range input
  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
  }, []);

  // Handle send
  const handleSend = useCallback(async () => {
    if (audioBlob) {
      // Stop playback if playing
      if (audioRef.current) {
        audioRef.current.pause();
      }

      // Set uploading state
      setState('uploading');

      try {
        await onRecordingComplete(audioBlob, finalDuration || duration);
        // Clean up audio URL after sending
        cleanupAudioUrl();
      } catch (err) {
        console.error('Failed to send voice note:', err);
        // Return to recorded state on error
        setState('recorded');
      }
    }
  }, [audioBlob, finalDuration, duration, onRecordingComplete, cleanupAudioUrl]);

  // Start recording immediately when component mounts
  useEffect(() => {
    startRecording();

    return () => {
      stopTimer();
      // Ensure stream is stopped on unmount - use refs directly to avoid stale closure
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      if (mediaRecorderRef.current) {
        if (mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
        mediaRecorderRef.current = null;
      }
      // Clean up audio URL on unmount
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  // Get the effective duration for the range slider
  const effectiveDuration = audioDuration || finalDuration || duration || 1;

  // Render error state
  if (error) {
    return (
      <div className="bg-white rounded-t-md border border-b-0 p-4">
        <div className="flex items-center gap-4">
          {/* Left container - fixed width for centering */}
          <div className="w-24 shrink-0" />

          {/* Center - error message */}
          <div className="flex-grow flex items-center justify-center gap-3 text-red-600">
            <Mic size={20} className="shrink-0" />
            <span className="flex-grow text-center text-sm font-medium">{error}</span>
          </div>

          {/* Right container - fixed width for centering */}
          <div className="w-24 shrink-0 flex justify-end">
            <Button variant="destructive" className="cursor-pointer" onClick={onCancel}>
              <Trash2 size={18} />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Get the display duration (use finalDuration when recorded, otherwise live duration)
  const displayDuration = state === 'recorded' || state === 'uploading' ? finalDuration : duration;

  return (
    <div className="bg-white rounded-t-md border border-b-0 p-4">
      <div className="flex items-center gap-4">
        {/* 1.1 Trash bin button */}
        <div className="shrink-0">
          <Button
            variant="destructive"
            className="cursor-pointer"
            onClick={handleCancel}
            disabled={state === 'uploading'}
          >
            <Trash2 size={18} />
            <span className="ml-1 hidden sm:inline">{t('Delete')}</span>
          </Button>
        </div>

        {/* 1.2 Center column - content varies by state */}
        <div className="flex-grow flex flex-col gap-1">
          {state === 'recording' ? (
            /* Recording state - single row with indicator and timer */
            <div className="flex items-center justify-center gap-2">
              {/* Animated recording indicator */}
              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse shrink-0" />
              <span className="text-sm font-medium text-gray-700">
                {t('Recording...')} {formatDuration(displayDuration)}
              </span>
            </div>
          ) : state === 'recorded' ? (
            /* Recorded state - two rows: play button + label, then range selector */
            <>
              {/* 1.2.1 Row: Play/Pause button + label - centered horizontally */}
              <div className="flex items-center justify-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={togglePlayback}
                  className="p-1 h-8 w-8 rounded-full shrink-0"
                >
                  {isPlaying ? (
                    <Pause size={18} className="text-gray-600" />
                  ) : (
                    <Play size={18} className="text-gray-600" />
                  )}
                </Button>
                <span className="text-sm font-medium text-gray-700">
                  {formatDuration(currentTime)} / {formatDuration(displayDuration)}
                </span>
              </div>
              {/* 1.2.2 Row: Range selector */}
              <div className="flex items-center w-full">
                <input
                  type="range"
                  min={0}
                  max={effectiveDuration}
                  step={0.1}
                  value={currentTime}
                  onChange={handleSeek}
                  className="w-full h-1 bg-gray-300 rounded-full appearance-none cursor-pointer
                    [&::-webkit-slider-thumb]:appearance-none
                    [&::-webkit-slider-thumb]:w-3
                    [&::-webkit-slider-thumb]:h-3
                    [&::-webkit-slider-thumb]:bg-black
                    [&::-webkit-slider-thumb]:rounded-full
                    [&::-webkit-slider-thumb]:cursor-pointer
                    [&::-moz-range-thumb]:w-3
                    [&::-moz-range-thumb]:h-3
                    [&::-moz-range-thumb]:bg-black
                    [&::-moz-range-thumb]:rounded-full
                    [&::-moz-range-thumb]:border-0
                    [&::-moz-range-thumb]:cursor-pointer"
                />
              </div>
            </>
          ) : state === 'uploading' ? (
            /* Uploading state - single row with spinner */
            <div className="flex items-center justify-center gap-2">
              <Loader2 size={20} className="animate-spin text-gray-600 shrink-0" />
              <span className="text-sm font-medium text-gray-700">{t('Sending...')}</span>
            </div>
          ) : (
            /* Idle/Starting state */
            <div className="flex items-center justify-center">
              <span className="text-sm text-gray-500">{t('Starting...')}</span>
            </div>
          )}
        </div>

        {/* 1.3 Right button - Stop or Send */}
        <div className="shrink-0">
          {state === 'recording' ? (
            <Button
              variant="outline"
              onClick={stopRecording}
              className="border-red-300 text-red-600 hover:bg-red-50"
            >
              <Square size={16} className="fill-current" />
              <span className="ml-1 hidden sm:inline">{t('Stop')}</span>
            </Button>
          ) : state === 'recorded' ? (
            <Button onClick={handleSend}>
              <Send size={16} />
              <span className="ml-1 hidden sm:inline">{t('Send')}</span>
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
};

VoiceRecorder.displayName = 'VoiceRecorder';

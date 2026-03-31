import React, { useCallback, useEffect, useRef, useState } from 'react';

import { Pause, Play } from 'lucide-react';

import { Button } from '@components/ui/button';

interface AudioPlayerProps {
  src: string;
  className?: string;
}

/**
 * AudioPlayer component for playing audio messages in the chat view.
 * Features:
 * - Play/pause button
 * - Progress bar with seeking capability
 * - Time display (current / total)
 */
export const AudioPlayer: React.FC<AudioPlayerProps> = ({ src, className = '' }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Format duration as mm:ss
  const formatDuration = (seconds: number): string => {
    if (!isFinite(seconds) || isNaN(seconds)) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Initialize audio element
  useEffect(() => {
    const audio = new Audio(src);
    audioRef.current = audio;

    audio.onloadedmetadata = () => {
      // WebM files often report Infinity duration initially
      if (isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };

    audio.ontimeupdate = () => {
      setCurrentTime(audio.currentTime);
      // Try to get duration again if it was Infinity before
      if (duration === 0 && isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };

    audio.onended = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    // For WebM files, duration might only be available after some playback
    audio.ondurationchange = () => {
      if (isFinite(audio.duration)) {
        setDuration(audio.duration);
      }
    };

    return () => {
      audio.pause();
      audio.src = '';
      audioRef.current = null;
    };
  }, [src]);

  // Handle play/pause
  const togglePlayback = useCallback(() => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  }, [isPlaying]);

  // Handle seek on range input
  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
  }, []);

  // Effective duration for the slider (use 1 as minimum to avoid division by zero)
  const effectiveDuration = duration || 1;

  return (
    <div className={`flex flex-col gap-1 p-2 min-w-[200px] ${className}`}>
      {/* Row 1: Play/Pause button + time display */}
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
          {formatDuration(currentTime)} / {formatDuration(duration)}
        </span>
      </div>
      {/* Row 2: Range selector */}
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
    </div>
  );
};

AudioPlayer.displayName = 'AudioPlayer';

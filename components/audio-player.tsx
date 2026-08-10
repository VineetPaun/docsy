"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  ChevronDown,
  ChevronUp,
  Download,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface AudioPlayerProps {
  // A signed Convex storage URL. The base64 `audioData` prop is gone — audio is
  // persisted to storage now, never inlined into a response (AUDIT.md §4.2).
  audioUrl?: string;
  scriptText?: string;
  title?: string;
  onRegenerate?: () => void;
  isGenerating?: boolean;
  /** Stage text while generating, e.g. "Recording the narration...". */
  stageLabel?: string;
}

export default function AudioPlayer({
  audioUrl,
  scriptText,
  title = "Audio Overview",
  onRegenerate,
  isGenerating = false,
  stageLabel,
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showTranscript, setShowTranscript] = useState(false);

  const audioSource = audioUrl;

  // Format time in MM:SS
  const formatTime = (time: number) => {
    if (isNaN(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  // Handle play/pause
  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  // Handle restart
  const restart = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    audio.play();
    setIsPlaying(true);
  }, []);

  // Handle mute
  const toggleMute = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = !isMuted;
    setIsMuted(!isMuted);
  }, [isMuted]);

  // Handle playback rate change
  const cyclePlaybackRate = useCallback(() => {
    const rates = [0.5, 0.75, 1, 1.25, 1.5, 2];
    const currentIndex = rates.indexOf(playbackRate);
    const nextIndex = (currentIndex + 1) % rates.length;
    const newRate = rates[nextIndex];

    const audio = audioRef.current;
    if (audio) {
      audio.playbackRate = newRate;
    }
    setPlaybackRate(newRate);
  }, [playbackRate]);

  // Handle progress bar click
  const handleProgressClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const audio = audioRef.current;
      const progress = progressRef.current;
      if (!audio || !progress) return;

      const rect = progress.getBoundingClientRect();
      const clickPosition = (e.clientX - rect.left) / rect.width;
      audio.currentTime = clickPosition * duration;
    },
    [duration]
  );

  // Handle download
  const handleDownload = useCallback(() => {
    if (!audioSource) return;

    const link = document.createElement("a");
    link.href = audioSource;
    // ponytail: `download` is ignored on a cross-origin Convex storage URL, so
    // this opens the MP3 in a new tab rather than saving it. Fetch the blob and
    // use an object URL if a true "save as" is ever wanted.
    link.download = `${title.replace(/\s+/g, "_")}.mp3`;
    link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [audioSource, title]);

  // Update time display
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleDurationChange = () => setDuration(audio.duration);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("durationchange", handleDurationChange);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("durationchange", handleDurationChange);
      audio.removeEventListener("ended", handleEnded);
    };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if not typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      switch (e.key) {
        case " ":
          e.preventDefault();
          togglePlay();
          break;
        case "m":
          toggleMute();
          break;
        case "r":
          restart();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [togglePlay, toggleMute, restart]);

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Keyboard seeking for the progress bar, which was click-only (AUDIT.md §9.4).
  const handleProgressKeyDown = (e: React.KeyboardEvent) => {
    const audio = audioRef.current;
    if (!audio || duration <= 0) return;

    const seekTo = (seconds: number) => {
      audio.currentTime = Math.min(duration, Math.max(0, seconds));
    };

    switch (e.key) {
      case "ArrowRight":
      case "ArrowUp":
        e.preventDefault();
        seekTo(audio.currentTime + 5);
        break;
      case "ArrowLeft":
      case "ArrowDown":
        e.preventDefault();
        seekTo(audio.currentTime - 5);
        break;
      case "Home":
        e.preventDefault();
        seekTo(0);
        break;
      case "End":
        e.preventDefault();
        seekTo(duration);
        break;
    }
  };

  // Show nothing only if we have no audio, no script, and not generating
  if (!audioSource && !isGenerating && !scriptText) {
    return null;
  }

  /**
   * Transport controls need something to play.
   *
   * This used to exclude the generating case, which meant a script patched in
   * mid-generation (status `synthesizing`) rendered a full player around a dead
   * progress bar and a play button that did nothing.
   */
  const hasNoAudio = !audioSource;

  return (
    <div className="bg-gradient-to-br from-purple-900/20 to-blue-900/20 border border-purple-500/30 rounded-xl p-4">
      {/* Hidden audio element */}
      {audioSource && (
        <audio ref={audioRef} src={audioSource} preload="metadata" />
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-blue-500 rounded-lg flex items-center justify-center">
            <Volume2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">{title}</h3>
            <p className="text-xs text-muted-foreground">
              {isGenerating
                ? (stageLabel ?? "Generating...")
                : hasNoAudio
                  ? "Script ready"
                  : `${formatTime(duration)} • AI-generated podcast`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {onRegenerate && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onRegenerate}
              disabled={isGenerating}
              className="text-xs"
            >
              <RefreshCw
                className={`w-4 h-4 mr-1 ${isGenerating ? "animate-spin" : ""}`}
              />
              Regenerate
            </Button>
          )}
          {!hasNoAudio && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDownload}
              aria-label="Download the audio overview"
              disabled={!audioSource}
              className="h-8 w-8"
            >
              <Download className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Progress bar - only show if we have audio */}
      {!hasNoAudio && (
        <>
          <div
            ref={progressRef}
            role="slider"
            tabIndex={0}
            aria-label="Seek"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(currentTime)}
            aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
            className="h-2 bg-secondary rounded-full cursor-pointer mb-3 group focus-visible:outline-2 focus-visible:outline-offset-2"
            onClick={handleProgressClick}
            onKeyDown={handleProgressKeyDown}
          >
            <div
              className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full relative transition-all"
              style={{ width: `${progressPercent}%` }}
            >
              <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>

          {/* Time display */}
          <div className="flex justify-between text-xs text-muted-foreground mb-3">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </>
      )}

      {/* Controls - show only if we have audio */}
      {!hasNoAudio && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Restart */}
            <Button
              variant="ghost"
              size="icon"
              onClick={restart}
              aria-label="Restart from the beginning"
              className="h-8 w-8"
              disabled={!audioSource}
            >
              <RotateCcw className="w-4 h-4" />
            </Button>

            {/* Play/Pause */}
            <Button
              variant="default"
              size="icon"
              onClick={togglePlay}
              aria-label={isPlaying ? "Pause" : "Play"}
              className="h-12 w-12 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600"
              disabled={!audioSource || isGenerating}
            >
              {isPlaying ? (
                <Pause className="w-5 h-5 text-white" />
              ) : (
                <Play className="w-5 h-5 text-white ml-0.5" />
              )}
            </Button>

            {/* Mute */}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleMute}
              aria-label={isMuted ? "Unmute" : "Mute"}
              className="h-8 w-8"
              disabled={!audioSource}
            >
              {isMuted ? (
                <VolumeX className="w-4 h-4" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </Button>
          </div>

          <div className="flex items-center gap-2">
            {/* Playback speed */}
            <Button
              variant="outline"
              size="sm"
              onClick={cyclePlaybackRate}
              aria-label={`Playback speed ${playbackRate}x — click to change`}
              className="text-xs h-7 px-2"
              disabled={!audioSource}
            >
              {playbackRate}x
            </Button>

            {/* Show transcript */}
            {scriptText && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowTranscript(!showTranscript)}
                className="text-xs h-7"
              >
                Transcript
                {showTranscript ? (
                  <ChevronUp className="w-3 h-3 ml-1" />
                ) : (
                  <ChevronDown className="w-3 h-3 ml-1" />
                )}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* No audio (yet): the script is all there is to show */}
      {hasNoAudio && scriptText && (
        <div className="flex flex-col items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowTranscript(!showTranscript)}
            className="text-xs"
          >
            {showTranscript ? "Hide" : "View"} Script
            {showTranscript ? (
              <ChevronUp className="w-3 h-3 ml-1" />
            ) : (
              <ChevronDown className="w-3 h-3 ml-1" />
            )}
          </Button>
        </div>
      )}

      {/* Transcript */}
      {showTranscript && scriptText && (
        <div className="mt-4 p-4 bg-secondary/50 rounded-lg max-h-64 overflow-y-auto">
          <h4 className="font-semibold text-sm mb-2">Transcript</h4>
          <div className="text-sm space-y-2 whitespace-pre-wrap">
            {scriptText.split("\n").map((line, i) => {
              const isAlex = line.startsWith("ALEX:");
              const isSam = line.startsWith("SAM:");
              const speaker = isAlex ? "ALEX" : isSam ? "SAM" : null;
              const content = speaker
                ? line.substring(speaker.length + 1).trim()
                : line;

              if (speaker) {
                return (
                  <p key={i}>
                    <span
                      className={`font-semibold ${
                        isAlex ? "text-purple-400" : "text-blue-400"
                      }`}
                    >
                      {speaker}:
                    </span>{" "}
                    {content}
                  </p>
                );
              }
              return line.trim() ? <p key={i}>{line}</p> : null;
            })}
          </div>
        </div>
      )}

      {/* Generating state */}
      {isGenerating && (
        <div className="mt-4 p-4 bg-secondary/50 rounded-lg text-center">
          <RefreshCw
            role="status"
            aria-label="Generating your audio overview"
            className="w-6 h-6 animate-spin mx-auto mb-2 text-purple-400"
          />
          <p className="text-sm text-muted-foreground">
            Generating your audio overview...
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            This may take a minute
          </p>
        </div>
      )}
    </div>
  );
}

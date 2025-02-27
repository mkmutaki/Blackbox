import { useState, useRef, useEffect } from 'react';
import { Video, Pause, Play, Rewind, FastForward, Circle, Trash, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from "sonner";

const VideoRecorder = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [permissionError, setPermissionError] = useState(false);
  const [hasRecording, setHasRecording] = useState(false);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<NodeJS.Timeout>();

  // Add new state for mission data
  const [missionDay, setMissionDay] = useState(19);
  const [currentTime, setCurrentTime] = useState("");
  const [logNumber, setLogNumber] = useState("009");

  // Update time every second
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      const hours = now.getHours().toString().padStart(2, '0');
      const minutes = now.getMinutes().toString().padStart(2, '0');
      setCurrentTime(`${hours}:${minutes}`);
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
      if (recordedVideoUrl) {
        URL.revokeObjectURL(recordedVideoUrl);
      }
    };
  }, []);

  useEffect(() => {
    if (isRecording && !isPaused) {
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }

    return () => clearInterval(timerRef.current);
  }, [isRecording, isPaused]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const startCamera = async () => {
    try {
      setPermissionError(false);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 }
        },
        audio: true
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      streamRef.current = stream;
      toast.success("Camera access granted");
    } catch (err) {
      console.error('Error accessing camera:', err);
      setPermissionError(true);
      setIsPlaying(false);
      toast.error("Please allow camera access to record videos");
      
      if (err instanceof Error) {
        if (err.name === "NotAllowedError") {
          toast.error("Camera permission was denied. Please enable it in your browser settings.");
        } else if (err.name === "NotFoundError") {
          toast.error("No camera found. Please connect a camera and try again.");
        } else {
          toast.error("Error accessing camera. Please try again.");
        }
      }
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      streamRef.current = null;
    }
  };

  const startRecording = () => {
    if (!streamRef.current) {
      toast.error("No camera access. Please allow camera access and try again.");
      startCamera();
      return;
    }

    const mediaRecorder = new MediaRecorder(streamRef.current);
    const chunks: BlobPart[] = [];

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunks.push(e.data);
      }
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      if (recordedVideoUrl) {
        URL.revokeObjectURL(recordedVideoUrl);
      }
      setRecordedVideoUrl(url);
      setHasRecording(true);
      console.log('Recording finished:', url);
      setRecordingTime(0);
      toast.success("Recording saved successfully");
      
      // Switch to the recorded video
      if (videoRef.current) {
        videoRef.current.srcObject = null;
        videoRef.current.src = url;
      }
    };

    mediaRecorder.start();
    mediaRecorderRef.current = mediaRecorder;
    setIsRecording(true);
    setIsPaused(false);
    setHasRecording(false);
    toast.success("Recording started");
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
    }
  };

  const togglePlayPause = () => {
    if (!hasRecording || !videoRef.current) return;
    
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const deleteRecording = () => {
    if (recordedVideoUrl) {
      URL.revokeObjectURL(recordedVideoUrl);
      setRecordedVideoUrl(null);
      setHasRecording(false);
      // Switch back to camera feed
      if (videoRef.current) {
        videoRef.current.src = '';
        videoRef.current.srcObject = streamRef.current;
      }
      toast.success("Recording deleted");
    }
  };

  const goBack = () => {
    window.history.back();
  };

  return (
    <div className="fixed inset-0 bg-background">
      {/* Vertical Border Lines */}
      <div className="absolute inset-y-0 left-12 w-[2px] bg-white/20" />
      <div className="absolute inset-y-0 right-12 w-[2px] bg-white/20" />

      {/* Mission Info - Top Left */}
      <div className="absolute top-6 left-16 space-y-1 font-mono z-10">
        <div className="text-sm text-muted">MISSION DAY</div>
        <div className="text-xl font-bold bg-secondary/50 px-3 py-1 rounded">
          SOL {missionDay}
        </div>
      </div>

      {/* Mission Info - Top Right */}
      <div className="absolute top-6 right-16 text-right font-mono z-10">
        <div className="text-sm text-muted">TIME {currentTime}</div>
        <div className="text-sm text-muted">LOG ENTRY {'>'} WATNEY #{logNumber}</div>
      </div>

      {/* Location Info - Bottom Left */}
      <div className="absolute bottom-28 left-16 font-mono z-10">
        <div className="text-sm">HAB {'>'} BUNKS</div>
        <div className="text-xs text-muted mt-1">CONNECTED-{new Date().toISOString().replace(/[-:]/g, '').slice(0, 14)}</div>
      </div>

      {/* Back Button */}
      <button
        onClick={goBack}
        className="absolute top-6 left-6 z-10 p-2 rounded-full bg-secondary/50 hover:bg-secondary/80 transition-colors"
      >
        <ArrowLeft size={24} className="text-white" />
      </button>

      {/* Corner Lines */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 w-12 h-[2px] bg-white"></div>
        <div className="absolute top-0 left-0 w-[2px] h-12 bg-white"></div>
        <div className="absolute top-0 right-0 w-12 h-[2px] bg-white"></div>
        <div className="absolute top-0 right-0 w-[2px] h-12 bg-white"></div>
        <div className="absolute bottom-0 left-0 w-12 h-[2px] bg-white"></div>
        <div className="absolute bottom-0 left-0 w-[2px] h-12 bg-white"></div>
        <div className="absolute bottom-0 right-0 w-12 h-[2px] bg-white"></div>
        <div className="absolute bottom-0 right-0 w-[2px] h-12 bg-white"></div>
      </div>

      {permissionError ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center space-y-4">
            <p className="text-muted text-lg font-mono">Camera access needed</p>
            <button
              onClick={startCamera}
              className="px-4 py-2 bg-accent text-accent-foreground rounded-md font-mono"
            >
              Grant Access
            </button>
          </div>
        </div>
      ) : (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />
      )}

      {/* Recording Indicator */}
      {isRecording && (
        <div className="absolute top-6 right-16 flex items-center gap-2">
          <Circle size={12} className="text-red-500 animate-pulse" fill="currentColor" />
          <span className="font-mono text-red-500 text-xl font-bold">REC {formatTime(recordingTime)}</span>
        </div>
      )}

      {/* Control Panel */}
      <div className="absolute bottom-0 left-0 right-0 p-6 glassmorphism">
        <div className="flex justify-between items-center">
          {/* Delete Button */}
          {hasRecording && !isRecording && (
            <button
              onClick={deleteRecording}
              className="p-3 rounded-full bg-destructive/20 hover:bg-destructive/40 text-destructive-foreground transition-all duration-300"
            >
              <Trash size={24} />
            </button>
          )}

          {/* Center Controls */}
          <div className="flex justify-center items-center gap-6 flex-1">
            {(!isRecording && hasRecording) && (
              <>
                <button
                  className="p-3 rounded-full bg-secondary text-muted hover:text-foreground transition-all duration-300"
                  onClick={() => videoRef.current && (videoRef.current.currentTime -= 5)}
                >
                  <Rewind size={24} />
                </button>

                <button
                  onClick={togglePlayPause}
                  className="p-3 rounded-full bg-secondary text-muted hover:text-foreground transition-all duration-300"
                >
                  {isPlaying ? <Pause size={24} /> : <Play size={24} />}
                </button>

                <button
                  className="p-3 rounded-full bg-secondary text-muted hover:text-foreground transition-all duration-300"
                  onClick={() => videoRef.current && (videoRef.current.currentTime += 5)}
                >
                  <FastForward size={24} />
                </button>
              </>
            )}

            <button
              onClick={isRecording ? stopRecording : startRecording}
              className={cn(
                "p-3 rounded-full transition-all duration-300",
                isRecording ? "bg-destructive text-destructive-foreground" : "bg-accent text-accent-foreground"
              )}
            >
              <Video size={24} />
            </button>
          </div>

          {/* Empty div for spacing */}
          <div className="w-[48px]" />
        </div>
      </div>
    </div>
  );
};

export default VideoRecorder;

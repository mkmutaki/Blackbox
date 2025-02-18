
import { useState, useRef, useEffect } from 'react';
import { Video, Pause, Play, Rewind, FastForward, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from "sonner";

const VideoRecorder = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [permissionError, setPermissionError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
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
      console.log('Recording finished:', url);
      setRecordingTime(0);
      toast.success("Recording saved successfully");
    };

    mediaRecorder.start();
    mediaRecorderRef.current = mediaRecorder;
    setIsRecording(true);
    setIsPaused(false);
    toast.success("Recording started");
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-background">
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
          <span className="font-mono text-red-500">REC {formatTime(recordingTime)}</span>
        </div>
      )}

      {/* Control Panel */}
      <div className="absolute bottom-0 left-0 right-0 p-6 glassmorphism">
        <div className="flex justify-center items-center gap-6">
          {!isRecording && (
            <>
              <button
                className="p-3 rounded-full bg-secondary text-muted hover:text-foreground transition-all duration-300"
                onClick={() => videoRef.current?.currentTime && (videoRef.current.currentTime -= 5)}
              >
                <Rewind size={24} />
              </button>

              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className="p-3 rounded-full bg-secondary text-muted hover:text-foreground transition-all duration-300"
              >
                {isPlaying ? <Pause size={24} /> : <Play size={24} />}
              </button>

              <button
                className="p-3 rounded-full bg-secondary text-muted hover:text-foreground transition-all duration-300"
                onClick={() => videoRef.current?.currentTime && (videoRef.current.currentTime += 5)}
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
      </div>
    </div>
  );
};

export default VideoRecorder;

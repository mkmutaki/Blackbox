
import { useState, useRef } from 'react';
import { Camera, CameraOff, Video } from 'lucide-react';
import { cn } from '@/lib/utils';

const VideoRecorder = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      streamRef.current = stream;
      setIsCameraOn(true);
    } catch (err) {
      console.error('Error accessing camera:', err);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      streamRef.current = null;
      setIsCameraOn(false);
    }
  };

  const toggleCamera = () => {
    if (isCameraOn) {
      stopCamera();
    } else {
      startCamera();
    }
  };

  const startRecording = () => {
    if (!streamRef.current) return;

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
      // Here we would normally save the video or upload it
      console.log('Recording finished:', url);
    };

    mediaRecorder.start();
    mediaRecorderRef.current = mediaRecorder;
    setIsRecording(true);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  return (
    <div className="animate-fade-up">
      <div className="video-container">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />
        <div className="absolute bottom-0 left-0 right-0 p-4 glassmorphism">
          <div className="flex justify-center gap-4">
            <button
              onClick={toggleCamera}
              className={cn(
                "p-3 rounded-full transition-all duration-300",
                isCameraOn ? "bg-accent text-accent-foreground" : "bg-secondary text-muted hover:text-foreground"
              )}
            >
              {isCameraOn ? <CameraOff size={24} /> : <Camera size={24} />}
            </button>
            <button
              onClick={isRecording ? stopRecording : startRecording}
              disabled={!isCameraOn}
              className={cn(
                "p-3 rounded-full transition-all duration-300",
                isRecording ? "bg-destructive text-destructive-foreground" : "bg-accent text-accent-foreground",
                !isCameraOn && "opacity-50 cursor-not-allowed"
              )}
            >
              <Video size={24} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoRecorder;

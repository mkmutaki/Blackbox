import { useState, useRef, useEffect } from 'react';
import { Video, Pause, Play, Rewind, FastForward, Circle, Trash, ArrowLeft, Save } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from "sonner";
import { useAuth } from '@/context/AuthContext';
import { useNavigate } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const VideoRecorder = () => {
  const { token } = useAuth();
  const navigate = useNavigate();
  
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [permissionError, setPermissionError] = useState(false);
  const [hasRecording, setHasRecording] = useState(false);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState<string | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<NodeJS.Timeout>();
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const encryptionKeyRef = useRef<CryptoKey | null>(null);
  const ivRef = useRef<Uint8Array | null>(null);

  // Add new state for mission data and dynamic connection ID
  const [missionDay, setMissionDay] = useState(0);
  const [currentTime, setCurrentTime] = useState("");
  const [logNumber, setLogNumber] = useState("009");
  const [randomDigits, setRandomDigits] = useState("0000");

  // Initialize encryption key on component mount
  useEffect(() => {
    const initEncryption = async () => {
      try {
        // Generate a random encryption key
        const key = await window.crypto.subtle.generateKey(
          {
            name: 'AES-GCM',
            length: 256
          },
          true, // extractable
          ['encrypt', 'decrypt']
        );
        
        encryptionKeyRef.current = key;
        
        // Generate a random initialization vector
        ivRef.current = window.crypto.getRandomValues(new Uint8Array(12));
        
        console.log('Encryption initialized');
      } catch (error) {
        console.error('Failed to initialize encryption:', error);
        toast.error('Failed to initialize encryption');
      }
    };
    
    initEncryption();
    
    // Start camera on component mount
    startCamera();
    
    // Clean up on unmount
    return () => {
      stopCamera();
    };
  }, []);

  // Calculate current SOL (mission day) based on current date
  useEffect(() => {
    const startDate = new Date('2025-01-01'); // Adjust this start date to the mission start date
    const today = new Date();
    const diffTime = today.getTime() - startDate.getTime(); 
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)); 
    setMissionDay(diffDays + 1); // Adding 1 to include the start day as day 1
  }, []);

  // Update time and random digits every second
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      const hours = now.getHours().toString().padStart(2, '0');
      const minutes = now.getMinutes().toString().padStart(2, '0');
      setCurrentTime(`${hours}${minutes}`);
      
      // Generate random 4-digit number for the connection ID
      const randomNumber = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      setRandomDigits(randomNumber);
    }, 1000);

    return () => clearInterval(timer);
  }, []);

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
      setRecordedBlob(blob);
      const url = URL.createObjectURL(blob);
      if (recordedVideoUrl) {
        URL.revokeObjectURL(recordedVideoUrl);
      }
      setRecordedVideoUrl(url);
      setHasRecording(true);
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

    // Start recording time interval
    recordingIntervalRef.current = setInterval(() => {
      setRecordingTime(prevTime => prevTime + 1);
    }, 1000);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsPaused(false);
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
      }
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

  // Function to encrypt video blob
  const encryptBlob = async (blob: Blob): Promise<{ encryptedData: ArrayBuffer; iv: Uint8Array; jwk: JsonWebKey }> => {
    if (!encryptionKeyRef.current || !ivRef.current) {
      throw new Error('Encryption not initialized');
    }

    try {
      // Convert blob to ArrayBuffer
      const arrayBuffer = await blob.arrayBuffer();

      // Encrypt the video data
      const encryptedData = await window.crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv: ivRef.current,
          tagLength: 128
        },
        encryptionKeyRef.current,
        arrayBuffer
      );

      // Export the key as JWK (JSON Web Key)
      const jwk = await window.crypto.subtle.exportKey('jwk', encryptionKeyRef.current);

      return {
        encryptedData,
        iv: ivRef.current,
        jwk
      };
    } catch (error) {
      console.error('Encryption error:', error);
      throw new Error('Failed to encrypt video');
    }
  };

  const saveRecording = async () => {
    if (!recordedBlob) {
      toast.error("No recording to save");
      return;
    }

    try {
      setIsUploading(true);
      toast.info("Encrypting video...");

      // Encrypt the video
      const { encryptedData, iv, jwk } = await encryptBlob(recordedBlob);
      
      // Convert the encrypted data to blob
      const encryptedBlob = new Blob([encryptedData], { type: 'application/octet-stream' });

      // Create a FormData object for upload
      const formData = new FormData();
      formData.append('file', encryptedBlob, `recording_${Date.now()}.encrypted`);
      formData.append('iv', Array.from(iv).toString());
      formData.append('jwk', JSON.stringify(jwk));
      formData.append('title', `SOL ${missionDay} LOG #${logNumber}`);
      formData.append('missionDay', missionDay.toString());
      formData.append('entryNumber', logNumber);

      toast.info("Uploading encrypted video...");

      // Upload to server
      const response = await fetch(`${API_URL}/videos`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload failed');
      }

      toast.success("Video log saved successfully");
      
      // Navigate back to the home page after successful upload
      navigate('/');
    } catch (error) {
      console.error('Error saving recording:', error);
      toast.error(error instanceof Error ? error.message : "Error saving recording");
    } finally {
      setIsUploading(false);
    }
  };

  const deleteRecording = () => {
    if (recordedVideoUrl) {
      URL.revokeObjectURL(recordedVideoUrl);
      setRecordedVideoUrl(null);
      setRecordedBlob(null);
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
    if (window.history.length > 1) {
      window.history.back();
    } else {
      navigate('/');
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
  };

  const handlePlay = () => {
    setIsPlaying(true);
  };

  const handlePause = () => {
    setIsPlaying(false);
  };

  return (
    <div className="fixed inset-0 bg-background">
      {/* Vertical Border Lines */}
      <div className="absolute inset-y-0 left-12 w-[2px] bg-white/60 my-[30px]" />
      <div className="absolute inset-y-0 right-12 w-[2px] bg-white/60 my-[30px]" />

      {/* Mission Info - Top Left */}
      <div className="absolute top-6 left-16 space-y-1 font-mono z-10">
        <div className="text-lg text-grey-500 text-shadow text-shadow-white">MISSION DAY</div>
        <div className="text-3xl font-bold bg-secondary/50 px-3 py-1 rounded text-shadow text-shadow-white">SOL {missionDay} </div>
      </div>

      {/* Mission Info - Top Right */}
      <div className="absolute top-6 right-16 text-right font-mono z-10">
        <div className="mb-2 text-xl text-grey-500 text-shadow text-shadow-white">
          TIME {currentTime.slice(0, 2)}
          <span className="animate-[pulse_1s_ease-in-out_infinite]">:</span>
          {currentTime.slice(2, 4)}
        </div>
        <div className="text-lg text-grey-500 text-shadow text-shadow-white">LOG ENTRY {'>'} WATNEY #{logNumber}</div>
      </div>

      {/* Connection ID - Bottom */}
      <div className="absolute bottom-10 left-16 font-mono z-10">
        <div className="text-sm text-grey-500 flex items-center text-shadow text-shadow-white">
          CONNECTED-
          <span>{new Date().toISOString().replace(/[-:]/g, '').slice(0, 10)}</span>
          <span>{randomDigits}</span>
        </div>
      </div>

      {permissionError ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center space-y-4">
            <p className="text-grey-500 text-lg font-mono">Camera access needed</p>
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
          onEnded={handleEnded}
          onPlay={handlePlay}
          onPause={handlePause}
          controls={false}
        />
      )}

      {/* Back Button */}
      {!hasRecording && (
        <button
          onClick={goBack}
          className="absolute bottom-[31px] left-[44%] -translate-x-1/2 flex items-center p-3 rounded-full bg-secondary/50 hover:bg-accent/50 transition-colors"
        >
          <ArrowLeft size={24} className="text-white" />
        </button>
      )}

      {/* Recording Indicator */}
      {isRecording && (
        <div className="absolute top-6 right-48 flex items-center gap-2">
          <Circle size={12} className="text-red-500 animate-pulse" fill="currentColor" />
          <span className="font-mono text-red-500 text-xl font-bold">REC {formatTime(recordingTime)}</span>
        </div>
      )}

      {/* Floating Record Button */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-6">
      
        {(!isRecording && hasRecording) && (
          <>
            <button
              className="p-3 rounded-full bg-secondary/50 text-muted hover:text-foreground transition-all duration-300"
              onClick={() => videoRef.current && (videoRef.current.currentTime -= 5)}
            >
              <Rewind size={24} />
            </button>

            <button
              onClick={togglePlayPause}
              className="p-3 rounded-full bg-secondary/50 text-muted hover:text-foreground transition-all duration-300"
            >
              {isPlaying ? <Pause size={24} /> : <Play size={24} />}
            </button>

            <button
              className="p-3 rounded-full bg-secondary/50 text-muted hover:text-foreground transition-all duration-300"
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
            isRecording ? "bg-destructive/50 text-destructive-foreground" : "bg-accent/50 text-accent-foreground"
          )}
          disabled={isUploading}
        >
          <Video size={24} />
        </button>

        {hasRecording && !isRecording && (
            <> 
            <button
              onClick={saveRecording}
              className="p-3 rounded-full bg-success/20 hover:bg-success/40 text-success-foreground transition-all duration-300"
              disabled={isUploading}
            >
              {isUploading ? (
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-solid border-current border-r-transparent"></div>
              ) : (
                <Save size={24} />
              )}
            </button>
            
            <button
              onClick={deleteRecording}
              className="p-3 rounded-full bg-destructive/20 hover:bg-destructive/40 text-destructive-foreground transition-all duration-300"
              disabled={isUploading}
            >
              <Trash size={24} />
            </button>
            </>
        )}
      </div>
    </div>
  );
};

export default VideoRecorder;

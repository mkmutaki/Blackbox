import { useState, useRef, useEffect } from 'react';
import { Video, Pause, Play, Rewind, FastForward, Circle, Trash, ArrowLeft, Save } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from "sonner";
import { post } from '@/services/api';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { useRecording } from '@/context/RecordingContext';
import { useLogoutTimer } from '@/hooks/useLogoutTimer';

const generateEncryptionKey = async () => {
  return await window.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
};

const exportKey = async (key: CryptoKey) => {
  const exported = await window.crypto.subtle.exportKey('jwk', key);
  return exported;
};

const encryptVideo = async (blob: Blob) => {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const key = await generateEncryptionKey();
  const exportedKey = await exportKey(key);
  const arrayBuffer = await blob.arrayBuffer();
  const encryptedData = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    arrayBuffer
  );
  const encryptedBlob = new Blob([encryptedData], { type: 'application/octet-stream' });
  
  return {
    encryptedBlob,
    iv: Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join(''),
    jwk: exportedKey
  };
};

const VideoRecorder = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [permissionError, setPermissionError] = useState(false);
  const [hasRecording, setHasRecording] = useState(false);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [videoTitle, setVideoTitle] = useState("");
  
  const { setIsRecording: setGlobalIsRecording } = useRecording();
  const { resetTimer } = useLogoutTimer();
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const recordedBlobRef = useRef<Blob | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  
  const { isLoggedIn, user } = useAuth();
  const navigate = useNavigate();

  const [missionDay, setMissionDay] = useState(0);
  const [currentTime, setCurrentTime] = useState("");
  const [logNumber, setLogNumber] = useState("009");
  const [randomDigits, setRandomDigits] = useState("0000");

  useEffect(() => {
    const startDate = new Date('2025-01-01');
    const today = new Date();
    const diffTime = today.getTime() - startDate.getTime(); 
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)); 
    setMissionDay(diffDays + 1);
  }, []);

  useEffect(() => {
    if (!isLoggedIn) {
      toast.error("You must be logged in to record videos");
      navigate('/login');
    } else {
      startCamera();
    }
    
    return () => {
      stopCamera();
    };
  }, [isLoggedIn, navigate]);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      const hours = now.getHours().toString().padStart(2, '0');
      const minutes = now.getMinutes().toString().padStart(2, '0');
      setCurrentTime(`${hours}${minutes}`);
      
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
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 }
        },
        audio: false
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      streamRef.current = stream;
      toast.success("Camera access granted");

      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        audioStreamRef.current = audioStream;
        audioStream.getAudioTracks().forEach(track => {
          track.enabled = false;
        });
      } catch (audioErr) {
        console.log('Audio permission not granted yet:', audioErr);
      }
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

  const startRecording = async () => {
    resetTimer();
    
    if (!streamRef.current) {
      toast.error("No camera access. Please allow camera access and try again.");
      startCamera();
      return;
    }
    
    try {
      let audioTracks: MediaStreamTrack[] = [];
      
      if (audioStreamRef.current) {
        audioTracks = audioStreamRef.current.getAudioTracks();
        audioTracks.forEach(track => {
          track.enabled = true;
        });
      } else {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        audioStreamRef.current = audioStream;
        audioTracks = audioStream.getAudioTracks();
      }
      
      const videoTracks = streamRef.current.getVideoTracks();
      
      const recorderStream = new MediaStream([
        ...videoTracks.map(track => {
          const videoTrackClone = track.clone();
          
          if (videoTrackClone.applyConstraints) {
            videoTrackClone.applyConstraints({
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              frameRate: { ideal: 30 }
            }).catch(e => console.log('Could not apply optimal recording constraints:', e));
          }
          return videoTrackClone;
        }),
        ...audioTracks
      ]);

      const mediaRecorder = new MediaRecorder(recorderStream, {
        mimeType: 'video/webm;codecs=vp9,opus',
        videoBitsPerSecond: 2500000,
        audioBitsPerSecond: 128000,
      });
      
      const chunks: BlobPart[] = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        if (audioStreamRef.current) {
          audioStreamRef.current.getAudioTracks().forEach(track => {
            track.enabled = false;
          });
        }
        
        const blob = new Blob(chunks, { type: 'video/webm' });
        
        if (recordedVideoUrl) {
          URL.revokeObjectURL(recordedVideoUrl);
        }
        
        const url = URL.createObjectURL(blob);
        recordedBlobRef.current = blob;
        setRecordedVideoUrl(url);
        setHasRecording(true);
        setRecordingTime(0);
        
        if (videoRef.current) {
          videoRef.current.srcObject = null;
          videoRef.current.src = url;
          videoRef.current.preload = "auto";
          videoRef.current.load();
          
          videoRef.current.onloadedmetadata = () => {
            toast.success("Recording saved successfully");
          };
        }
        
        setVideoTitle(`Mission Log Entry`);
      };

      mediaRecorder.start(1000); 
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
      setIsPaused(false);
      setHasRecording(false);
      toast.success("Recording started");

      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(prevTime => prevTime + 1);
      }, 1000);
    } catch (err) {
      console.error('Error starting recording:', err);
      toast.error("Could not access microphone. Please check your permissions.");
    }
  };

  const stopRecording = () => {
    resetTimer();
    
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
    resetTimer();
    
    if (!hasRecording || !videoRef.current) return;
    
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      const playPromise = videoRef.current.play();
      
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setIsPlaying(true);
          })
          .catch(error => {
            console.error("Playback failed:", error);
            toast.error("Playback couldn't start. Try again.");
            setIsPlaying(false);
          });
      }
    }
  };

  const saveRecording = async () => {
    resetTimer();
    
    if (!recordedBlobRef.current) {
      toast.error("No recording to save");
      return;
    }
    
    try {
      setIsSaving(true);
      
      const blob = recordedBlobRef.current;
      const { encryptedBlob, iv, jwk } = await encryptVideo(blob);
      
      const formData = new FormData();
      formData.append('file', encryptedBlob, `encrypted_video_${Date.now()}.dat`);
      formData.append('iv', iv);
      formData.append('jwk', JSON.stringify(jwk));
      formData.append('title', videoTitle || `Mission Log Entry`);

      const response = await post('/videos', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        }
      });
      
      toast.success("Recording saved to database");
      
      setGlobalIsRecording(false);
      navigate('/');
    } catch (error) {
      console.error('Error saving recording:', error);
      toast.error("Error saving recording to server");
    } finally {
      setIsSaving(false);
    }
  };

  const deleteRecording = () => {
    resetTimer();
    
    if (recordedVideoUrl) {
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.currentTime = 0;
        
        URL.revokeObjectURL(recordedVideoUrl);
        
        setRecordedVideoUrl(null);
        setHasRecording(false);
        recordedBlobRef.current = null;
        setIsPlaying(false);
        
        requestAnimationFrame(() => {
          if (videoRef.current) {
            videoRef.current.src = '';
            videoRef.current.srcObject = streamRef.current;
          }
        });
      }
      
      toast.success("Recording deleted");
    }
  };

  const goBack = () => {
    resetTimer();
    
    setGlobalIsRecording(false);
    navigate('/');
  };

  const seekVideo = (seconds: number) => {
    resetTimer();
    if (videoRef.current) {
      videoRef.current.currentTime += seconds;
    }
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    resetTimer();
    setVideoTitle(e.target.value);
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
    <div className="fixed inset-0 bg-background z-50">
      <div className="absolute inset-y-0 left-2 sm:left-12 w-[1px] sm:w-[2px] bg-white/60 my-[15px] sm:my-[30px]" />
      <div className="absolute inset-y-0 right-2 sm:right-12 w-[1px] sm:w-[2px] bg-white/60 my-[15px] sm:my-[30px]" />

      <div className="absolute top-4 left-4 sm:top-6 sm:left-16 space-y-1 font-mono z-10">
        <div className="text-sm sm:text-lg text-grey-500 text-shadow text-shadow-white">MISSION DAY</div>
        <div className="text-lg sm:text-3xl font-bold bg-secondary/50 px-2 sm:px-3 py-1 rounded text-shadow text-shadow-white">SOL {missionDay}</div>
        {isRecording && (
          <div className="flex items-center gap-2 mt-2">
            <Circle size={10} className="text-red-500 animate-pulse sm:w-3 sm:h-3" fill="currentColor" />
            <span className="font-mono text-red-500 text-sm sm:text-xl font-bold">REC {formatTime(recordingTime)}</span>
          </div>
        )}
      </div>

      <div className="absolute top-4 right-4 sm:top-6 sm:right-16 text-right font-mono z-10">
        <div className="mb-1 sm:mb-2 text-sm sm:text-xl text-grey-500 text-shadow text-shadow-white">
          TIME {currentTime.slice(0, 2)}
          <span className="animate-[pulse_1s_ease-in-out_infinite]">:</span>
          {currentTime.slice(2, 4)}
        </div>
        <div className="text-xs sm:text-lg text-grey-500 text-shadow text-shadow-white">
          <span className="block sm:inline">LOG ENTRY</span>
          <span className="block sm:inline"> {'>'} {user?.profile?.username?.toUpperCase() || 'GHOST'} #{logNumber}</span>
        </div>
      </div>

      <div className="absolute bottom-8 sm:bottom-10 left-4 sm:left-16 font-mono z-10">
        <div className="text-xs sm:text-sm text-grey-500 flex items-center text-shadow text-shadow-white">
          <span className="hidden sm:inline">CONNECTED-</span>
          <span className="sm:hidden">CON-</span>
          <span>{new Date().toISOString().replace(/[-:]/g, '').slice(0, 8)}</span>
          <span className="hidden sm:inline">{new Date().toISOString().replace(/[-:]/g, '').slice(8, 10)}</span>
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
          muted={isRecording}
          className="w-full h-full object-cover"
          onEnded={handleEnded}
          onPlay={handlePlay}
          onPause={handlePause}
          controls={false}
          preload="auto"
          disablePictureInPicture={true}
          disableRemotePlayback={true}
        />
      )}

      {!hasRecording && (
        <button
          onClick={goBack}
          className="absolute bottom-6 sm:bottom-[31px] right-4 sm:right-12 md:right-16 lg:right-8 flex items-center p-2 sm:p-3 rounded-full bg-secondary/50 hover:bg-accent/50 transition-colors"
          type="button"
        >
          <ArrowLeft size={20} className="text-white sm:w-6 sm:h-6" />
        </button>
      )}

      {hasRecording && !isRecording && (
        <div className="absolute top-4 sm:top-6 left-1/2 -translate-x-1/2 w-72 sm:w-80 px-4 sm:px-0">
          <input
            type="text"
            value={videoTitle}
            onChange={handleTitleChange}
            placeholder="Enter a title for your recording"
            className="w-full bg-secondary/50 border border-accent/50 rounded px-3 py-2 font-mono text-center text-sm sm:text-base"
          />
        </div>
      )}

      <div className="absolute bottom-4 sm:bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-3 sm:gap-6">
      
        {(!isRecording && hasRecording) && (
          <>
            <button
              className="p-2 sm:p-3 rounded-full bg-secondary/50 text-muted hover:text-foreground transition-all duration-300"
              onClick={() => seekVideo(-5)}
              type="button"
            >
              <Rewind size={20} className="sm:w-6 sm:h-6" />
            </button>

            <button
              onClick={togglePlayPause}
              className="p-2 sm:p-3 rounded-full bg-secondary/50 text-muted hover:text-foreground transition-all duration-300"
              type="button"
            >
              {isPlaying ? <Pause size={20} className="sm:w-6 sm:h-6" /> : <Play size={20} className="sm:w-6 sm:h-6" />}
            </button>

            <button
              className="p-2 sm:p-3 rounded-full bg-secondary/50 text-muted hover:text-foreground transition-all duration-300"
              onClick={() => seekVideo(5)}
              type="button"
            >
              <FastForward size={20} className="sm:w-6 sm:h-6" />
            </button>
            
            <button
              onClick={saveRecording}
              className="p-2 sm:p-3 rounded-full bg-success/20 hover:bg-success/40 text-success-foreground transition-all duration-300"
              disabled={isSaving}
              type="button"
            >
              {isSaving ? (
                <div className="w-5 h-5 sm:w-6 sm:h-6 border-2 border-t-transparent rounded-full animate-spin" />
              ) : (
                <Save size={20} className="sm:w-6 sm:h-6" />
              )}
            </button>
            
            <button
              onClick={deleteRecording}
              className="p-2 sm:p-3 rounded-full bg-destructive/20 hover:bg-destructive/40 text-destructive-foreground transition-all duration-300"
              disabled={isSaving}
              type="button"
            >
              <Trash size={20} className="sm:w-6 sm:h-6" />
            </button>
          </>
        )}

        {(isRecording || !hasRecording) && (
          <button
            onClick={isRecording ? stopRecording : startRecording}
            className={cn(
              "p-2 sm:p-3 rounded-full transition-all duration-300",
              isRecording ? "bg-destructive/50 text-destructive-foreground" : "bg-accent/50 text-accent-foreground"
            )}
            disabled={isSaving}
            type="button"
          >
            <Video size={20} className="sm:w-6 sm:h-6" />
          </button>
        )}
      </div>
    </div>
  );
};

export default VideoRecorder;
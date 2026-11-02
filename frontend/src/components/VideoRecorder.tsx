import { useState, useRef, useEffect } from 'react';
import { Video, Pause, Play, Rewind, FastForward, Trash2, ArrowLeft, Check, Focus } from 'lucide-react';
import { cn, getSynodicDay } from '@/lib/utils';
import { toast } from "sonner";
import { get, post } from '@/services/api';
import { useAuth } from '@/hooks/useAuth';
import { resolveVideoDuration } from '@/lib/videoDuration';
import { useNavigate } from 'react-router-dom';
import { useRecording } from '@/context/RecordingContext';
import { encryptVideo } from '@/lib/videoCrypto';
import { CAP_WARNING_SECONDS, MAX_RECORDING_SECONDS, cleanDeviceLabel, drawRecorderHud, formatTime } from '@/lib/recorderHud';
import { AudioMeter } from '@/components/AudioMeter';
import { useMicLevel } from '@/hooks/useMicLevel';

const HUD_TEXT = "text-[#F2EEE6] [text-shadow:0_0_14px_rgba(255,236,214,.28),0_1px_2px_rgba(0,0,0,.65)]";
const GLASS = "border border-[rgba(242,238,230,.18)] bg-[rgba(20,18,16,.55)] backdrop-blur-md";
const EASE = "duration-300 ease-[cubic-bezier(.2,.7,.2,1)] motion-reduce:transition-none";
const FOCUS_RING = "focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-accent";
const ROUND_BUTTON = cn(
  "flex h-12 w-12 items-center justify-center rounded-full text-[#F2EEE6] transition-colors hover:bg-[rgba(48,44,40,.7)] disabled:opacity-40",
  GLASS, EASE, FOCUS_RING
);
const BIG_BUTTON = cn(
  "flex h-[76px] w-[76px] items-center justify-center rounded-full border-2 border-[rgba(242,238,230,.85)] bg-[rgba(20,18,16,.35)] backdrop-blur-md shadow-[0_0_0_6px_rgba(242,238,230,.06),0_10px_30px_rgba(0,0,0,.35)] disabled:opacity-60",
  FOCUS_RING
);
// The track is a gradient drawn 4px tall inside a taller input, so it's easy to grab.
const SCRUBBER = cn(
  "h-5 flex-1 cursor-pointer appearance-none bg-transparent disabled:cursor-default disabled:opacity-50",
  "[&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#F2EEE6] [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(100,255,218,.6)]",
  "[&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-[#F2EEE6]",
  FOCUS_RING
);
const PILL_BUTTON = cn("flex h-11 items-center gap-2 whitespace-nowrap rounded-full px-5 text-xs tracking-[.16em] transition-colors disabled:opacity-60", EASE, FOCUS_RING);

const Crosshair = ({ side }: { side: 'left' | 'right' }) => (
  <svg
    aria-hidden="true"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    className={cn("absolute top-1/2 hidden -translate-y-1/2 min-[820px]:block", side === 'left' ? "left-[196px]" : "right-[196px]")}
  >
    <path
      d={side === 'left' ? "M12 2v7M12 15v7M2 12h7" : "M12 2v7M12 15v7M15 12h7"}
      stroke="rgba(242,238,230,.75)"
      strokeWidth="1.5"
      fill="none"
    />
  </svg>
);

const makeStamp = (now: Date) => {
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  return `${date}T${Math.floor(Math.random() * 100000).toString().padStart(5, '0')}`;
};

const VideoRecorder = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [reviewDuration, setReviewDuration] = useState(0);
  const [reviewPosition, setReviewPosition] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [permissionError, setPermissionError] = useState(false);
  const [hasRecording, setHasRecording] = useState(false);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [videoTitle, setVideoTitle] = useState("");
  const [hudVisible, setHudVisible] = useState(true);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [cameraLabel, setCameraLabel] = useState("");
  const [micLabel, setMicLabel] = useState("");
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [cameraIndex, setCameraIndex] = useState(0);

  const { setIsRecording: setGlobalIsRecording } = useRecording();

  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const recordedBlobRef = useRef<Blob | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const canvasStreamRef = useRef<MediaStream | null>(null);
  const hiddenVideoRef = useRef<HTMLVideoElement | null>(null);
  const recordingVideoTrackRef = useRef<MediaStreamTrack | null>(null);
  const missionDayRef = useRef(0);
  const logNumberRef = useRef("---");
  const currentTimeRef = useRef("");
  const stampRef = useRef("");
  const recordingTimeRef = useRef(0);
  const hudVisibleRef = useRef(true);
  const cameraLabelRef = useRef("");
  const micLabelRef = useRef("");
  const micDbRef = useRef(0);
  // Bumped on every camera (re)start and on unmount, so a getUserMedia call
  // that resolves late can tell it has been superseded and release its tracks.
  const cameraGenRef = useRef(0);

  const { isLoggedIn, user } = useAuth();
  const navigate = useNavigate();

  const [missionDay, setMissionDay] = useState(0);
  const [currentTime, setCurrentTime] = useState("");
  const [colonOn, setColonOn] = useState(true);
  const [logNumber, setLogNumber] = useState("---");
  const year = new Date().getFullYear();
  const [stamp, setStamp] = useState("");

  const username = (user?.profile?.username || 'GHOST').toUpperCase();

  // Shared by the on-screen meter and the one drawn into the recording.
  const micDb = useMicLevel(micStream);
  micDbRef.current = micDb;
  const micLiveRef = useRef(false);
  micLiveRef.current = micStream !== null;

  useEffect(() => {
    // Same rule the backend stamps entries with: days since Jan 1 of this year.
    const day = getSynodicDay();
    setMissionDay(day);
    missionDayRef.current = day;
  }, []);

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return;
    // This recording will be the account's next log: saved count + 1.
    get<unknown[]>('/videos')
      .then((videos) => {
        const next = (videos.length + 1).toString().padStart(3, '0');
        setLogNumber(next);
        logNumberRef.current = next;
      })
      .catch((err) => console.error('Failed to fetch log count:', err));
  }, [isLoggedIn]);

  useEffect(() => {
    if (!isLoggedIn) {
      toast.error("You must be logged in to record videos");
      navigate('/login');
    } else {
      startCamera();
    }

    return () => {
      cameraGenRef.current += 1;
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
      }
      stopOverlayCapture();
      stopCamera();
      stopMicrophone();
    };
  }, [isLoggedIn, navigate]);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const hours = now.getHours().toString().padStart(2, '0');
      const minutes = now.getMinutes().toString().padStart(2, '0');
      const time = `${hours}${minutes}`;
      setCurrentTime(time);
      currentTimeRef.current = time;
      setColonOn(now.getSeconds() % 2 === 0);

      const next = makeStamp(now);
      setStamp(next);
      stampRef.current = next;
    };
    tick();
    const timer = setInterval(tick, 1000);

    return () => clearInterval(timer);
  }, []);

  const startCamera = async (deviceId?: string) => {
    const gen = ++cameraGenRef.current;
    try {
      setPermissionError(false);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 }
        },
        audio: false
      });

      if (gen !== cameraGenRef.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      streamRef.current = stream;
      const videoTrack = stream.getVideoTracks()[0];
      const label = cleanDeviceLabel(videoTrack?.label);
      setCameraLabel(label);
      cameraLabelRef.current = label;

      if (!audioStreamRef.current) {
        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          if (gen !== cameraGenRef.current) {
            audioStream.getTracks().forEach(track => track.stop());
            return;
          }
          // Left enabled so the HUD meter can show the mic is live before
          // recording; MediaRecorder only receives it once recording starts.
          audioStreamRef.current = audioStream;
          setMicStream(audioStream);
          const mic = cleanDeviceLabel(audioStream.getAudioTracks()[0]?.label);
          setMicLabel(mic);
          micLabelRef.current = mic;
        } catch (audioErr) {
          console.log('Audio permission not granted yet:', audioErr);
        }
      }

      // Device labels are only filled in once permission is granted.
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter(device => device.kind === 'videoinput');
      setVideoDevices(cameras);
      const active = cameras.findIndex(camera => camera.deviceId === videoTrack?.getSettings().deviceId);
      setCameraIndex(active >= 0 ? active : 0);
    } catch (err) {
      if (gen !== cameraGenRef.current) return;
      console.error('Error accessing camera:', err);
      setPermissionError(true);
      setIsPlaying(false);

      if (err instanceof Error && err.name === "NotAllowedError") {
        toast.error("Camera permission was denied. Please enable it in your browser settings.");
      } else if (err instanceof Error && err.name === "NotFoundError") {
        toast.error("No camera found. Please connect a camera and try again.");
      } else {
        toast.error("Error accessing camera. Please try again.");
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

  const stopMicrophone = () => {
    audioStreamRef.current?.getTracks().forEach(track => track.stop());
    audioStreamRef.current = null;
    setMicStream(null);
  };

  const switchCamera = () => {
    if (isRecording || hasRecording || videoDevices.length < 2) return;
    const next = videoDevices[(cameraIndex + 1) % videoDevices.length];
    stopCamera();
    startCamera(next.deviceId);
  };

  // Applies to the current take only; every new entry starts with the HUD on.
  const setHud = (visible: boolean) => {
    setHudVisible(visible);
    hudVisibleRef.current = visible;
  };

  const toggleHud = () => setHud(!hudVisible);

  const stopOverlayCapture = () => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    canvasStreamRef.current?.getTracks().forEach(track => track.stop());
    canvasStreamRef.current = null;
    recordingVideoTrackRef.current?.stop();
    recordingVideoTrackRef.current = null;
    if (hiddenVideoRef.current) {
      hiddenVideoRef.current.srcObject = null;
      hiddenVideoRef.current = null;
    }
  };

  const startRecording = async () => {
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
        setMicStream(audioStream);
        const mic = cleanDeviceLabel(audioStream.getAudioTracks()[0]?.label);
        setMicLabel(mic);
        micLabelRef.current = mic;
        audioTracks = audioStream.getAudioTracks();
      }

      // Composite the camera frame + HUD onto a canvas so the overlay is
      // burned into the recorded pixels; MediaRecorder never sees the DOM.
      const sourceVideoTrack = streamRef.current.getVideoTracks()[0];
      const recordingVideoTrack = sourceVideoTrack.clone();
      if (recordingVideoTrack.applyConstraints) {
        await recordingVideoTrack.applyConstraints({
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 }
        }).catch(e => console.log('Could not apply optimal recording constraints:', e));
      }
      recordingVideoTrackRef.current = recordingVideoTrack;

      const hiddenVideo = document.createElement('video');
      hiddenVideo.muted = true;
      hiddenVideo.playsInline = true;
      hiddenVideo.srcObject = new MediaStream([recordingVideoTrack]);
      await hiddenVideo.play();
      hiddenVideoRef.current = hiddenVideo;

      const { width, height } = recordingVideoTrack.getSettings();
      const canvas = document.createElement('canvas');
      canvas.width = width || 1280;
      canvas.height = height || 720;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Canvas 2D context unavailable');
      }

      recordingTimeRef.current = 0;

      const drawFrame = () => {
        ctx.drawImage(hiddenVideo, 0, 0, canvas.width, canvas.height);
        // The clean-feed toggle applies to the recording too, live.
        if (hudVisibleRef.current) {
          drawRecorderHud(ctx, canvas.width, canvas.height, {
            missionDay: missionDayRef.current,
            year: new Date().getFullYear(),
            currentTime: currentTimeRef.current,
            logNumber: logNumberRef.current,
            username,
            cameraLabel: cameraLabelRef.current,
            micLabel: micLabelRef.current,
            micDb: micDbRef.current,
            micLive: micLiveRef.current,
            stamp: stampRef.current,
          });
        }
        animationFrameRef.current = requestAnimationFrame(drawFrame);
      };
      drawFrame();

      const canvasStream = canvas.captureStream(30);
      canvasStreamRef.current = canvasStream;

      const recorderStream = new MediaStream([
        ...canvasStream.getVideoTracks(),
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
        stopOverlayCapture();

        const blob = new Blob(chunks, { type: 'video/webm' });

        if (recordedVideoUrl) {
          URL.revokeObjectURL(recordedVideoUrl);
        }

        const url = URL.createObjectURL(blob);
        recordedBlobRef.current = blob;
        setRecordedVideoUrl(url);
        setHasRecording(true);

        if (videoRef.current) {
          videoRef.current.srcObject = null;
          videoRef.current.src = url;
          videoRef.current.preload = "auto";
          videoRef.current.load();
        }
      };

      mediaRecorder.start(1000);
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);
      setHasRecording(false);

      recordingIntervalRef.current = setInterval(() => {
        const next = recordingTimeRef.current + 1;
        recordingTimeRef.current = next;
        if (next === MAX_RECORDING_SECONDS - CAP_WARNING_SECONDS) {
          toast.info(`${CAP_WARNING_SECONDS} seconds left in this take.`);
        }
        if (next >= MAX_RECORDING_SECONDS) {
          stopRecording();
          toast.info(`${formatTime(MAX_RECORDING_SECONDS)} limit reached. Your entry is ready to review.`);
        }
      }, 1000);
    } catch (err) {
      console.error('Error starting recording:', err);
      toast.error("Could not access microphone. Please check your permissions.");
      stopOverlayCapture();
    }
  };

  // Reads only refs, so the recording interval can call the copy it closed over.
  const stopRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;

    recorder.stop();
    setIsRecording(false);
    // Provisional until the take's real length is read in handleLoadedMetadata.
    setReviewDuration(recordingTimeRef.current);
    setReviewPosition(0);
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
  };

  const togglePlayPause = () => {
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
    if (!recordedBlobRef.current) {
      toast.error("No recording to save");
      return;
    }

    if (!videoTitle.trim()) {
      toast.error("Please enter a title for your mission log");
      return;
    }

    try {
      setIsSaving(true);

      const blob = recordedBlobRef.current;
      const { encryptedBlob, iv, jwk } = await encryptVideo(blob);

      // 1. Ask the backend for a presigned POST — it generates the storage
      // key server-side, so no client-supplied filename ever reaches S3.
      const { url, fields, key } = await post<{ url: string; fields: Record<string, string>; key: string }>(
        '/videos/presign',
        { contentType: 'application/octet-stream', contentLength: encryptedBlob.size }
      );

      // 2. Upload the ciphertext straight to storage. This goes directly to
      // the presigned URL, not through our API — Express never sees the file.
      const uploadForm = new FormData();
      Object.entries(fields).forEach(([field, value]) => uploadForm.append(field, value));
      uploadForm.append('file', encryptedBlob, `encrypted_video_${Date.now()}.dat`);

      const uploadResponse = await fetch(url, { method: 'POST', body: uploadForm });
      if (!uploadResponse.ok) {
        throw new Error(`Upload to storage failed: ${uploadResponse.status}`);
      }

      // 3. Only now does the backend learn about it — it confirms the
      // object actually exists before writing a database record.
      await post('/videos/finalize', {
        key,
        iv,
        jwk: JSON.stringify(jwk),
        title: videoTitle.trim(),
      });

      toast.success("Recording saved to database");

      setGlobalIsRecording(false);
    } catch (error) {
      console.error('Error saving recording:', error);
      toast.error("Error saving recording to server");
    } finally {
      setIsSaving(false);
    }
  };

  const deleteRecording = () => {
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

      // The next take is a new entry, so it starts with the HUD back on.
      setHud(true);
      toast.success("Take discarded");
    }
  };

  const goBack = () => {
    setGlobalIsRecording(false);
  };

  const seekVideo = (seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime += seconds;
    }
  };

  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = Number(e.target.value);
    if (videoRef.current) videoRef.current.currentTime = next;
    setReviewPosition(next);
  };

  // Arrow keys skip like the rewind and forward buttons do.
  const handleScrubKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    seekVideo(e.key === 'ArrowLeft' ? -5 : 5);
  };

  const syncReviewPosition = () => {
    if (videoRef.current && !videoRef.current.srcObject) {
      setReviewPosition(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    // The live camera fires this too; only a finished take needs its length read.
    if (!video || video.srcObject || !video.currentSrc.startsWith('blob:')) return;
    video.pause();
    resolveVideoDuration(video).then((length) => {
      if (videoRef.current !== video || video.srcObject) return;
      if (Number.isFinite(length)) setReviewDuration(length);
      setReviewPosition(0);
      video.play().catch(() => {});
    });
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setVideoTitle(e.target.value);
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !isSaving) saveRecording();
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

  const isReviewing = hasRecording && !isRecording;
  // The take already has the HUD burned in, so the live one steps aside in review.
  const showHud = !isReviewing && !permissionError;
  // The slider follows playback smoothly; timeupdate alone only fires ~4 times a second.
  useEffect(() => {
    if (!isReviewing || !isPlaying) return;
    let frame = requestAnimationFrame(function follow() {
      if (videoRef.current) setReviewPosition(videoRef.current.currentTime);
      frame = requestAnimationFrame(follow);
    });
    return () => cancelAnimationFrame(frame);
  }, [isReviewing, isPlaying]);

  const shownPosition = Math.min(reviewPosition, reviewDuration);
  const reviewProgress = reviewDuration > 0 ? (shownPosition / reviewDuration) * 100 : 0;
  const canSwitchCamera = videoDevices.length > 1 && !isRecording;

  const cameraReadout = (
    <>
      <span className="flex flex-col items-end gap-[3px]">
        <span className={cn("text-lg font-bold tracking-[.06em] transition-colors", canSwitchCamera && "group-hover:text-accent")}>
          CAM. {cameraIndex + 1}
        </span>
        {cameraLabel && (
          <span className="max-w-[280px] truncate text-[11px] tracking-[.14em] text-[rgba(242,238,230,.66)]">{cameraLabel}</span>
        )}
        <span className="max-w-[280px] truncate text-[11px] tracking-[.14em] text-[rgba(242,238,230,.66)]">
          MIC. {micLabel || 'OFF'}
        </span>
      </span>
      <span aria-hidden="true" className="text-[15px] text-[rgba(242,238,230,.8)]">←</span>
    </>
  );

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-[#120d09] font-mono text-[#F2EEE6]">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={!isReviewing}
        // Review shows the whole take, burned-in HUD included, rather than a crop.
        className={cn("absolute inset-0 h-full w-full", isReviewing ? "object-contain" : "object-cover")}
        onEnded={handleEnded}
        onLoadedMetadata={handleLoadedMetadata}
        onSeeked={syncReviewPosition}
        onPlay={handlePlay}
        onPause={handlePause}
        controls={false}
        preload="auto"
        disablePictureInPicture={true}
        disableRemotePlayback={true}
      />

      {/* Film treatment for the live view only; it isn't burned into recordings. */}
      {!isReviewing && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{ background: 'repeating-linear-gradient(0deg, rgba(255,255,255,.03) 0px, rgba(255,255,255,.03) 1px, transparent 1px, transparent 3px)' }}
        />
      )}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(ellipse at 50% 45%, transparent 52%, rgba(0,0,0,.62) 100%)' }}
      />
      {isReviewing && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-72 bg-gradient-to-t from-black/70 to-transparent" />
      )}

      {showHud && (
        <div
          className={cn(
            "absolute inset-0 transition-opacity duration-500 motion-reduce:transition-none",
            HUD_TEXT,
            hudVisible ? "opacity-100" : "opacity-[.08]"
          )}
        >
          {/* Rails and corner ticks */}
          <div aria-hidden="true" className={cn("absolute inset-y-3 left-3 w-[2px] transition-colors sm:inset-y-10 sm:left-10", EASE, isRecording ? "bg-[rgba(255,110,90,.85)]" : "bg-[rgba(242,238,230,.7)]")} />
          <div aria-hidden="true" className={cn("absolute inset-y-3 right-3 w-[2px] transition-colors sm:inset-y-10 sm:right-10", EASE, isRecording ? "bg-[rgba(255,110,90,.85)]" : "bg-[rgba(242,238,230,.7)]")} />
          <div aria-hidden="true" className="absolute left-3 top-3 h-px w-2.5 bg-[rgba(242,238,230,.7)] sm:left-10 sm:top-10" />
          <div aria-hidden="true" className="absolute bottom-3 left-3 h-px w-2.5 bg-[rgba(242,238,230,.7)] sm:bottom-10 sm:left-10" />
          <div aria-hidden="true" className="absolute right-3 top-3 h-px w-2.5 bg-[rgba(242,238,230,.7)] sm:right-10 sm:top-10" />
          <div aria-hidden="true" className="absolute bottom-3 right-3 h-px w-2.5 bg-[rgba(242,238,230,.7)] sm:bottom-10 sm:right-10" />

          <Crosshair side="left" />
          <Crosshair side="right" />

          {/* Top left: date */}
          <div className="absolute left-6 top-6 sm:left-16 sm:top-[30px]">
            <div className="flex h-8 overflow-hidden rounded border border-[rgba(242,238,230,.16)] bg-[rgba(12,10,8,.5)] font-bold shadow-[0_8px_24px_rgba(0,0,0,.25)] backdrop-blur-md sm:h-[41px]">
              {/* text-box trims the font's built-in leading so the caps sit dead centre. */}
              <span className="flex items-center border-r border-accent/35 bg-accent/[.14] pl-2 pr-[calc(.5rem-.18em)] text-[9px] tracking-[.18em] text-accent [text-box:trim-both_cap_alphabetic] sm:pl-3 sm:pr-[calc(.75rem-.18em)] sm:text-[13px]">
                SYNODIC
              </span>
              <span className="flex items-center px-2.5 text-base tracking-[.02em] [text-box:trim-both_cap_alphabetic] sm:px-3.5 sm:text-[26px]">
                {missionDay}, {year}
              </span>
            </div>
          </div>

          {/* Top right: time, entry, devices */}
          <div className="absolute right-6 top-6 flex flex-col items-end gap-1.5 text-right sm:right-16 sm:top-[30px]">
            <div className="text-sm font-bold tracking-[.04em] sm:text-[22px]">
              TIME {currentTime.slice(0, 2)}
              <span className={cn("transition-opacity duration-200", colonOn ? "opacity-100" : "opacity-25")}>:</span>
              {currentTime.slice(2, 4)}
            </div>
            <div className="text-xs tracking-[.06em] sm:text-base">
              <span className="block sm:inline">LOG ENTRY #{logNumber}</span>
              <span className="block sm:inline"> &gt; {username}</span>
            </div>
            {canSwitchCamera ? (
              <button
                type="button"
                onClick={switchCamera}
                title="Switch camera"
                aria-label={`Camera ${cameraIndex + 1} of ${videoDevices.length}. Switch camera`}
                className={cn("group mt-[34px] hidden items-start gap-3 text-right min-[820px]:flex", FOCUS_RING)}
              >
                {cameraReadout}
              </button>
            ) : (
              <div className="mt-[34px] hidden items-start gap-3 min-[820px]:flex">{cameraReadout}</div>
            )}
          </div>

          {/* Left: encryption */}
          <div className="absolute left-16 top-[calc(50%-40px)] hidden flex-col gap-px pl-[25px] text-[17px] font-bold min-[820px]:flex">
            <span>ENC.</span>
            <span>ON</span>
            <span className="text-[10px] font-normal tracking-[.16em] text-[rgba(242,238,230,.6)]">PRIVATE ENTRY</span>
          </div>

          {/* Right: mic level */}
          <div className="absolute right-16 top-[calc(50%-100px)] hidden min-[820px]:block">
            <AudioMeter db={micDb} live={micStream !== null} />
          </div>

          {/* Bottom left: link status */}
          <div
            className={cn(
              "absolute left-6 top-[68px] text-[11px] tracking-[.08em] tabular-nums md:bottom-[30px] md:left-16 md:top-auto",
              isOnline ? "text-[rgba(242,238,230,.8)]" : "text-[#F2C14E]"
            )}
          >
            {isOnline ? 'CONNECTED' : 'OFFLINE'}-{stamp}
          </div>
        </div>
      )}

      {permissionError && (
        <div className="absolute inset-0 flex items-center justify-center px-6">
          <div className={cn("flex max-w-sm flex-col items-center gap-4 rounded-lg px-6 py-8 text-center", GLASS)}>
            <span className="text-[11px] tracking-[.22em] text-[#F2C14E]">CAM. OFFLINE</span>
            <p className="text-sm leading-relaxed text-[rgba(242,238,230,.8)]">
              Blackbox needs your camera to record. Allow access in your browser, then try again.
            </p>
            <button
              type="button"
              onClick={() => startCamera()}
              className={cn(PILL_BUTTON, "bg-accent font-bold text-accent-foreground hover:bg-accent/90")}
            >
              GRANT ACCESS
            </button>
          </div>
        </div>
      )}

      {isReviewing && (
        <div className="absolute left-1/2 top-6 w-[min(360px,calc(100%-48px))] -translate-x-1/2 animate-fade-down motion-reduce:animate-none sm:top-[30px]">
          <label htmlFor="entry-title" className="mb-2 block text-center text-[13px] font-bold tracking-[.22em] text-accent">
            TITLE THIS ENTRY
          </label>
          <input
            id="entry-title"
            type="text"
            value={videoTitle}
            onChange={handleTitleChange}
            onKeyDown={handleTitleKeyDown}
            placeholder="Enter a title for your recording"
            className={cn(
              "h-11 w-full rounded-md px-3 text-center text-sm text-[#F2EEE6] placeholder:text-[rgba(242,238,230,.4)] focus:border-accent/70 focus:outline-none sm:text-base",
              GLASS
            )}
            data-testid="video-title-input"
          />
        </div>
      )}

      {/* Controls stay visible whatever the HUD toggle says. */}
      <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 flex-col items-center gap-3.5 sm:bottom-[26px]">
        {!isRecording && !isReviewing && !permissionError && (
          <span className={cn("whitespace-nowrap text-[11px] tracking-[.22em] text-[rgba(242,238,230,.7)]", HUD_TEXT)}>
            STANDING BY · PRESS TO LOG
          </span>
        )}
        {isReviewing && (
          <div className={cn("flex w-[min(560px,calc(100vw-48px))] items-center gap-3 text-[11px] tracking-[.1em] tabular-nums", HUD_TEXT)}>
            <span className="w-10 text-right">{formatTime(Math.floor(shownPosition))}</span>
            <input
              type="range"
              min={0}
              max={reviewDuration}
              step={0.1}
              value={shownPosition}
              onChange={handleScrub}
              onKeyDown={handleScrubKeyDown}
              disabled={reviewDuration <= 0}
              aria-label="Seek"
              aria-valuetext={`${formatTime(Math.floor(shownPosition))} of ${formatTime(Math.round(reviewDuration))}`}
              className={SCRUBBER}
              style={{
                background: `linear-gradient(to right, #64FFDA ${reviewProgress}%, rgba(242,238,230,.22) ${reviewProgress}%) center / 100% 4px no-repeat`,
              }}
              data-testid="review-scrubber"
            />
            <span className="w-10 text-[rgba(242,238,230,.6)]">{formatTime(Math.round(reviewDuration))}</span>
          </div>
        )}

        {isReviewing ? (
          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center gap-[22px]">
              <button type="button" onClick={() => seekVideo(-5)} className={ROUND_BUTTON} aria-label="Back 5 seconds">
                <Rewind size={20} strokeWidth={1.6} />
              </button>
              <button type="button" onClick={togglePlayPause} className={BIG_BUTTON} aria-label={isPlaying ? "Pause" : "Play"}>
                {isPlaying
                  ? <Pause size={26} fill="currentColor" strokeWidth={0} />
                  : <Play size={26} fill="currentColor" strokeWidth={0} className="translate-x-0.5" />}
              </button>
              <button type="button" onClick={() => seekVideo(5)} className={ROUND_BUTTON} aria-label="Forward 5 seconds">
                <FastForward size={20} strokeWidth={1.6} />
              </button>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={deleteRecording}
                disabled={isSaving}
                className={cn(PILL_BUTTON, GLASS, "text-[#FF8A78] hover:bg-[rgba(255,90,69,.18)]")}
              >
                <Trash2 size={16} strokeWidth={1.8} />
                DISCARD
              </button>
              <button
                type="button"
                onClick={saveRecording}
                disabled={isSaving}
                className={cn(PILL_BUTTON, "bg-accent font-bold text-accent-foreground shadow-[0_0_22px_rgba(100,255,218,.35)] hover:bg-accent/90")}
                data-testid="save-recording"
              >
                {isSaving ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  <Check size={16} strokeWidth={2.2} />
                )}
                {isSaving ? 'SAVING…' : 'SAVE ENTRY'}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-[22px]">
            <button
              type="button"
              onClick={toggleHud}
              className={ROUND_BUTTON}
              aria-pressed={hudVisible}
              aria-label={hudVisible ? "Hide HUD overlay" : "Show HUD overlay"}
              title={hudVisible ? "Hide HUD" : "Show HUD"}
            >
              <Focus size={20} strokeWidth={1.6} className={cn("transition-opacity", hudVisible ? "opacity-100" : "opacity-50")} />
            </button>
            <button
              type="button"
              onClick={isRecording ? stopRecording : startRecording}
              className={BIG_BUTTON}
              aria-label={isRecording ? "Stop recording" : "Start recording"}
              disabled={isSaving}
              data-testid="record-toggle"
            >
              <span
                className={cn(
                  "flex items-center justify-center transition-all duration-500 ease-[cubic-bezier(.34,1.56,.64,1)] motion-reduce:transition-none",
                  isRecording
                    ? "h-7 w-7 rounded-md bg-[#FF5A45] shadow-[0_0_22px_rgba(255,90,69,.55)]"
                    : "h-[58px] w-[58px] rounded-full bg-accent shadow-[0_0_22px_rgba(100,255,218,.5)]"
                )}
              >
                <Video
                  size={22}
                  strokeWidth={1.8}
                  className={cn("text-accent-foreground transition-opacity duration-200", isRecording ? "opacity-0" : "opacity-100")}
                />
              </span>
            </button>
            <button
              type="button"
              onClick={goBack}
              className={cn(ROUND_BUTTON, isRecording && "invisible")}
              disabled={isRecording}
              aria-label="Back to entries"
              title="Back"
            >
              <ArrowLeft size={20} strokeWidth={1.8} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default VideoRecorder;

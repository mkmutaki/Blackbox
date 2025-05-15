import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface VideoPlayerProps {
  title: string;
  url: string;
  iv: string;
  jwk: any;
  open: boolean;
  onClose: () => void;
}

export function VideoPlayer({ title, url, iv, jwk, open, onClose }: VideoPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [decryptedUrl, setDecryptedUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  
  // Decrypt the video when the component mounts
  useEffect(() => {
    if (!open) return;
    
    const decryptVideo = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        // Basic validation
        if (!iv) throw new Error('Missing IV');
        if (!jwk) throw new Error('Missing JWK');
        if (!url) throw new Error('Missing URL');
        
        // Parse JWK if it's a string
        const keyData = typeof jwk === 'string' ? JSON.parse(jwk) : jwk;
        
        // Convert IV hex string to Uint8Array
        const ivHexPairs = iv.match(/.{1,2}/g) || [];
        const ivArray = new Uint8Array(ivHexPairs.map(byte => parseInt(byte, 16)));
        
        // Import key for decryption
        const key = await window.crypto.subtle.importKey(
          'jwk',
          keyData,
          { name: 'AES-GCM', length: 256 },
          false,
          ['decrypt']
        );
        
        // Fetch encrypted data
        const response = await fetch(url);
        
        if (!response.ok) {
          throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
        }
        
        const encryptedData = await response.arrayBuffer();
        
        if (encryptedData.byteLength === 0) {
          throw new Error('Received empty file');
        }
        
        // Decrypt the data
        const decryptedData = await window.crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: ivArray },
          key,
          encryptedData
        );
        
        // Create blob URL from decrypted data
        const decryptedBlob = new Blob([decryptedData], { type: 'video/webm' });
        const decryptedObjectUrl = URL.createObjectURL(decryptedBlob);
        
        setDecryptedUrl(decryptedObjectUrl);
        setIsLoading(false);
        
      } catch (err) {
        console.error('Error in video decryption:', err);
        setError('Failed to decrypt video. Please try again.');
        setIsLoading(false);
      }
    };
    
    decryptVideo();
    
    // Cleanup function
    return () => {
      if (decryptedUrl) {
        URL.revokeObjectURL(decryptedUrl);
      }
    };
  }, [open, url, iv, jwk]);
  
  const togglePlayPause = () => {
    if (!videoRef.current) return;
    
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    
    setIsPlaying(!isPlaying);
  };
  
  const toggleMute = () => {
    if (!videoRef.current) return;
    
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };
  
  const handleVideoEnd = () => {
    setIsPlaying(false);
  };
  
  const handlePlayEvent = () => {
    setIsPlaying(true);
  };
  
  const handlePauseEvent = () => {
    setIsPlaying(false);
  };
  
  const handleCloseDialog = () => {
    if (videoRef.current) {
      videoRef.current.pause();
    }
    setIsPlaying(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleCloseDialog}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="font-mono">{title || 'Video Entry'}</DialogTitle>
        </DialogHeader>
        
        {isLoading && (
          <div className="flex justify-center p-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent"></div>
          </div>
        )}
        
        {error && (
          <div className="p-8 text-center text-destructive">
            <p>{error}</p>
            <Button 
              variant="outline" 
              size="sm" 
              className="mt-4"
              onClick={handleCloseDialog}
            >
              Close
            </Button>
          </div>
        )}
        
        {!isLoading && !error && decryptedUrl && (
          <div className="space-y-4">
            <video
              ref={videoRef}
              src={decryptedUrl}
              className="w-full rounded-md"
              onEnded={handleVideoEnd}
              onPlay={handlePlayEvent}
              onPause={handlePauseEvent}
              controls
            />
            
            <div className="flex justify-center items-center gap-4">
              <Button
                variant="outline"
                size="icon"
                onClick={togglePlayPause}
              >
                {isPlaying ? <Pause size={20} /> : <Play size={20} />}
              </Button>
              
              <Button
                variant="outline"
                size="icon"
                onClick={toggleMute}
              >
                {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
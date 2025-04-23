
import { useState, useEffect, useRef } from 'react';
import { Clock, Pencil, Check, Play, Pause } from 'lucide-react';
import { importKey, decryptArrayBuffer } from '@/utils/crypto';
import { toast } from "sonner";

type Entry = {
  id: string;
  title: string;
  date: string;
  duration: string;
  url?: string;
  iv?: number[];
  jwk?: string;
  createdAt?: string;
};

const EntryList = () => {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [playingId, setPlayingId] = useState<string | null>(null);
  const videoRefs = useRef<{ [key: string]: HTMLVideoElement | null }>({});

  useEffect(() => {
    fetchEntries();
  }, []);

  const fetchEntries = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/videos');
      
      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Format entries for display
      const formattedEntries = data.map((entry: any) => {
        const date = new Date(entry.createdAt);
        return {
          id: entry.id,
          title: entry.title,
          date: date.toISOString().split('T')[0], // YYYY-MM-DD format
          duration: "--:--", // Duration will be set when video is loaded
          url: entry.url,
          iv: entry.iv,
          jwk: entry.jwk,
          createdAt: entry.createdAt
        };
      });
      
      setEntries(formattedEntries);
    } catch (err) {
      console.error('Error fetching entries:', err);
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
      toast.error('Failed to load video entries');
    } finally {
      setIsLoading(false);
    }
  };

  const startEditing = (entry: Entry) => {
    setEditingId(entry.id);
    setEditingTitle(entry.title);
  };

  const saveEdit = (id: string) => {
    setEntries(entries.map(entry => 
      entry.id === id ? { ...entry, title: editingTitle } : entry
    ));
    setEditingId(null);
    
    // TODO: Update title on server
  };

  const playVideo = async (entry: Entry) => {
    if (!entry.url || !entry.iv || !entry.jwk) {
      toast.error('Missing video data');
      return;
    }
    
    try {
      // If we're already playing this video, pause it
      if (playingId === entry.id) {
        const videoEl = videoRefs.current[entry.id];
        if (videoEl) {
          if (videoEl.paused) {
            videoEl.play();
          } else {
            videoEl.pause();
          }
        }
        return;
      }
      
      // We're playing a new video
      setPlayingId(entry.id);
      
      // Fetch the encrypted video
      const response = await fetch(entry.url);
      if (!response.ok) {
        throw new Error(`Error fetching video: ${response.statusText}`);
      }
      
      const encryptedData = await response.arrayBuffer();
      
      // Import the key from JWK
      const key = await importKey(entry.jwk);
      
      // Convert IV array to Uint8Array
      const iv = new Uint8Array(entry.iv);
      
      // Decrypt the video
      const decryptedBlob = await decryptArrayBuffer(encryptedData, key, iv);
      
      // Create object URL for the video
      const videoUrl = URL.createObjectURL(decryptedBlob);
      
      // Set video source and play
      const videoEl = videoRefs.current[entry.id];
      if (videoEl) {
        videoEl.src = videoUrl;
        videoEl.onloadedmetadata = () => {
          // Update video duration once metadata is loaded
          const mins = Math.floor(videoEl.duration / 60);
          const secs = Math.floor(videoEl.duration % 60);
          const durationString = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
          
          setEntries(entries.map(e => 
            e.id === entry.id ? { ...e, duration: durationString } : e
          ));
        };
        
        videoEl.onended = () => {
          // Reset when ended
          setPlayingId(null);
        };
        
        // Clean up previous object URL when video is unloaded
        videoEl.onunload = () => {
          URL.revokeObjectURL(videoUrl);
        };
        
        videoEl.play();
      }
    } catch (err) {
      console.error('Error playing video:', err);
      toast.error('Failed to play video');
      setPlayingId(null);
    }
  };

  const isVideoPlaying = (id: string) => {
    if (playingId !== id) return false;
    const videoEl = videoRefs.current[id];
    return videoEl && !videoEl.paused;
  };

  if (isLoading && entries.length === 0) {
    return (
      <div className="space-y-4 animate-fade-up">
        <h2 className="text-2xl font-mono font-bold text-foreground">Previous Entries</h2>
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
          <p className="mt-4 text-muted-foreground">Loading entries...</p>
        </div>
      </div>
    );
  }

  if (error && entries.length === 0) {
    return (
      <div className="space-y-4 animate-fade-up">
        <h2 className="text-2xl font-mono font-bold text-foreground">Previous Entries</h2>
        <div className="bg-destructive/20 text-destructive p-4 rounded-md">
          <p>Failed to load entries: {error}</p>
          <button 
            onClick={fetchEntries} 
            className="mt-2 text-sm underline"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-up">
      <h2 className="text-2xl font-mono font-bold text-foreground">Previous Entries</h2>
      <div className="grid gap-4">
        {entries.map((entry) => (
          <div key={entry.id} className="entry-card relative">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                {editingId === entry.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      className="bg-transparent border-b border-accent/50 focus:border-accent outline-none px-1 py-0.5 font-mono text-lg"
                      autoFocus
                    />
                    <button
                      onClick={() => saveEdit(entry.id)}
                      className="p-1 hover:text-accent"
                    >
                      <Check size={16} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <h3 className="font-mono font-medium text-lg text-foreground">{entry.title}</h3>
                    <button
                      onClick={() => startEditing(entry)}
                      className="p-1 text-muted hover:text-accent"
                    >
                      <Pencil size={16} />
                    </button>
                  </div>
                )}
                <p className="text-sm text-muted-foreground font-mono">{entry.date}</p>
                
                {/* Video player (hidden until played) */}
                {playingId === entry.id && (
                  <div className="mt-3 rounded-md overflow-hidden bg-secondary/30 aspect-video">
                    <video
                      ref={el => { videoRefs.current[entry.id] = el; }}
                      className="w-full h-full"
                      controls={playingId === entry.id}
                    />
                  </div>
                )}
              </div>
              
              <div className="flex items-center gap-3">
                <button
                  onClick={() => playVideo(entry)}
                  className={`p-2 rounded-full ${playingId === entry.id ? 'bg-accent/50 text-accent-foreground' : 'bg-secondary/50 text-muted'} hover:text-foreground transition-all duration-300`}
                >
                  {isVideoPlaying(entry.id) ? <Pause size={18} /> : <Play size={18} />}
                </button>
                
                <div className="flex items-center text-muted">
                  <Clock size={16} className="mr-1" />
                  <span className="text-sm font-mono">{entry.duration}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
        
        {entries.length === 0 && !isLoading && !error && (
          <div className="text-center py-8 bg-secondary/20 rounded-lg">
            <p className="text-muted-foreground">No video entries found</p>
            <p className="text-sm text-muted-foreground mt-2">Record your first mission log!</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default EntryList;

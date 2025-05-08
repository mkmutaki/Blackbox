import { useState, useEffect, useRef } from 'react';
import { Clock, Pencil, Check, Play, Trash, AlertCircle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { formatDistanceToNow } from 'date-fns';

// Define API URL
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

type VideoEntry = {
  id: string;
  title: string;
  url: string;
  iv: string;
  jwk: JsonWebKey;
  createdAt: string;
  missionDay?: number;
  entryNumber?: string;
};

const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const EntryList = () => {
  const { token } = useAuth();
  const [entries, setEntries] = useState<VideoEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [currentVideo, setCurrentVideo] = useState<VideoEntry | null>(null);
  const [decryptedUrl, setDecryptedUrl] = useState<string | null>(null);
  const [videoDurations, setVideoDurations] = useState<Record<string, string>>({});
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);

  // Fetch entries when component mounts
  useEffect(() => {
    fetchEntries();
  }, [token]);

  // Clean up decrypted URL when dialog closes
  useEffect(() => {
    return () => {
      if (decryptedUrl) {
        URL.revokeObjectURL(decryptedUrl);
      }
    };
  }, [decryptedUrl]);

  const fetchEntries = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`${API_URL}/videos`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch entries');
      }

      const data = await response.json();
      setEntries(data);
    } catch (err) {
      console.error('Error fetching entries:', err);
      setError(err instanceof Error ? err.message : 'Failed to load entries');
      toast.error('Failed to load video entries');
    } finally {
      setLoading(false);
    }
  };

  const startEditing = (entry: VideoEntry) => {
    setEditingId(entry.id);
    setEditingTitle(entry.title);
  };

  const saveEdit = async (id: string) => {
    try {
      const response = await fetch(`${API_URL}/videos/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ title: editingTitle }),
      });

      if (!response.ok) {
        throw new Error('Failed to update title');
      }

      setEntries(entries.map(entry =>
        entry.id === id ? { ...entry, title: editingTitle } : entry
      ));
      toast.success('Title updated successfully');
    } catch (err) {
      console.error('Error updating title:', err);
      toast.error('Failed to update title');
    } finally {
      setEditingId(null);
    }
  };

  const deleteEntry = async (id: string) => {
    try {
      setIsDeleting(id);
      const response = await fetch(`${API_URL}/videos/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to delete entry');
      }

      setEntries(entries.filter(entry => entry.id !== id));
      toast.success('Entry deleted successfully');
    } catch (err) {
      console.error('Error deleting entry:', err);
      toast.error('Failed to delete entry');
    } finally {
      setIsDeleting(null);
    }
  };

  const decryptVideo = async (video: VideoEntry) => {
    try {
      toast.info('Decrypting video...');
      setCurrentVideo(video);

      // Convert string IV back to Uint8Array
      const ivArray = video.iv.split(',').map(num => parseInt(num));
      const iv = new Uint8Array(ivArray);

      // Fetch the encrypted video
      const response = await fetch(video.url);
      const encryptedData = await response.arrayBuffer();

      // Import the decryption key
      const key = await window.crypto.subtle.importKey(
        'jwk',
        video.jwk,
        { name: 'AES-GCM' },
        false,
        ['decrypt']
      );

      // Decrypt the video
      const decryptedData = await window.crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv,
          tagLength: 128
        },
        key,
        encryptedData
      );

      // Create a URL from the decrypted data
      const decryptedBlob = new Blob([decryptedData], { type: 'video/webm' });
      const url = URL.createObjectURL(decryptedBlob);
      
      if (decryptedUrl) {
        URL.revokeObjectURL(decryptedUrl);
      }
      
      setDecryptedUrl(url);
      toast.success('Video decrypted successfully');
    } catch (err) {
      console.error('Error decrypting video:', err);
      toast.error('Failed to decrypt video');
    }
  };

  const handleVideoMetadata = (videoId: string) => {
    if (videoRef.current) {
      const duration = formatDuration(videoRef.current.duration);
      setVideoDurations(prev => ({ ...prev, [videoId]: duration }));
    }
  };

  const renderEntryList = () => {
    if (loading) {
      return (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-accent"></div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="py-8 text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-destructive mb-2" />
          <p className="text-destructive">{error}</p>
          <button
            onClick={fetchEntries}
            className="mt-4 px-4 py-2 bg-accent text-accent-foreground rounded-md font-mono text-sm"
          >
            Try Again
          </button>
        </div>
      );
    }

    if (entries.length === 0) {
      return (
        <div className="py-8 text-center border border-dashed border-muted-foreground/30 rounded-lg">
          <p className="text-muted-foreground font-mono">
            No video logs recorded yet. Click "Start Recording" to create your first entry.
          </p>
        </div>
      );
    }

    return (
      <div className="grid gap-4">
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="p-4 rounded-lg border border-border bg-card/30 backdrop-blur-sm hover:border-accent/50 transition-all duration-300"
          >
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
                      className="p-1 text-muted-foreground hover:text-accent"
                    >
                      <Pencil size={16} />
                    </button>
                  </div>
                )}
                <p className="text-sm text-muted-foreground font-mono">
                  {formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {videoDurations[entry.id] && (
                  <div className="flex items-center text-muted-foreground mr-2">
                    <Clock size={14} className="mr-1" />
                    <span className="text-sm font-mono">{videoDurations[entry.id]}</span>
                  </div>
                )}
                
                <Dialog>
                  <DialogTrigger asChild>
                    <button
                      onClick={() => decryptVideo(entry)}
                      className="p-2 rounded-full bg-accent/10 text-accent hover:bg-accent/20"
                    >
                      <Play size={16} />
                    </button>
                  </DialogTrigger>
                  <DialogContent className="max-w-3xl">
                    <DialogHeader>
                      <DialogTitle className="font-mono">{currentVideo?.title}</DialogTitle>
                    </DialogHeader>
                    {decryptedUrl && (
                      <video
                        ref={videoRef}
                        src={decryptedUrl}
                        controls
                        className="w-full rounded-md"
                        onLoadedMetadata={() => handleVideoMetadata(entry.id)}
                      />
                    )}
                  </DialogContent>
                </Dialog>
                
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      className="p-2 rounded-full bg-destructive/10 text-destructive hover:bg-destructive/20"
                    >
                      <Trash size={16} />
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This action cannot be undone. This will permanently delete your
                        video entry and remove the data from our servers.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => deleteEntry(entry.id)}
                        className="bg-destructive hover:bg-destructive/80"
                        disabled={isDeleting === entry.id}
                      >
                        {isDeleting === entry.id ? 'Deleting...' : 'Delete'}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-mono font-bold text-foreground">Previous Entries</h2>
      {renderEntryList()}
    </div>
  );
};

export default EntryList;

import { useState, useEffect } from 'react';
import { Clock, Pencil, Check, Trash2, Play } from 'lucide-react';
import { get, del, patch } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/components/ui/use-toast';
import { VideoPlayer } from './VideoPlayer';

type Video = {
  id: string;
  title: string;
  createdAt: string;
  url: string;
  iv: string;
  jwk: any;
  entryNumber: number;
  solDay: number;
  category: string;
};

const EntryList = () => {
  const [videos, setVideos] = useState<Video[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [isVideoPlayerOpen, setIsVideoPlayerOpen] = useState(false);
  const { isLoggedIn } = useAuth();

  // Fetch videos when component mounts or user logs in
  useEffect(() => {
    if (isLoggedIn) {
      fetchVideos();
    }
  }, [isLoggedIn]);

  const fetchVideos = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const data = await get<Video[]>('/api/videos');
      setVideos(data);
    } catch (err: any) {
      console.error('Failed to fetch videos:', err);
      setError('Failed to load videos. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  const startEditing = (video: Video) => {
    setEditingId(video.id);
    setEditingTitle(video.title || `Entry #${video.entryNumber}`);
  };

  const saveEdit = async (id: string) => {
    try {
      // Update title in the backend using our API service with PATCH
      await patch(`/videos/${id}`, { title: editingTitle });
      
      // Update local state
      setVideos(videos.map(video => 
        video.id === id ? { ...video, title: editingTitle } : video
      ));
      
      toast({
        title: "Title updated",
        description: "Video title has been updated successfully",
      });
    } catch (err) {
      toast({
        title: "Update failed",
        description: "Failed to update video title. Please try again.",
        variant: "destructive"
      });
    }
    
    setEditingId(null);
  };

  const deleteVideo = async (id: string) => {
    if (!confirm('Are you sure you want to delete this video? This action cannot be undone.')) {
      return;
    }
    
    try {
      await del(`/videos/${id}`);
      
      // Remove from local state
      setVideos(videos.filter(video => video.id !== id));
      
      toast({
        title: "Video deleted",
        description: "Video has been deleted successfully",
      });
    } catch (err) {
      toast({
        title: "Deletion failed",
        description: "Failed to delete video. Please try again.",
        variant: "destructive"
      });
    }
  };
  
  const playVideo = (video: Video) => {
    setSelectedVideo(video);
    setIsVideoPlayerOpen(true);
  };

  // Function to format date
  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-4 animate-fade-up">
        <h2 className="text-2xl font-mono font-bold text-foreground">Previous Entries</h2>
        <div className="flex justify-center p-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4 animate-fade-up">
        <h2 className="text-2xl font-mono font-bold text-foreground">Previous Entries</h2>
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
        <Button onClick={fetchVideos} variant="outline">Retry</Button>
      </div>
    );
  }

  if (videos.length === 0) {
    return (
      <div className="space-y-4 animate-fade-up">
        <h2 className="text-2xl font-mono font-bold text-foreground">Previous Entries</h2>
        <div className="border border-dashed rounded-lg p-8 text-center text-muted">
          <p>No entries recorded yet.</p>
          <p className="text-sm mt-2">Click the recording area above to create your first entry.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-up">
      <h2 className="text-2xl font-mono font-bold text-foreground">Previous Entries</h2>
      <div className="grid gap-4">
        {videos.map((video) => (
          <div key={video.id} className="p-4 bg-card border rounded-lg shadow-sm">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                {editingId === video.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      className="bg-transparent border-b border-accent/50 focus:border-accent outline-none px-1 py-0.5 font-mono text-lg"
                      autoFocus
                    />
                    <button
                      onClick={() => saveEdit(video.id)}
                      className="p-1 hover:text-accent"
                    >
                      <Check size={16} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <h3 className="font-mono font-medium text-lg text-foreground">
                      {video.title || `Entry #${video.entryNumber}`}
                    </h3>
                    <button
                      onClick={() => startEditing(video)}
                      className="p-1 text-muted hover:text-accent"
                    >
                      <Pencil size={16} />
                    </button>
                  </div>
                )}
                <div className="flex flex-wrap gap-2 mt-1 text-sm">
                  <p className="text-muted-foreground font-mono">
                    {formatDate(video.createdAt)}
                  </p>
                  {video.category && (
                    <>
                      <span className="text-muted">•</span>
                      <p className="text-accent font-mono">
                        {video.category}
                      </p>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  size="sm" 
                  variant="outline"
                  className="flex items-center gap-1"
                  onClick={() => playVideo(video)}
                >
                  <Play size={16} />
                  Play
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  onClick={() => deleteVideo(video.id)}
                >
                  <Trash2 size={16} />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
      
      {selectedVideo && (
        <VideoPlayer
          title={selectedVideo.title || `Entry #${selectedVideo.entryNumber}`}
          url={selectedVideo.url}
          iv={selectedVideo.iv}
          jwk={selectedVideo.jwk}
          open={isVideoPlayerOpen}
          onClose={() => setIsVideoPlayerOpen(false)}
        />
      )}
    </div>
  );
};

export default EntryList;

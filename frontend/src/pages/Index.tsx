import { useState, useEffect } from "react";
import VideoRecorder from "@/components/VideoRecorder";
import EntryList from "@/components/EntryList";
import { useRecording } from "@/context/RecordingContext";

const Index = () => {
  // Use local state for transition effects if needed
  const [localRecordingState, setLocalRecordingState] = useState(false);
  
  // Use the global recording context
  const { isRecording, setIsRecording } = useRecording();
  
  // Sync the local state with the context state
  useEffect(() => {
    setLocalRecordingState(isRecording);
  }, [isRecording]);

  // Handler to start recording that updates both local and global state
  const handleStartRecording = () => {
    setIsRecording(true);
  };

  return (
    <div className="min-h-screen bg-background">
      {isRecording ? (
        <VideoRecorder />
      ) : (
        <div className="p-6">
          <div className="max-w-4xl mx-auto space-y-8">
            <header className="text-center space-y-4">
              <div className="inline-block px-3 py-1 rounded-full bg-accent/10 text-accent text-sm font-mono">
                Video Diary
              </div>
              <h1 className="text-4xl font-mono font-bold text-foreground tracking-tight">
                Mission Log
              </h1>
              <p className="text-muted max-w-md mx-auto font-mono">
                Record your thoughts and experiences with high-quality video entries
              </p>
            </header>
            
            <button 
              onClick={handleStartRecording}
              className="w-full aspect-video bg-secondary/50 backdrop-blur-sm rounded-lg border border-border/50 hover:border-accent/50 transition-all duration-300 flex items-center justify-center text-muted hover:text-accent"
            >
              Click to Start Recording
            </button>
            
            <div className="mt-12">
              <EntryList />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Index;

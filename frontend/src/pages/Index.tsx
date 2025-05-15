import { useState } from "react";
import VideoRecorder from "@/components/VideoRecorder";
import EntryList from "@/components/EntryList";

const Index = () => {
  const [isRecording, setIsRecording] = useState(false);

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
              onClick={() => setIsRecording(true)}
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

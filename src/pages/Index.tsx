
import VideoRecorder from "@/components/VideoRecorder";
import EntryList from "@/components/EntryList";

const Index = () => {
  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto space-y-8">
        <header className="text-center space-y-4">
          <div className="inline-block px-3 py-1 rounded-full bg-accent/10 text-accent text-sm font-medium">
            Video Diary
          </div>
          <h1 className="text-4xl font-space font-bold text-foreground">
            Mission Log
          </h1>
          <p className="text-muted max-w-md mx-auto">
            Record your thoughts and experiences with high-quality video entries
          </p>
        </header>

        <VideoRecorder />
        
        <div className="mt-12">
          <EntryList />
        </div>
      </div>
    </div>
  );
};

export default Index;

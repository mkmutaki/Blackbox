import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useRecording } from '@/context/RecordingContext';
import { LogOut, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SettingsModal } from '@/components/SettingsModal';
import { toast } from '@/components/ui/use-toast';

export function Header() {
  const { logout, isLoggedIn } = useAuth();
  const { isRecording } = useRecording();
  const navigate = useNavigate();
  const location = useLocation();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // App controls only belong on the protected app route.
  if (!isLoggedIn || isRecording || location.pathname !== '/home') return null;

  const handleSignOut = () => {
    logout();
    toast({
      title: "Signed out successfully",
      description: "You have been signed out of your account."
    });
    navigate('/');
  };

  return (
    <header className="fixed top-0 right-0 z-50 flex items-center gap-2 p-4">
      <Button
        variant="outline"
        size="icon"
        onClick={() => setIsSettingsOpen(true)}
        className="bg-background/80 backdrop-blur-sm border-accent/30 hover:border-accent"
        aria-label="Open settings"
      >
        <Settings size={18} />
      </Button>

      <button
        type="button"
        onClick={handleSignOut}
        className="flex items-center gap-1.5 rounded-md px-3 py-2 font-mono text-sm text-destructive transition-colors hover:bg-destructive/10"
      >
        <LogOut size={16} />
        <span>Sign Out</span>
      </button>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </header>
  );
}

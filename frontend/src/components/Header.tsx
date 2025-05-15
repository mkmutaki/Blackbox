import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { ChevronDown, LogOut, User, Settings } from 'lucide-react';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';

export function Header() {
  const { user, logout, isLoggedIn } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  
  // Hide header when not logged in
  if (!isLoggedIn) return null;

  const handleSignOut = () => {
    logout();
    toast({
      title: "Signed out successfully",
      description: "You have been signed out of your account."
    });
    navigate('/login');
  };

  return (
    <header className="fixed top-0 right-0 z-40 p-4 flex justify-end">
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          <Button 
            variant="outline" 
            className="flex items-center gap-2 bg-background/80 backdrop-blur-sm border-accent/30 hover:border-accent"
          >
            <span className="font-mono">{user?.email?.split('@')[0] || 'User'}</span>
            <ChevronDown size={16} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="font-mono">
          <DropdownMenuItem className="flex items-center gap-2 cursor-pointer">
            <User size={16} />
            <span>Profile</span>
          </DropdownMenuItem>
          <DropdownMenuItem className="flex items-center gap-2 cursor-pointer">
            <Settings size={16} />
            <span>Settings</span>
          </DropdownMenuItem>
          <DropdownMenuItem 
            className="flex items-center gap-2 text-destructive hover:text-destructive cursor-pointer"
            onClick={handleSignOut}
          >
            <LogOut size={16} />
            <span>Sign Out</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { X } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ProfileModal({ isOpen, onClose }: ProfileModalProps) {
  const [username, setUsername] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [location, setLocation] = useState('');
  const [originalData, setOriginalData] = useState({
    username: '',
    dateOfBirth: '',
    location: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { user, updateProfile } = useAuth();

  // Initialize form data when modal opens or user data changes
  useEffect(() => {
    if (user?.profile) {
      const profile = user.profile;
      const formattedDate = profile.dateOfBirth 
        ? new Date(profile.dateOfBirth).toISOString().split('T')[0]
        : '';
      
      const data = {
        username: profile.username || '',
        dateOfBirth: formattedDate,
        location: profile.location || ''
      };
      
      setUsername(data.username);
      setDateOfBirth(data.dateOfBirth);
      setLocation(data.location);
      setOriginalData(data);
    }
  }, [user, isOpen]);

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    // Reset error state
    setError(null);

    // Validate inputs
    if (!username.trim() || !dateOfBirth || !location.trim()) {
      setError('All fields are required');
      return;
    }

    // Validate date of birth
    const birthDate = new Date(dateOfBirth);
    const today = new Date();
    const age = today.getFullYear() - birthDate.getFullYear();
    
    if (birthDate > today) {
      setError('Date of birth cannot be in the future');
      return;
    }

    if (age > 120 || age < 13) {
      setError('Please enter a valid date of birth');
      return;
    }

    setIsLoading(true);

    try {
      await updateProfile({
        username: username.trim(),
        dateOfBirth,
        location: location.trim()
      });

      toast({
        title: 'Profile updated',
        description: 'Your profile has been successfully updated.',
      });

      onClose();
    } catch (error: any) {
      setError(
        error.response?.data?.error || 
        'Failed to update profile. Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    // Reset to original data
    setUsername(originalData.username);
    setDateOfBirth(originalData.dateOfBirth);
    setLocation(originalData.location);
    setError(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleCancel}>
      <DialogContent className="sm:max-w-md">
        <div className="flex items-center justify-between">
          <DialogHeader>
            <DialogTitle className="text-xl font-mono">
              Profile Settings
            </DialogTitle>
          </DialogHeader>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCancel}
            className="h-6 w-6 p-0"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              type="text"
              placeholder="Enter your username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="font-mono"
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="dateOfBirth">Date of Birth</Label>
            <Input
              id="dateOfBirth"
              type="date"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
              className="font-mono"
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="location">Current Location</Label>
            <Input
              id="location"
              type="text"
              placeholder="Enter your location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="font-mono"
              disabled={isLoading}
            />
          </div>

          <div className="flex gap-2 pt-4">
            <Button
              type="submit"
              className="flex-1"
              disabled={isLoading}
            >
              {isLoading ? 'Saving...' : 'Save'}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={handleCancel}
              disabled={isLoading}
            >
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

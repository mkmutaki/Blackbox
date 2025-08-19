import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/components/ui/use-toast';

interface ProfileSetupProps {
  isOpen: boolean;
  onComplete: () => void;
}

export function ProfileSetup({ isOpen, onComplete }: ProfileSetupProps) {
  const [username, setUsername] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [location, setLocation] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { updateProfile } = useAuth();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    // Reset error state
    setError(null);

    // Validate inputs
    if (!username.trim() || !dateOfBirth || !location.trim()) {
      setError('All fields are required');
      return;
    }

    // Validate date of birth (not in future, reasonable age range)
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
        title: 'Profile setup complete',
        description: 'Welcome to Blackbox! You can now start using the app.',
      });

      onComplete();
    } catch (error: any) {
      setError(
        error.response?.data?.error || 
        'Failed to save profile. Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} modal>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center text-2xl font-mono">
            Complete Your Profile
          </DialogTitle>
        </DialogHeader>

        <div className="text-center text-sm text-muted-foreground mb-6">
          Please provide some basic information to get started
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
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

          <Button
            type="submit"
            className="w-full mt-6"
            disabled={isLoading}
          >
            {isLoading ? 'Saving...' : 'Done'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

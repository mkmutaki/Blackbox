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
  const { updateProfile } = useAuth();

  const [dateOfBirth, setDateOfBirth] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Reset error state
    setError(null);

    // Validate inputs
    if (!dateOfBirth) {
      setError('Date of birth is required');
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
      await updateProfile({ dateOfBirth });

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
      <DialogContent
        className="sm:max-w-md"
        hideCloseButton
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-center text-2xl font-mono">
            One Last Step
          </DialogTitle>
        </DialogHeader>

        <div className="text-center text-sm text-muted-foreground mb-6">
          We just need your date of birth to finish setting up your account
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

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

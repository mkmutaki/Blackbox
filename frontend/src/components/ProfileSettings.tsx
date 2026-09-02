import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from '@/components/ui/use-toast';

export function ProfileSettings() {
  const [username, setUsername] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [originalData, setOriginalData] = useState({
    username: '',
    dateOfBirth: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { user, updateProfile } = useAuth();

  // Initialize form data when user data becomes available
  useEffect(() => {
    if (user?.profile) {
      const profile = user.profile;
      const formattedDate = profile.dateOfBirth
        ? new Date(profile.dateOfBirth).toISOString().split('T')[0]
        : '';

      const data = {
        username: profile.username || '',
        dateOfBirth: formattedDate
      };

      setUsername(data.username);
      setDateOfBirth(data.dateOfBirth);
      setOriginalData(data);
    }
  }, [user]);

  const isDirty = username !== originalData.username || dateOfBirth !== originalData.dateOfBirth;

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    setError(null);

    if (!username.trim() || !dateOfBirth) {
      setError('All fields are required');
      return;
    }

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
      const trimmedUsername = username.trim();
      await updateProfile({
        username: trimmedUsername,
        dateOfBirth
      });

      setOriginalData({ username: trimmedUsername, dateOfBirth });

      toast({
        title: 'Profile updated',
        description: 'Your profile has been successfully updated.',
      });
    } catch (error: any) {
      setError(
        error.response?.data?.error ||
        'Failed to update profile. Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setUsername(originalData.username);
    setDateOfBirth(originalData.dateOfBirth);
    setError(null);
  };

  return (
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

      <div className="flex gap-2 pt-4">
        <Button type="submit" disabled={isLoading || !isDirty}>
          {isLoading ? 'Saving...' : 'Save changes'}
        </Button>
        {isDirty && (
          <Button
            type="button"
            variant="outline"
            onClick={handleReset}
            disabled={isLoading}
          >
            Reset
          </Button>
        )}
      </div>
    </form>
  );
}

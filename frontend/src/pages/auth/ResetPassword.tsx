import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { PasswordInput } from '@/components/ui/password-input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from '@/components/ui/use-toast';
import { PixelGasBackground } from '@/components/PixelGasBackground';
import { post } from '@/services/api';
import { validatePasswordComposition } from '@/lib/passwordPolicy';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError('This reset link is missing its token.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    const compositionError = validatePasswordComposition(password);
    if (compositionError) {
      setError(compositionError);
      return;
    }

    setIsLoading(true);
    try {
      await post('/auth/reset-password', { token, password });
      toast({
        title: 'Password reset',
        description: 'Please sign in with your new password.',
      });
      navigate('/login');
    } catch (err: any) {
      setError(err.response?.data?.error || 'This reset link is invalid or has expired.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <PixelGasBackground className="bg-background" />

      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-mono font-bold">Choose a new password</h1>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!token ? (
          <Alert variant="destructive">
            <AlertDescription>
              This reset link is missing its token. Request a new one from the{' '}
              <Link to="/forgot-password" className="underline">
                forgot password
              </Link>{' '}
              page.
            </AlertDescription>
          </Alert>
        ) : (
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <PasswordInput
                autoComplete="new-password"
                required
                placeholder="New password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="font-mono"
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                At least 8 characters, with an uppercase letter, a number, and a special character.
              </p>
            </div>
            <PasswordInput
              autoComplete="new-password"
              required
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="font-mono"
              blockPaste
            />
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Resetting…' : 'Reset password'}
            </Button>
          </form>
        )}

        <div className="text-center text-sm">
          <Link to="/login" className="font-semibold text-accent hover:underline">
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}

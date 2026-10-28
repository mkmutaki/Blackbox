import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { PasswordInput } from '@/components/ui/password-input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from '@/components/ui/use-toast';
import { ShieldAlert } from 'lucide-react';
import { PixelGasBackground } from '@/components/PixelGasBackground';
import { post } from '@/services/api';
import { PASSWORD_BREACHED, validatePasswordComposition } from '@/lib/passwordPolicy';
import { getErrorCode, getErrorMessage } from '@/lib/errorMessage';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  // The password the server flagged as breached. The warning stays up once
  // shown; pressing Reset password again with this same password keeps it.
  const [breachedPassword, setBreachedPassword] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const keepBreachedPassword = breachedPassword !== null && breachedPassword === password;

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
      await post('/auth/reset-password', { token, password, acceptBreachedPassword: keepBreachedPassword });
      toast({
        title: 'Password reset',
        description: 'Please sign in with your new password.',
      });
      navigate('/login');
    } catch (err) {
      if (getErrorCode(err) === PASSWORD_BREACHED) {
        setBreachedPassword(password);
        return;
      }
      setError(getErrorMessage(err, 'This reset link is invalid or has expired.'));
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

            {breachedPassword !== null && (
              <div
                role="alert"
                className="flex gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4 animate-in fade-in slide-in-from-bottom-1 duration-300"
              >
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-destructive">
                    This password has appeared in a known data breach
                  </p>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {keepBreachedPassword
                      ? 'Attackers try leaked passwords first. Choose a different one, or press Reset Password Anyway to use it.'
                      : 'Attackers try leaked passwords first. The new password will be checked when you continue.'}
                  </p>
                </div>
              </div>
            )}

            <Button
              type="submit"
              variant={keepBreachedPassword ? 'destructive' : 'default'}
              className="w-full"
              disabled={isLoading}
            >
              {isLoading
                ? 'Resetting…'
                : keepBreachedPassword
                  ? 'Reset Password Anyway'
                  : 'Reset password'}
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

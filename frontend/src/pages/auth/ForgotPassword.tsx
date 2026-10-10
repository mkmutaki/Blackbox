import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PixelGasBackground } from '@/components/PixelGasBackground';
import { post } from '@/services/api';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  // Deliberately a single message regardless of outcome — the backend
  // returns the same generic response whether or not the email has an
  // account, so there is nothing more specific this page could show
  // without reopening that enumeration gap itself.
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError('Please enter your email address');
      return;
    }

    setIsLoading(true);
    try {
      await post('/auth/request-password-reset', { email: email.trim() });
      setSubmitted(true);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <PixelGasBackground className="bg-background" />

      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-mono font-bold">Reset your password</h1>
          <p className="mt-2 text-muted-foreground">
            We'll email you a link to choose a new one.
          </p>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {submitted ? (
          <Alert>
            <AlertDescription>
              If an account with that email exists, a reset link has been sent.
            </AlertDescription>
          </Alert>
        ) : (
          <form className="space-y-6" onSubmit={handleSubmit}>
            <Input
              type="email"
              autoComplete="email"
              required
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="font-mono"
            />
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Sending…' : 'Send reset link'}
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

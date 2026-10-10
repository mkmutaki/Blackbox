import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PixelGasBackground } from '@/components/PixelGasBackground';
import { post } from '@/services/api';

type Status = 'verifying' | 'success' | 'error';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<Status>('verifying');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setError('This verification link is missing its token.');
      return;
    }

    let cancelled = false;

    post('/auth/verify-email', { token })
      .then(() => {
        if (!cancelled) setStatus('success');
      })
      .catch((err: any) => {
        if (cancelled) return;
        setStatus('error');
        setError(err.response?.data?.error || 'This verification link is invalid or has expired.');
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <PixelGasBackground className="bg-background" />

      <div className="w-full max-w-md space-y-8 text-center">
        <h1 className="text-3xl font-mono font-bold">Verify your email</h1>

        {status === 'verifying' && (
          <p className="text-muted-foreground">Confirming your email address…</p>
        )}

        {status === 'success' && (
          <>
            <Alert>
              <AlertDescription>Your email address has been verified.</AlertDescription>
            </Alert>
            <Button asChild className="w-full">
              <Link to="/home">Continue</Link>
            </Button>
          </>
        )}

        {status === 'error' && (
          <>
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
            <Button asChild variant="secondary" className="w-full">
              <Link to="/login">Back to sign in</Link>
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

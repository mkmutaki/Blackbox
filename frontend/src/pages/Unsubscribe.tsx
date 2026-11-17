import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PixelGasBackground } from '@/components/PixelGasBackground';
import { post } from '@/services/api';
import { getErrorMessage } from '@/lib/errorMessage';
import { CONTACT_EMAIL } from '@/lib/legal';

type Status = 'idle' | 'sending' | 'done' | 'error';

// Where the unsubscribe link in waitlist emails lands. Nothing happens
// until the button is pressed: email security scanners open links on
// their own, and must not unsubscribe anyone by doing so.
export default function Unsubscribe() {
  const [searchParams] = useSearchParams();
  const id = searchParams.get('id');
  const token = searchParams.get('token');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  const unsubscribe = async () => {
    setStatus('sending');
    setError(null);
    try {
      await post('/waitlist/unsubscribe', { id, token });
      setStatus('done');
    } catch (err: unknown) {
      setStatus('error');
      setError(getErrorMessage(err, "We couldn't unsubscribe you. Please try again later."));
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <PixelGasBackground className="bg-background" />

      <div className="w-full max-w-md space-y-8 text-center">
        <h1 className="text-3xl font-mono font-bold">Unsubscribe</h1>

        {!id || !token ? (
          <Alert variant="destructive">
            <AlertDescription>
              This unsubscribe link is incomplete. To be removed from the waitlist, email {CONTACT_EMAIL}.
            </AlertDescription>
          </Alert>
        ) : status === 'done' ? (
          <Alert>
            <AlertDescription>
              You&apos;re unsubscribed, and your address has been removed from the Blackbox waitlist.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <p className="text-muted-foreground">
              Stop receiving Blackbox waitlist emails and remove your address from the list.
            </p>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Button className="w-full" onClick={unsubscribe} disabled={status === 'sending'}>
              {status === 'sending' ? 'Unsubscribing…' : 'Unsubscribe'}
            </Button>
          </>
        )}

        <Button asChild variant="secondary" className="w-full">
          <Link to="/">Back to Blackbox</Link>
        </Button>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleLogin, CredentialResponse } from '@react-oauth/google';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from '@/components/ui/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { getErrorMessage } from '@/lib/errorMessage';

// Account deletion requires re-proving control of the account right now —
// the current session cookie alone isn't enough for something this
// destructive and irreversible. Local accounts re-enter their password;
// Google accounts sign in with Google again and we check the resulting
// credential matches the account being deleted (enforced server-side).
// Typing the username back first is only a guard against accidental
// deletion, not authentication — the username is shown right above the box.
export function DeleteAccountSection() {
  const { user, deleteAccount } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [typedUsername, setTypedUsername] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isGoogleAccount = user?.authProvider === 'google';
  // Accounts that predate onboarding may have no username; fall back to email.
  const confirmationText = user?.profile?.username || user?.email || '';
  const usernameConfirmed = typedUsername.trim() === confirmationText;

  const resetAndClose = () => {
    setIsOpen(false);
    setPassword('');
    setTypedUsername('');
    setError(null);
  };

  const finishDeletion = () => {
    toast({
      title: 'Account deleted',
      description: 'Your account and all entries have been permanently removed.',
    });
    navigate('/login');
  };

  const handlePasswordConfirm = async () => {
    if (!usernameConfirmed) {
      setError('Type your username exactly as shown to confirm.');
      return;
    }
    if (!password) {
      setError('Enter your password to confirm.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await deleteAccount({ password });
      finishDeletion();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not delete your account. Please try again.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleConfirm = async (credentialResponse: CredentialResponse) => {
    if (!credentialResponse.credential) {
      setError('No credential received from Google. Please try again.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await deleteAccount({ credential: credentialResponse.credential });
      finishDeletion();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not delete your account. Please try again.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-destructive/40 p-4">
      <div>
        <h3 className="font-mono text-sm font-semibold text-destructive">Danger zone</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Permanently delete your account and every entry in it. This cannot be undone.
        </p>
      </div>

      <Button type="button" variant="destructive" size="sm" onClick={() => setIsOpen(true)}>
        Delete my account
      </Button>

      <Dialog open={isOpen} onOpenChange={(open) => (open ? setIsOpen(true) : resetAndClose())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-mono">Delete your account?</DialogTitle>
            <DialogDescription>
              This permanently deletes your account and every video entry. There is no undo.
              {isGoogleAccount
                ? ' Type your username, then sign in with Google again to confirm.'
                : ' Type your username and enter your password to confirm.'}
            </DialogDescription>
          </DialogHeader>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="delete-account-username">Username</Label>
            <p className="select-none font-mono text-sm text-red-400/80" aria-hidden="true">
              {confirmationText}
            </p>
            <Input
              id="delete-account-username"
              value={typedUsername}
              onChange={(e) => setTypedUsername(e.target.value)}
              disabled={isSubmitting}
              autoComplete="off"
              spellCheck={false}
              aria-label={`Type ${confirmationText} to confirm`}
            />
          </div>

          {isGoogleAccount ? (
            usernameConfirmed && (
              <div className="flex justify-center py-2">
                <GoogleLogin
                  onSuccess={handleGoogleConfirm}
                  onError={() => setError('Google sign-in failed. Please try again.')}
                  theme="filled_black"
                  text="continue_with"
                />
              </div>
            )
          ) : (
            <div className="space-y-2">
              <Label htmlFor="delete-account-password">Password</Label>
              <PasswordInput
                id="delete-account-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isSubmitting}
                autoComplete="current-password"
              />
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={resetAndClose} disabled={isSubmitting}>
              Cancel
            </Button>
            {!isGoogleAccount && (
              <Button
                type="button"
                variant="destructive"
                onClick={handlePasswordConfirm}
                disabled={isSubmitting || !usernameConfirmed}
              >
                {isSubmitting ? 'Deleting...' : 'Permanently delete'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

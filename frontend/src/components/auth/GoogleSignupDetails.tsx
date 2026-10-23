import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { TermsConsent } from '@/components/legal/TermsConsent';
import type { GoogleSignupDetails as Details } from '@/context/AuthContext';
import { MIN_AGE_YEARS, calculateAge, meetsMinimumAge } from '@/lib/agePolicy';
import { CURRENT_TERMS_VERSION } from '@/lib/legal';
import { getErrorMessage } from '@/lib/errorMessage';

interface GoogleSignupDetailsProps {
  onSubmit: (details: Details) => Promise<void>;
  onCancel: () => void;
}

// Shown after a Google sign-in that has no Blackbox account behind it yet.
// The server stores nothing for that identity until it gets these two
// answers — the same date-of-birth check and terms agreement email sign-up
// asks for before the account exists.
export function GoogleSignupDetails({ onSubmit, onCancel }: GoogleSignupDetailsProps) {
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const birthDate = dateOfBirth ? new Date(dateOfBirth) : null;
  const isMinor = birthDate !== null && !Number.isNaN(birthDate.getTime()) && calculateAge(birthDate) < 18;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!birthDate || Number.isNaN(birthDate.getTime())) {
      setError('Please enter your date of birth');
      return;
    }
    if (birthDate > new Date()) {
      setError('Date of birth cannot be in the future');
      return;
    }
    if (!meetsMinimumAge(birthDate)) {
      setError(`You must be at least ${MIN_AGE_YEARS} years old to use Blackbox`);
      return;
    }
    if (!agreed) {
      setError('Please accept the Terms of Service to continue');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit({ dateOfBirth, acceptedTermsVersion: CURRENT_TERMS_VERSION });
    } catch (submitError) {
      // Most likely the held Google credential expired (they last about an
      // hour) — the server's message says so; Cancel starts over.
      setError(getErrorMessage(submitError, 'Could not create your account. Please try again.'));
      setIsSubmitting(false);
    }
  };

  return (
    <form className="space-y-5 text-left" onSubmit={handleSubmit}>
      <div>
        <p className="font-mono text-sm font-semibold">Finish creating your account</p>
        <p className="mt-1 text-sm text-muted-foreground">
          There&apos;s no Blackbox account for this Google account yet. Nothing is saved until you finish this step.
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div>
        <Label htmlFor="googleDateOfBirth" className="mb-2 block text-xs font-mono uppercase tracking-wider text-muted-foreground">
          Date of Birth
        </Label>
        <Input
          id="googleDateOfBirth"
          type="date"
          autoComplete="bday"
          required
          value={dateOfBirth}
          onChange={(e) => setDateOfBirth(e.target.value)}
          className="font-mono"
          disabled={isSubmitting}
        />
      </div>

      <TermsConsent id="googleTerms" checked={agreed} onCheckedChange={setAgreed} isMinor={isMinor} />

      <div className="flex gap-3">
        <Button type="button" variant="secondary" className="flex-1" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" className="flex-1" disabled={!agreed || isSubmitting}>
          {isSubmitting ? 'Creating account...' : 'Create account'}
        </Button>
      </div>
    </form>
  );
}

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PixelGasBackground } from '@/components/PixelGasBackground';
import { DeleteAccountSection } from '@/components/DeleteAccountSection';
import { TermsConsent } from '@/components/legal/TermsConsent';
import { calculateAge } from '@/lib/agePolicy';
import { CURRENT_TERMS_VERSION, LEGAL_EFFECTIVE_DATE } from '@/lib/legal';
import { getErrorMessage } from '@/lib/errorMessage';

// Shown in place of the app to an account that hasn't agreed to the
// current terms — one created before acceptance was recorded, or after a
// material change. The server refuses new recordings meanwhile
// (requireCurrentTerms), so this is the explanation, not the enforcement.
// Someone who doesn't agree can still leave with their data deleted.
export function TermsAcceptanceGate() {
  const { user, acceptTerms, logout } = useAuth();
  const navigate = useNavigate();
  const [agreed, setAgreed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dateOfBirth = user?.profile?.dateOfBirth;
  const isMinor = dateOfBirth ? calculateAge(new Date(dateOfBirth)) < 18 : false;

  const handleAccept = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      await acceptTerms(CURRENT_TERMS_VERSION);
    } catch (acceptError) {
      setError(getErrorMessage(acceptError, 'Could not save your agreement. Please try again.'));
      setIsSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    await logout();
    navigate('/');
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <PixelGasBackground className="bg-background" />

      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-mono font-bold">Before you continue</h1>
          <p className="text-muted-foreground">
            Please read and agree to our Terms of Service and Privacy Policy, effective {LEGAL_EFFECTIVE_DATE}.
            Your existing entries aren&apos;t affected, but you can&apos;t record new ones until you agree.
          </p>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <TermsConsent id="gateTerms" checked={agreed} onCheckedChange={setAgreed} isMinor={isMinor} />

        <Button type="button" className="w-full" disabled={!agreed || isSubmitting} onClick={handleAccept}>
          {isSubmitting ? 'Saving...' : 'Agree and continue'}
        </Button>

        <div className="text-center">
          <button
            type="button"
            onClick={handleSignOut}
            className="text-sm text-muted-foreground transition-colors hover:text-accent"
          >
            Sign out
          </button>
        </div>

        <details className="rounded-lg border border-border p-4 text-sm">
          <summary className="cursor-pointer text-muted-foreground">Don&apos;t agree? Delete your account instead</summary>
          <div className="mt-4">
            <DeleteAccountSection />
          </div>
        </details>
      </div>
    </div>
  );
}

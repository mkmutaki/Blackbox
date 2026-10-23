import { ReactNode } from 'react';
import { Link } from 'react-router-dom';

interface TermsConsentProps {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  // 13–17-year-olds need a parent or guardian to agree with them (Terms §2).
  isMinor?: boolean;
}

// The one affirmative step every account is created through, and the same
// box the acceptance prompt shows existing accounts. The links open in a new
// tab so reading the documents doesn't throw away a half-finished form.
export function TermsConsent({ id, checked, onCheckedChange, isMinor = false }: TermsConsentProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-start gap-3">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(e) => onCheckedChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-accent"
        />
        <label htmlFor={id} className="text-sm leading-relaxed text-muted-foreground">
          I agree to the <DocLink to="/terms">Terms of Service</DocLink>, and I have read the{' '}
          <DocLink to="/privacy">Privacy Policy</DocLink> and the{' '}
          <DocLink to="/health-data">Consumer Health Data Privacy Policy</DocLink>.
        </label>
      </div>
      {isMinor && (
        <p className="pl-7 text-xs leading-relaxed text-muted-foreground">
          Because you&apos;re under 18, a parent or guardian needs to read the Terms with you and agree to them
          too. Checking the box confirms they have.
        </p>
      )}
    </div>
  );
}

function DocLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} target="_blank" rel="noopener noreferrer" className="font-semibold text-accent hover:underline">
      {children}
    </Link>
  );
}

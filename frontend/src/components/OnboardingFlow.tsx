import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { cn, getSynodicDay } from '@/lib/utils';
import { ArrowLeft, Lock, ShieldCheck, Video } from 'lucide-react';

const AUTO_LOCK_CHOICES = [
  { minutes: 5, label: '5 min' },
  { minutes: 15, label: '15 min' },
  { minutes: 30, label: '30 min' },
  { minutes: 0, label: 'Never' },
];

const MAX_CALLSIGN_LENGTH = 32;
const TOTAL_CARDS = 4;

interface OnboardingFlowProps {
  isOpen: boolean;
  onComplete: () => void;
}

export function OnboardingFlow({ isOpen, onComplete }: OnboardingFlowProps) {
  const { user, completeOnboarding } = useAuth();

  const fullName = user?.profile?.fullName || user?.profile?.username || '';

  const [cardIndex, setCardIndex] = useState(0);
  const [callsign, setCallsign] = useState(fullName);
  const [autoLockMinutes, setAutoLockMinutes] = useState(
    user?.profile?.autoLockMinutes ?? 5
  );
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const synodicDay = getSynodicDay();
  const trimmedCallsign = callsign.trim();

  // Skipping still finishes onboarding — whatever has been chosen so far is
  // saved, so the flow never reappears for this account.
  const save = async () => {
    setError(null);
    setIsSaving(true);

    try {
      await completeOnboarding({
        username: trimmedCallsign || fullName,
        autoLockMinutes,
      });
      onComplete();
    } catch (err: any) {
      setError(
        err.response?.data?.error || 'Could not save your answers. Please try again.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const next = () => {
    setError(null);

    if (cardIndex === 1 && !trimmedCallsign) {
      setError('Please choose a callsign');
      return;
    }

    if (cardIndex === TOTAL_CARDS - 1) {
      void save();
      return;
    }

    setCardIndex((index) => index + 1);
  };

  const back = () => {
    setError(null);
    setCardIndex((index) => Math.max(0, index - 1));
  };

  const cards = [
    {
      title: 'Welcome to Blackbox',
      subtitle: 'A secure place to record and keep your mission logs.',
      primaryLabel: 'Get started',
      body: (
        <div className="flex flex-col items-center gap-4 py-6">
          <div className="flex h-24 w-24 items-center justify-center rounded-full border border-accent/30 bg-accent/10">
            <Video className="h-10 w-10 text-accent" strokeWidth={1.5} />
          </div>
          <p className="max-w-xs text-center font-mono text-sm text-muted-foreground">
            Four quick steps and the log is yours.
          </p>
        </div>
      ),
    },
    {
      title: 'Choose your callsign',
      subtitle: 'This is the name stamped on every log you record. You can change it later in settings.',
      primaryLabel: 'Continue',
      body: (
        <div className="space-y-4 py-4">
          <Input
            id="callsign"
            autoFocus
            maxLength={MAX_CALLSIGN_LENGTH}
            placeholder="Callsign"
            value={callsign}
            onChange={(event) => setCallsign(event.target.value)}
            className="font-mono"
            disabled={isSaving}
          />

          <div className="rounded-lg border border-border/50 bg-secondary/40 p-4">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Log preview
            </p>
            <p className="mt-2 font-mono text-lg font-bold text-foreground">
              SYNODIC {synodicDay}
            </p>
            <p className="font-mono text-sm text-accent">
              {trimmedCallsign || fullName || 'Your callsign'}
            </p>
          </div>
        </div>
      ),
    },
    {
      title: 'Your recordings are encrypted',
      subtitle: null,
      primaryLabel: 'Continue',
      body: (
        <div className="space-y-5 py-4">
          <div className="flex gap-3 rounded-lg border border-border/50 bg-secondary/40 p-4">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-accent" strokeWidth={1.5} />
            <p className="font-mono text-sm leading-relaxed text-muted-foreground">
              Every recording is encrypted in this browser with AES-256-GCM before a
              single byte leaves your device. What gets stored is ciphertext — your
              camera feed is never uploaded in the clear, and your logs are reachable
              only through your authenticated account.
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
              <p className="font-mono text-sm text-foreground">
                Lock the log after how long idle?
              </p>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {AUTO_LOCK_CHOICES.map((choice) => (
                <button
                  key={choice.minutes}
                  type="button"
                  onClick={() => setAutoLockMinutes(choice.minutes)}
                  disabled={isSaving}
                  aria-pressed={autoLockMinutes === choice.minutes}
                  className={cn(
                    'rounded-md border px-2 py-2 font-mono text-sm transition-colors',
                    autoLockMinutes === choice.minutes
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-border/50 text-muted-foreground hover:border-accent/50'
                  )}
                >
                  {choice.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      ),
    },
    {
      title: 'Why SYNODIC?',
      subtitle: null,
      primaryLabel: 'Begin your journey',
      body: (
        <div className="space-y-4 py-4">
          <p className="font-mono text-sm leading-relaxed text-muted-foreground">
            A synodic day is one full turn of the Earth relative to the Sun — the
            24-hour day you actually live, rather than the 23 hours and 56 minutes it
            takes the planet to spin once against the stars.
          </p>
          <p className="font-mono text-sm leading-relaxed text-muted-foreground">
            Your logs are numbered by synodic day, counting from January 1st. It is
            fixed for everyone, so entries line up no matter when you started.
          </p>
          <div className="rounded-lg border border-accent/30 bg-accent/10 p-4 text-center">
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Today
            </p>
            <p className="mt-1 font-mono text-2xl font-bold text-accent">
              SYNODIC {synodicDay}
            </p>
          </div>
        </div>
      ),
    },
  ];

  const card = cards[cardIndex];
  const isLastCard = cardIndex === TOTAL_CARDS - 1;

  return (
    <Dialog open={isOpen} modal>
      <DialogContent
        className="sm:max-w-lg"
        hideCloseButton
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <DialogTitle className="sr-only">Set up Blackbox</DialogTitle>

        <div className="flex items-center justify-between">
          {cardIndex > 0 ? (
            <button
              type="button"
              onClick={back}
              disabled={isSaving}
              className="flex items-center gap-1 font-mono text-sm text-muted-foreground transition-colors hover:text-accent"
            >
              <ArrowLeft size={16} />
              Back
            </button>
          ) : (
            <span />
          )}

          <div className="flex gap-1.5">
            {cards.map((_, index) => (
              <span
                key={index}
                className={cn(
                  'h-1.5 w-1.5 rounded-full transition-colors',
                  index === cardIndex ? 'bg-accent' : 'bg-border'
                )}
              />
            ))}
          </div>
        </div>

        <div className="mt-2">
          <h2 className="font-mono text-2xl font-bold text-foreground">{card.title}</h2>
          {card.subtitle && (
            <p className="mt-2 font-mono text-sm text-muted-foreground">{card.subtitle}</p>
          )}
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {card.body}

        <div className="flex items-center justify-between gap-3">
          {isLastCard ? (
            <span />
          ) : (
            <Button type="button" variant="ghost" onClick={save} disabled={isSaving}>
              Skip
            </Button>
          )}

          <Button type="button" onClick={next} disabled={isSaving}>
            {isSaving ? 'Saving...' : card.primaryLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

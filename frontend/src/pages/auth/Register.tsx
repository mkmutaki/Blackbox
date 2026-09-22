import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from '@/components/ui/use-toast';
import { GoogleAuthButton } from '@/components/auth/GoogleAuthButton';
import { Mail, ArrowLeft } from 'lucide-react';
import { PixelGasBackground } from '@/components/PixelGasBackground';

type Step = 'initial' | 'name' | 'birthday' | 'email' | 'password';

const PREVIOUS_STEP: Record<Step, Step | null> = {
  initial: null,
  name: 'initial',
  birthday: 'name',
  email: 'birthday',
  password: 'email',
};

const fieldLabelClass = 'mb-2 block text-xs font-mono uppercase tracking-wider text-muted-foreground';

export default function Register() {
  const [step, setStep] = useState<Step>('initial');
  const [fullName, setFullName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [dobMonth, setDobMonth] = useState('');
  const [dobDay, setDobDay] = useState('');
  const [dobYear, setDobYear] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dobMonthRef = useRef<HTMLInputElement>(null);
  const dobDayRef = useRef<HTMLInputElement>(null);
  const dobYearRef = useRef<HTMLInputElement>(null);

  const { register } = useAuth();
  const navigate = useNavigate();

  const goTo = (nextStep: Step) => {
    setError(null);
    setStep(nextStep);
  };

  const handleNameSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!fullName.trim()) {
      setError('Please enter your full name');
      return;
    }

    goTo('birthday');
  };

  const handleDobDigitsChange = (
    raw: string,
    maxLength: number,
    setValue: (value: string) => void,
    nextRef?: React.RefObject<HTMLInputElement>
  ) => {
    const digits = raw.replace(/\D/g, '').slice(0, maxLength);
    setValue(digits);
    if (digits.length === maxLength && nextRef?.current) {
      nextRef.current.focus();
    }
  };

  const handleDobBackspace = (
    e: React.KeyboardEvent<HTMLInputElement>,
    prevRef: React.RefObject<HTMLInputElement>
  ) => {
    if (e.key === 'Backspace' && e.currentTarget.value === '') {
      prevRef.current?.focus();
    }
  };

  const handleBirthdaySubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!dobMonth || !dobDay || !dobYear || dobYear.length < 4) {
      setError('Please enter your date of birth');
      return;
    }

    const month = Number(dobMonth);
    const day = Number(dobDay);

    if (month < 1 || month > 12 || day < 1 || day > 31) {
      setError('Please enter a valid date of birth');
      return;
    }

    const isoDate = `${dobYear}-${dobMonth.padStart(2, '0')}-${dobDay.padStart(2, '0')}`;
    const birthDate = new Date(isoDate);
    const today = new Date();
    const age = today.getFullYear() - birthDate.getFullYear();

    if (
      Number.isNaN(birthDate.getTime()) ||
      birthDate.getUTCMonth() + 1 !== month ||
      birthDate.getUTCDate() !== day
    ) {
      setError('Please enter a valid date of birth');
      return;
    }

    if (birthDate > today) {
      setError('Date of birth cannot be in the future');
      return;
    }

    if (age > 120 || age < 13) {
      setError('Please enter a valid date of birth');
      return;
    }

    setDateOfBirth(isoDate);
    goTo('email');
  };

  const handleEmailSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError('Please enter your email address');
      return;
    }

    goTo('password');
  };

  const handlePasswordSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!password) {
      setError('Please enter a password');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }

    setIsLoading(true);

    try {
      await register(email, password, fullName.trim(), dateOfBirth);
      toast({
        title: 'Account created successfully',
        description: 'Welcome to Blackbox!',
      });
      navigate('/home');
    } catch (error: any) {
      setError(
        error.response?.data?.error ||
        'Registration failed. Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <PixelGasBackground className="bg-background" />

      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="relative flex items-center justify-center">
            {step !== 'initial' && (
              <button
                type="button"
                onClick={() => goTo(PREVIOUS_STEP[step]!)}
                className="absolute left-0 flex items-center gap-1 text-sm text-muted-foreground hover:text-accent transition-colors"
              >
                <ArrowLeft size={16} />
                Back
              </button>
            )}
            <h1 className="text-3xl font-mono font-bold">Create Account</h1>
          </div>
          <p className="mt-2 text-muted-foreground">
            Sign up to start recording your mission logs
          </p>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {step === 'initial' && (
          <div className="space-y-4">
            <GoogleAuthButton text="signup_with" onError={setError} />

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground font-mono">Or</span>
              </div>
            </div>

            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={() => goTo('name')}
            >
              <Mail />
              Sign up with Email
            </Button>

            <div className="text-center text-sm">
              <p className="text-muted-foreground">
                Already have an account?{' '}
                <Link to="/login" className="font-semibold text-accent hover:underline">
                  Login here
                </Link>
              </p>
            </div>
          </div>
        )}

        {step === 'name' && (
          <form className="space-y-6" onSubmit={handleNameSubmit}>
            <div>
              <Label htmlFor="fullName" className={fieldLabelClass}>
                Full Name
              </Label>
              <Input
                id="fullName"
                name="fullName"
                type="text"
                autoComplete="name"
                autoFocus
                required
                placeholder="Full name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="font-mono"
              />
            </div>

            <Button type="submit" className="w-full">
              Continue
            </Button>
          </form>
        )}

        {step === 'birthday' && (
          <form className="space-y-6" onSubmit={handleBirthdaySubmit}>
            <div>
              <Label htmlFor="dobMonth" className={fieldLabelClass}>
                Date of Birth
              </Label>
              <div className="grid grid-cols-[1fr_1fr_1.3fr] gap-3">
                <div>
                  <Input
                    ref={dobMonthRef}
                    id="dobMonth"
                    name="dobMonth"
                    type="text"
                    inputMode="numeric"
                    autoComplete="bday-month"
                    autoFocus
                    required
                    maxLength={2}
                    placeholder="mm"
                    value={dobMonth}
                    onChange={(e) =>
                      handleDobDigitsChange(e.target.value, 2, setDobMonth, dobDayRef)
                    }
                    className="font-mono text-center"
                  />
                  <p className="mt-1.5 text-center text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                    Month
                  </p>
                </div>
                <div>
                  <Input
                    ref={dobDayRef}
                    id="dobDay"
                    name="dobDay"
                    type="text"
                    inputMode="numeric"
                    autoComplete="bday-day"
                    required
                    maxLength={2}
                    placeholder="dd"
                    value={dobDay}
                    onChange={(e) =>
                      handleDobDigitsChange(e.target.value, 2, setDobDay, dobYearRef)
                    }
                    onKeyDown={(e) => handleDobBackspace(e, dobMonthRef)}
                    className="font-mono text-center"
                  />
                  <p className="mt-1.5 text-center text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                    Day
                  </p>
                </div>
                <div>
                  <Input
                    ref={dobYearRef}
                    id="dobYear"
                    name="dobYear"
                    type="text"
                    inputMode="numeric"
                    autoComplete="bday-year"
                    required
                    maxLength={4}
                    placeholder="yyyy"
                    value={dobYear}
                    onChange={(e) => handleDobDigitsChange(e.target.value, 4, setDobYear)}
                    onKeyDown={(e) => handleDobBackspace(e, dobDayRef)}
                    className="font-mono text-center"
                  />
                  <p className="mt-1.5 text-center text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                    Year
                  </p>
                </div>
              </div>
            </div>

            <Button type="submit" className="w-full">
              Continue
            </Button>
          </form>
        )}

        {step === 'email' && (
          <form className="space-y-6" onSubmit={handleEmailSubmit}>
            <div>
              <Label htmlFor="email" className={fieldLabelClass}>
                Email Address
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                autoFocus
                required
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="font-mono"
              />
            </div>

            <Button type="submit" className="w-full">
              Continue
            </Button>
          </form>
        )}

        {step === 'password' && (
          <form className="space-y-6" onSubmit={handlePasswordSubmit}>
            <div className="space-y-4">
              <div>
                <Label htmlFor="password" className={fieldLabelClass}>
                  Password
                </Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  autoFocus
                  required
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="font-mono"
                />
              </div>
              <div>
                <Label htmlFor="confirmPassword" className={fieldLabelClass}>
                  Confirm Password
                </Label>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  placeholder="Confirm Password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="font-mono"
                />
              </div>
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={isLoading}
            >
              {isLoading ? 'Creating Account...' : 'Create Account'}
            </Button>
          </form>
        )}

        {step !== 'initial' && (
          <div className="text-center text-sm">
            <p className="text-muted-foreground">
              Already have an account?{' '}
              <Link to="/login" className="font-semibold text-accent hover:underline">
                Login here
              </Link>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from '@/components/ui/use-toast';
import { GoogleAuthButton } from '@/components/auth/GoogleAuthButton';
import { Mail, ArrowLeft } from 'lucide-react';

type Step = 'initial' | 'name' | 'birthday' | 'email' | 'password';

export default function Register() {
  const [step, setStep] = useState<Step>('initial');
  const [fullName, setFullName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const handleBirthdaySubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!dateOfBirth) {
      setError('Please enter your date of birth');
      return;
    }

    const birthDate = new Date(dateOfBirth);
    const today = new Date();
    const age = today.getFullYear() - birthDate.getFullYear();

    if (birthDate > today) {
      setError('Date of birth cannot be in the future');
      return;
    }

    if (age > 120 || age < 13) {
      setError('Please enter a valid date of birth');
      return;
    }

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
      navigate('/');
    } catch (error: any) {
      setError(
        error.response?.data?.error ||
        'Registration failed. Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const BackButton = ({ onClick }: { onClick: () => void }) => (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 text-sm text-muted-foreground hover:text-accent transition-colors"
    >
      <ArrowLeft size={16} />
      Back
    </button>
  );

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-mono font-bold">Create Account</h1>
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
            <BackButton onClick={() => goTo('initial')} />

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

            <Button type="submit" className="w-full">
              Continue
            </Button>
          </form>
        )}

        {step === 'birthday' && (
          <form className="space-y-6" onSubmit={handleBirthdaySubmit}>
            <BackButton onClick={() => goTo('name')} />

            <Input
              id="dateOfBirth"
              name="dateOfBirth"
              type="date"
              autoFocus
              required
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
              className="font-mono"
            />

            <Button type="submit" className="w-full">
              Continue
            </Button>
          </form>
        )}

        {step === 'email' && (
          <form className="space-y-6" onSubmit={handleEmailSubmit}>
            <BackButton onClick={() => goTo('birthday')} />

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

            <Button type="submit" className="w-full">
              Continue
            </Button>
          </form>
        )}

        {step === 'password' && (
          <form className="space-y-6" onSubmit={handlePasswordSubmit}>
            <BackButton onClick={() => goTo('email')} />

            <div className="space-y-4">
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

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { register, error, clearError } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    clearError();
    setPasswordError('');

    // Validate passwords match
    if (password !== confirmPassword) {
      setPasswordError('Passwords do not match');
      setIsSubmitting(false);
      return;
    }

    try {
      await register(email, password);
      navigate('/');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-black text-white">
      <div className="w-full max-w-md p-4">
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold text-center">BLACK BOX</CardTitle>
            <CardDescription className="text-center text-gray-400">
              Create a new account to start logging
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Input
                  className="bg-gray-800 border-gray-700 text-white"
                  id="email"
                  placeholder="Email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Input
                  className="bg-gray-800 border-gray-700 text-white"
                  id="password"
                  placeholder="Password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Input
                  className="bg-gray-800 border-gray-700 text-white"
                  id="confirmPassword"
                  placeholder="Confirm Password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
              {passwordError && <p className="text-red-500 text-sm">{passwordError}</p>}
              {error && <p className="text-red-500 text-sm">{error}</p>}
              <Button
                className="w-full bg-blue-600 hover:bg-blue-700"
                type="submit"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Creating Account...' : 'Register'}
              </Button>
            </form>
          </CardContent>
          <CardFooter className="flex flex-col space-y-2">
            <div className="text-center text-sm text-gray-400">
              Already have an account?{' '}
              <Link to="/login" className="text-blue-500 hover:text-blue-400">
                Login
              </Link>
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
import { GoogleLogin, CredentialResponse } from '@react-oauth/google';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/components/ui/use-toast';

interface GoogleAuthButtonProps {
  text?: 'signin_with' | 'signup_with' | 'continue_with';
  onError: (message: string) => void;
}

export function GoogleAuthButton({ text = 'continue_with', onError }: GoogleAuthButtonProps) {
  const { loginWithGoogle } = useAuth();
  const navigate = useNavigate();

  const handleSuccess = async (credentialResponse: CredentialResponse) => {
    if (!credentialResponse.credential) {
      onError('No credential received from Google. Please try again.');
      return;
    }

    try {
      await loginWithGoogle(credentialResponse.credential);
      toast({
        title: 'Signed in with Google',
        description: 'Welcome to Blackbox!',
      });
      navigate('/');
    } catch (error: any) {
      onError(error.response?.data?.error || 'Google sign-in failed. Please try again.');
    }
  };

  return (
    <div className="flex justify-center">
      <GoogleLogin
        onSuccess={handleSuccess}
        onError={() => onError('Google sign-in failed. Please try again.')}
        theme="filled_black"
        shape="pill"
        size="large"
        text={text}
      />
    </div>
  );
}

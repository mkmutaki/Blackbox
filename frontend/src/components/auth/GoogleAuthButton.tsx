import { useState } from 'react';
import { GoogleLogin, CredentialResponse } from '@react-oauth/google';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/components/ui/use-toast';
import { GoogleSignupDetails } from '@/components/auth/GoogleSignupDetails';
import type { GoogleSignupDetails as Details } from '@/context/AuthContext';
import { getErrorCode, getErrorMessage } from '@/lib/errorMessage';
import { SIGNUP_DETAILS_REQUIRED } from '@/lib/legal';

interface GoogleAuthButtonProps {
  text?: 'signin_with' | 'signup_with' | 'continue_with';
  onError: (message: string) => void;
}

export function GoogleAuthButton({ text = 'continue_with', onError }: GoogleAuthButtonProps) {
  const { loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  // Held when Google sign-in worked but no Blackbox account exists for it:
  // the same credential is resent once the details step is filled in.
  const [pendingCredential, setPendingCredential] = useState<string | null>(null);

  const completeSignIn = async (credential: string, signup?: Details) => {
    await loginWithGoogle(credential, signup);
    toast({
      title: signup ? 'Account created' : 'Signed in with Google',
      description: 'Welcome to Blackbox!',
    });
    navigate('/home');
  };

  const handleSuccess = async (credentialResponse: CredentialResponse) => {
    if (!credentialResponse.credential) {
      onError('No credential received from Google. Please try again.');
      return;
    }

    try {
      await completeSignIn(credentialResponse.credential);
    } catch (error) {
      if (getErrorCode(error) === SIGNUP_DETAILS_REQUIRED) {
        setPendingCredential(credentialResponse.credential);
        return;
      }
      onError(getErrorMessage(error, 'Google sign-in failed. Please try again.'));
    }
  };

  if (pendingCredential) {
    return (
      <GoogleSignupDetails
        onSubmit={(details) => completeSignIn(pendingCredential, details)}
        onCancel={() => setPendingCredential(null)}
      />
    );
  }

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

import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { GoogleOAuthProvider } from "@react-oauth/google";

// Pages
import Index from "./pages/Index";
import Landing from "./pages/Landing";
import NotFound from "./pages/NotFound";
import Login from "./pages/auth/Login";
import Register from "./pages/auth/Register";
import ForgotPassword from "./pages/auth/ForgotPassword";
import ResetPassword from "./pages/auth/ResetPassword";
import VerifyEmail from "./pages/auth/VerifyEmail";
import Terms from "./pages/legal/Terms";
import Privacy from "./pages/legal/Privacy";
import HealthData from "./pages/legal/HealthData";

// Components
import { Header } from "./components/Header";
import { LogoutTimer } from "./components/LogoutTimer";

// Auth
import { AuthProvider } from "./context/AuthContext";
import { RecordingProvider } from "./context/RecordingContext";
import { ProtectedRoute } from "./components/ProtectedRoute";

const App = () => (
  <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
    <AuthProvider>
      <RecordingProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter basename={import.meta.env.PROD ? '/Blackbox' : ''}>
          <Header />
          <Routes>
            <Route path="/" element={<Landing />} />

            {/* Protected routes */}
            <Route
              path="/home"
              element={
                <ProtectedRoute>
                  <Index />
                </ProtectedRoute>
              }
            />

            {/* Public routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/health-data" element={<HealthData />} />

            {/* Catch-all route */}
            <Route path="*" element={<NotFound />} />
          </Routes>

          {/* Auto-logout timer - only shows when user is authenticated */}
          <LogoutTimer
            timeoutMinutes={5}
            showWarningAt={120} // 2 minutes warning
          />
        </BrowserRouter>
      </RecordingProvider>
    </AuthProvider>
  </GoogleOAuthProvider>
);

export default App;

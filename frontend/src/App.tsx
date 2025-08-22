import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";

// Pages
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Login from "./pages/auth/Login";
import Register from "./pages/auth/Register";

// Components
import { Header } from "./components/Header";
import { LogoutTimer } from "./components/LogoutTimer";

// Auth
import { AuthProvider } from "./context/AuthContext";
import { RecordingProvider } from "./context/RecordingContext";
import { ProtectedRoute } from "./components/ProtectedRoute";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <RecordingProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter basename={import.meta.env.PROD ? '/Blackbox' : ''}>
            <Header />
            <Routes>
              {/* Protected routes */}
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <Index />
                  </ProtectedRoute>
                }
              />
              
              {/* Public routes */}
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              
              {/* Catch-all route */}
              <Route path="*" element={<NotFound />} />
            </Routes>

            {/* Auto-logout timer - only shows when user is authenticated */}
            <LogoutTimer 
              timeoutMinutes={5} 
              showWarningAt={120} // 2 minutes warning
            />
          </BrowserRouter>
        </TooltipProvider>
      </RecordingProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;

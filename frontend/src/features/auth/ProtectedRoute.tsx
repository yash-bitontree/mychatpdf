import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@clerk/clerk-react";

export interface AuthState {
  isLoaded: boolean;
  isSignedIn: boolean;
}

interface ProtectedRouteProps {
  children: ReactNode;
  authState?: AuthState;
}

function ProtectedContent({ authState, children }: Required<ProtectedRouteProps>) {
  const location = useLocation();

  if (!authState.isLoaded) {
    return (
      <main aria-busy="true" className="min-h-screen bg-mist">
        <span role="status" aria-label="Opening workspace" className="sr-only">
          Opening workspace
        </span>
      </main>
    );
  }

  if (!authState.isSignedIn) {
    return <Navigate to="/sign-in" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}

function ClerkProtectedRoute({ children }: Pick<ProtectedRouteProps, "children">) {
  const { isLoaded, isSignedIn } = useAuth();
  return <ProtectedContent authState={{ isLoaded, isSignedIn: Boolean(isSignedIn) }}>{children}</ProtectedContent>;
}

export function ProtectedRoute({ authState, children }: ProtectedRouteProps) {
  if (authState) {
    return <ProtectedContent authState={authState}>{children}</ProtectedContent>;
  }

  return <ClerkProtectedRoute>{children}</ClerkProtectedRoute>;
}

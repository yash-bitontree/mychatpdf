import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "./ProtectedRoute";
import { renderWithRouter } from "../../test/test-utils";

describe("ProtectedRoute", () => {
  it("keeps private content hidden while Clerk auth is unresolved", () => {
    renderWithRouter(
      <Routes>
        <Route
          path="/app"
          element={
            <ProtectedRoute authState={{ isLoaded: false, isSignedIn: false }}>
              <main>Private app</main>
            </ProtectedRoute>
          }
        />
      </Routes>,
      ["/app"]
    );

    expect(screen.getByRole("status", { name: /opening workspace/i })).toBeInTheDocument();
    expect(screen.queryByText(/checking your session/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/private app/i)).not.toBeInTheDocument();
  });

  it("redirects unauthenticated users to sign in", () => {
    renderWithRouter(
      <Routes>
        <Route
          path="/app"
          element={
            <ProtectedRoute authState={{ isLoaded: true, isSignedIn: false }}>
              <main>Private app</main>
            </ProtectedRoute>
          }
        />
        <Route path="/sign-in" element={<main>Sign in screen</main>} />
      </Routes>,
      ["/app"]
    );

    expect(screen.getByText(/sign in screen/i)).toBeInTheDocument();
    expect(screen.queryByText(/private app/i)).not.toBeInTheDocument();
  });
});

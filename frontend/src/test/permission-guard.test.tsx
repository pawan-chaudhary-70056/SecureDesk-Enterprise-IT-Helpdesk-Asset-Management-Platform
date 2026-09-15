import { describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RequirePermission } from "@/app/guards";
import { AuthProvider, useAuth } from "@/features/auth/auth-context";

// Mock the API layer used by AuthProvider session restore.
vi.mock("@/api/auth", () => ({
  fetchMe: vi.fn().mockRejectedValue(new Error("not logged in")),
  login: vi.fn(),
  logout: vi.fn(),
}));

describe("RequirePermission (permission-aware UX)", () => {
  it("shows the not-authorized panel when the permission is missing", async () => {
    function Probe() {
      const auth = useAuth();
      // Simulate an employee without audit:read.
      (auth as { has: (perm: string) => boolean }).has = (perm: string) => perm === "ticket:read:own";
      return <RequirePermission perm="audit:read">SECRET CONTENT</RequirePermission>;
    }
    render(
      <MemoryRouter>
        <AuthProvider>
          <Probe />
        </AuthProvider>
      </MemoryRouter>,
    );
    // Flush the async session-restore effect inside act() so the state update
    // it triggers does not warn.
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByText("SECRET CONTENT")).toBeNull();
    expect(screen.getByText(/Not authorized/i)).toBeDefined();
  });
});

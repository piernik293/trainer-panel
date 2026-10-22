/**
 * @vitest-environment happy-dom
 *
 * SessionProblemGuard — 401 handling without redirect loops.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import React from "react";

let signedIn = true;
const signOut = vi.fn();
const navigate = vi.fn();
vi.mock("@clerk/react", () => ({
  useAuth: () => ({ isSignedIn: signedIn }),
  useClerk: () => ({ signOut }),
}));
vi.mock("wouter", () => ({ useLocation: () => ["/", navigate] }));

import { SessionProblemGuard } from "@/components/SessionProblemGuard";

function Failing({ status }: { status: number }) {
  useQuery({
    queryKey: ["failing", status],
    queryFn: async () => {
      throw Object.assign(new Error("x"), { status });
    },
  });
  return <div>Ekran trenera</div>;
}

function renderWith(status: number) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <SessionProblemGuard>
        <Failing status={status} />
      </SessionProblemGuard>
    </QueryClientProvider>,
  );
}

describe("SessionProblemGuard", () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); signedIn = true; });

  it("browser session present + server 401 → 'Problem z logowaniem' with sign-out, no redirect", async () => {
    renderWith(401);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Problem z logowaniem");
    expect(screen.getByText("Wyloguj się")).toBeTruthy();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("no browser session + 401 → redirect to the trainer sign-in page", async () => {
    signedIn = false;
    renderWith(401);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/trainer/sign-in"));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("other errors (500) are left to the screen", async () => {
    renderWith(500);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByText("Ekran trenera")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });
});

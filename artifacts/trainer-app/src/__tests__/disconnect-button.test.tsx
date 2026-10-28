/** @vitest-environment happy-dom */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

const navigate = vi.fn();
const customFetch = vi.fn(async () => ({ ok: true }));
vi.mock("wouter", () => ({ useLocation: () => ["/clients/349", navigate] }));
vi.mock("@workspace/api-client-react", () => ({ customFetch: (...a: unknown[]) => (customFetch as (...x: unknown[]) => unknown)(...a) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { DisconnectButton } from "../components/DisconnectButton";

afterEach(() => { cleanup(); navigate.mockClear(); customFetch.mockClear(); vi.unstubAllGlobals(); });
const wrap = (ui: React.ReactElement) => render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

describe("Odłącz podopiecznego", () => {
  it("po potwierdzeniu odłącza i wraca na listę klientów (nie zostaje na stronie odłączonego)", async () => {
    vi.stubGlobal("confirm", vi.fn(() => true));
    wrap(<DisconnectButton clientId={349} />);
    fireEvent.click(screen.getByTestId("disconnect-client"));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith("/clients"));
    expect(customFetch).toHaveBeenCalledWith("/api/clients/349/disconnect", { method: "POST" });
  });
  it("bez potwierdzenia nic się nie dzieje", async () => {
    vi.stubGlobal("confirm", vi.fn(() => false));
    wrap(<DisconnectButton clientId={349} />);
    fireEvent.click(screen.getByTestId("disconnect-client"));
    await new Promise((r) => setTimeout(r, 30));
    expect(customFetch).not.toHaveBeenCalled(); expect(navigate).not.toHaveBeenCalled();
  });
});

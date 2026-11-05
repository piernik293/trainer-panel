// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const calls: { url: string; body: Record<string, unknown> }[] = [];
let failWithJoint = false;
vi.mock("@workspace/api-client-react", async (orig) => ({
  ...(await orig<object>()),
  useListClients: () => ({ data: [{ id: 3, firstName: "Źródło", lastName: "X" }, { id: 4, firstName: "Ola", lastName: "Nowak" }] }),
  customFetch: async (url: string, init?: { body?: string }) => {
    const body = JSON.parse(init?.body ?? "{}"); calls.push({ url, body });
    if (failWithJoint && body.acknowledgeJointWarning !== true) throw Object.assign(new Error("409"), { status: 409, data: { code: "EXERCISE_LOADS_REPORTED_JOINT", error: "Przysiad: kolano." } });
    return { planId: 55 };
  },
}));
vi.mock("wouter", () => ({ useLocation: () => ["/", vi.fn()] }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
import { CopyPlanDialog } from "@/components/CopyPlanDialog";

const wrap = () => render(<QueryClientProvider client={new QueryClient()}><CopyPlanDialog planId={9} fromClientId={3} open onOpenChange={() => {}} /></QueryClientProvider>);
afterEach(() => { cleanup(); calls.length = 0; failWithJoint = false; });

describe("Kopiuj plan", () => {
  it("lista bez podopiecznego źródłowego; kliknięcie kopiuje do wybranego; osobny przycisk szablonu", async () => {
    wrap();
    const targets = screen.getByTestId("copy-targets"); expect(targets.textContent).toContain("Ola Nowak"); expect(targets.textContent).not.toContain("Źródło");
    fireEvent.click(screen.getByText("Ola Nowak"));
    await waitFor(() => expect(calls[0]).toEqual({ url: "/api/plans/9/copy", body: { target: "client", clientId: 4 } }));
    fireEvent.click(screen.getByTestId("copy-to-template"));
    await waitFor(() => expect(calls[1]!.body).toEqual({ target: "template" }));
  });
  it("zgłoszony staw: ostrzeżenie, a „Kopiuj mimo to” wysyła potwierdzenie", async () => {
    failWithJoint = true; wrap();
    fireEvent.click(screen.getByText("Ola Nowak"));
    await screen.findByTestId("copy-joint-warning");
    fireEvent.click(screen.getByText("Kopiuj mimo to"));
    await waitFor(() => expect(calls[1]!.body).toEqual({ target: "client", clientId: 4, acknowledgeJointWarning: true }));
  });
});

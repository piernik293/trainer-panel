// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { previousMonth, MonthlyReportButton } from "./MonthlyReportButton";

const customFetch = vi.fn();
vi.mock("@workspace/api-client-react", () => ({ customFetch: (...a: unknown[]) => customFetch(...a) }));
afterEach(() => { cleanup(); customFetch.mockReset(); });

describe("MonthlyReportButton", () => {
  it("previous month, also across a year boundary", () => {
    expect(previousMonth(new Date(2026, 9, 26))).toBe("2026-09");
    expect(previousMonth(new Date(2027, 0, 5))).toBe("2026-12");
  });
  it("sends the chosen options (pain details and trainer name off by default) and asks for a blob", async () => {
    customFetch.mockResolvedValue(new Blob(["%PDF"]));
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:x", revokeObjectURL: () => {} }));
    render(<MonthlyReportButton clientId={7} clientName="Ala Nowak" />);
    fireEvent.click(screen.getByTestId("report-open"));
    fireEvent.change(await screen.findByLabelText("Notatka trenera"), { target: { value: "Dobra robota" } });
    fireEvent.click(screen.getByTestId("report-download"));
    await waitFor(() => expect(customFetch).toHaveBeenCalled());
    const [url, init] = customFetch.mock.calls[0] as [string, { body: string; responseType: string; method: string }];
    expect(url).toBe("/api/clients/7/monthly-report"); expect(init.method).toBe("POST"); expect(init.responseType).toBe("blob");
    expect(JSON.parse(init.body)).toMatchObject({ month: previousMonth(), note: "Dobra robota", includePainDetails: false, includeTrainerName: false });
  });
  it("shows a friendly error when the report fails", async () => {
    customFetch.mockRejectedValue(new Error("boom"));
    render(<MonthlyReportButton clientId={7} clientName="Ala Nowak" />);
    fireEvent.click(screen.getByTestId("report-open"));
    fireEvent.click(await screen.findByTestId("report-download"));
    expect((await screen.findByRole("alert")).textContent).toBeTruthy();
  });
});

/**
 * @vitest-environment happy-dom
 *
 * Style option "Kalistenika" in the plan editor: invisible by default (CALISTHENICS_ENABLED off → the API says enabled:false),
 * visible only when the API says it is on. Docs: docs/KALISTENIKA.md.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import React from "react";

vi.mock("@workspace/api-client-react", async (orig) => {
  const actual = await orig<Record<string, unknown>>();
  return { ...actual, useGetClientAvoidedExercises: () => ({ data: [] }) };
});

vi.mock("@/components/VolumeCoverageSection", () => ({ WeeklyVolumeCoverage: () => null }));

import Step4Exercises from "../pages/Step4Exercises";

const distribution = { days: [], targetDecisions: [], warnings: [], summary: {} } as never;
function renderIt() {
  return render(<Step4Exercises distributionResult={distribution} exerciseDraft={{}} onDraftChange={() => {}} clientId={1} previewResult={null} coverageLoading={false} experienceLevel="Początkujący" sessionDurationMinutes={60} />);
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("style option in the editor", () => {
  it("flag off: no option", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ enabled: false }) }));
    vi.stubGlobal("fetch", fetchMock);
    renderIt();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/calisthenics/status"));
    expect(screen.queryByText("Styl: kalistenika")).toBeNull();
  });
  it("API unreachable: no option, nothing breaks", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    renderIt();
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText("Styl: kalistenika")).toBeNull();
  });
  it("flag on: the option appears", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ enabled: true }) })));
    renderIt();
    expect(await screen.findByText("Styl: kalistenika")).toBeTruthy();
  });
});

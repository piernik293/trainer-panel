// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { AppHero } from "@workspace/design-tokens/hero";

describe("AppHero", () => {
  it("photo is decorative (alt empty) and the mascot slot renders nothing by default", () => {
    const { container } = render(<AppHero variant="login" />);
    const img = container.querySelector("img")!;
    expect(img.getAttribute("alt")).toBe("");
    expect(container.querySelector(".app-hero__mascot")).toBeNull();
    expect(container.querySelector(".app-hero__content")).toBeNull();
  });
  it("renders text and mascot slot when given", () => {
    const { container, getByText } = render(
      <AppHero variant="portal-welcome" mascot={<i data-testid="m" />}>Cześć</AppHero>,
    );
    expect(getByText("Cześć")).toBeTruthy();
    expect(container.querySelector(".app-hero__mascot")?.getAttribute("aria-hidden")).toBe("true");
  });
  it("uses duotone by default, darkened original only on request", () => {
    expect(render(<AppHero variant="login" />).container.querySelector(".app-hero")?.getAttribute("data-tone")).toBe("duotone");
    expect(render(<AppHero variant="login" tone="dark" />).container.querySelector(".app-hero")?.getAttribute("data-tone")).toBe("dark");
  });
});

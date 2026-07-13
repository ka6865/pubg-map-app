import { describe, expect, it, vi, beforeEach } from "vitest";

describe("Vercel usage controls", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.NEXT_PUBLIC_ENABLE_SPEED_INSIGHTS;
  });

  it("Speed Insights는 명시적으로 켠 경우에만 활성화한다", async () => {
    const { isVercelSpeedInsightsEnabled } = await import("../lib/vercel-usage-controls");

    expect(isVercelSpeedInsightsEnabled()).toBe(false);

    process.env.NEXT_PUBLIC_ENABLE_SPEED_INSIGHTS = "true";
    expect(isVercelSpeedInsightsEnabled()).toBe(true);
  });
});

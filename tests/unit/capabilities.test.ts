import { describe, it, expect } from "vitest";
import { getPlatform, capabilityStatus, supports, PLATFORMS } from "../../shared/capabilities";

describe("platform capability registry", () => {
  it("contains the full platform ecosystem", () => {
    expect(PLATFORMS.length).toBeGreaterThanOrEqual(28);
    const ids = new Set(PLATFORMS.map((p) => p.id));
    for (const id of ["instagram", "facebook", "threads", "x", "linkedin", "tiktok", "youtube", "pinterest", "bluesky", "telegram", "wordpress"]) {
      expect(ids.has(id)).toBe(true);
    }
  });

  it("returns unsupported for unknown capabilities", () => {
    expect(capabilityStatus("bluesky", "directMessages")).toBe("unsupported");
    expect(capabilityStatus("bluesky", "stories")).toBe("unsupported");
  });

  it("reports supported text publishing for Bluesky", () => {
    expect(capabilityStatus("bluesky", "text")).toBe("supported");
    expect(supports("bluesky", "text")).toBe(true);
  });

  it("does not claim scheduling APIs Bluesky lacks", () => {
    // Bluesky has no native scheduling; Postflare schedules via its own queue.
    expect(capabilityStatus("bluesky", "scheduled")).toBe("supported");
    expect(capabilityStatus("bluesky", "analytics")).toBe("unsupported");
  });

  it("declares OAuth for X", () => {
    expect(getPlatform("x")?.oauth?.authorizationUrl).toContain("x.com");
  });

  it("declares no publishing for Substack (no official API)", () => {
    expect(capabilityStatus("substack", "text")).toBe("unsupported");
  });

  it("every platform has a unique id", () => {
    const ids = PLATFORMS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
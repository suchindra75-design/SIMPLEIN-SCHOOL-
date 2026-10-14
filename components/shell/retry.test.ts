import { describe, expect, it } from "vitest";
import { retryAfterRefresh } from "@/components/shell/retry";

describe("retryAfterRefresh", () => {
  it("refreshes the segment before resetting the boundary", () => {
    const calls: string[] = [];
    retryAfterRefresh(
      (callback) => {
        calls.push("transition");
        void callback();
      },
      () => calls.push("refresh"),
      () => calls.push("reset"),
    );
    expect(calls).toEqual(["transition", "refresh", "reset"]);
  });

  it("does nothing until the transition runs its callback", () => {
    const calls: string[] = [];
    retryAfterRefresh(
      () => calls.push("transition"),
      () => calls.push("refresh"),
      () => calls.push("reset"),
    );
    expect(calls).toEqual(["transition"]);
  });
});

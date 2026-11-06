/**
 * Unit tests for request id allocation, response matching, timeouts, and close.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { HelperError, PendingRequests } from "../src/shared/pending";

afterEach(() => {
  vi.useRealTimers();
});

describe("PendingRequests", () => {
  it("allocates increasing ids and matches replies in any order", async () => {
    const pending = new PendingRequests();
    const first = pending.create(0);
    const second = pending.create(0);
    expect(second.id).toBe(first.id + 1);

    expect(pending.settle({ kind: "response", id: second.id, result: "two" })).toBe(true);
    expect(pending.settle({ kind: "response", id: first.id, result: "one" })).toBe(true);
    await expect(first.promise).resolves.toBe("one");
    await expect(second.promise).resolves.toBe("two");
    expect(pending.size).toBe(0);
  });

  it("rejects with the helper's error code", async () => {
    const pending = new PendingRequests();
    const { id, promise } = pending.create(0);
    pending.settle({ kind: "error", id, code: "PROTOCOL_MISMATCH", message: "old" });
    await expect(promise).rejects.toMatchObject({ code: "PROTOCOL_MISMATCH", message: "old" });
  });

  it("ignores events, null ids, and unknown ids", () => {
    const pending = new PendingRequests();
    pending.create(0);
    expect(pending.settle({ kind: "event", event: "x", data: null })).toBe(false);
    expect(pending.settle({ kind: "error", id: null, code: "BAD_REQUEST", message: "" })).toBe(
      false,
    );
    expect(pending.settle({ kind: "response", id: 99, result: null })).toBe(false);
    expect(pending.size).toBe(1);
  });

  it("times out a request that gets no reply", async () => {
    vi.useFakeTimers();
    const pending = new PendingRequests();
    const { id, promise } = pending.create(1000);
    const assertion = expect(promise).rejects.toMatchObject({ code: "TIMEOUT" });
    vi.advanceTimersByTime(1000);
    await assertion;
    expect(pending.settle({ kind: "response", id, result: "late" })).toBe(false);
  });

  it("fails all waiters and later requests after close", async () => {
    const pending = new PendingRequests();
    const { promise } = pending.create(0);
    pending.close(new HelperError("DISCONNECTED", "gone"));
    await expect(promise).rejects.toMatchObject({ code: "DISCONNECTED" });
    await expect(pending.create(0).promise).rejects.toMatchObject({ code: "DISCONNECTED" });
    expect(pending.size).toBe(0);
  });
});

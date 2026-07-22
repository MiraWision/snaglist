import { afterEach, describe, expect, it, vi } from "vitest";
import {
  normalizeCustom,
  normalizeIdentity,
  toSnakeCase,
} from "../src/reporter";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("normalizeIdentity", () => {
  it("returns undefined when identity is not configured", () => {
    expect(normalizeIdentity(undefined)).toBeUndefined();
  });

  it("returns null when configured but empty", () => {
    expect(normalizeIdentity({})).toBeNull();
    expect(normalizeIdentity({ userId: "  ", name: "" })).toBeNull();
  });

  it("maps to snake_case keys and trims", () => {
    expect(
      normalizeIdentity({
        userId: "  u_18293 ",
        email: "user@example.com",
        name: "Anna K.",
      })
    ).toEqual({ user_id: "u_18293", email: "user@example.com", name: "Anna K." });
  });

  it("omits fields that are not provided", () => {
    expect(normalizeIdentity({ email: "a@b.co" })).toEqual({ email: "a@b.co" });
  });

  it("clips values to 200 chars", () => {
    const long = "x".repeat(300);
    const r = normalizeIdentity({ name: long });
    expect(r?.name).toHaveLength(200);
  });
});

describe("toSnakeCase", () => {
  it("normalizes camelCase, kebab and spaces", () => {
    expect(toSnakeCase("appVersion")).toBe("app_version");
    expect(toSnakeCase("app-version")).toBe("app_version");
    expect(toSnakeCase("App Version")).toBe("app_version");
    expect(toSnakeCase("plan")).toBe("plan");
    expect(toSnakeCase("HTTPStatus")).toBe("httpstatus");
  });
});

describe("normalizeCustom", () => {
  it("returns undefined when not configured", () => {
    expect(normalizeCustom(undefined)).toBeUndefined();
  });

  it("keeps primitives and normalizes keys", () => {
    expect(
      normalizeCustom({ plan: "pro", appVersion: "2.4.1", seats: 5, trial: true })
    ).toEqual({ plan: "pro", app_version: "2.4.1", seats: 5, trial: true });
  });

  it("drops a nested object value with a warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const out = normalizeCustom({
      plan: "pro",
      // @ts-expect-error — testing runtime rejection of a non-primitive
      meta: { nested: true },
    });
    expect(out).toEqual({ plan: "pro" });
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toContain("meta");
  });

  it("drops arrays, null and non-finite numbers with a warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const out = normalizeCustom({
      ok: "yes",
      // @ts-expect-error — testing runtime rejection
      arr: [1, 2],
      // @ts-expect-error — testing runtime rejection
      empty: null,
      nan: Number.NaN,
    });
    expect(out).toEqual({ ok: "yes" });
    expect(warn).toHaveBeenCalledTimes(3);
  });

  it("caps at 20 keys, dropping the rest with a warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const input: Record<string, string> = {};
    for (let i = 0; i < 25; i++) {
      input[`k${i}`] = `v${i}`;
    }
    const out = normalizeCustom(input);
    expect(Object.keys(out ?? {})).toHaveLength(20);
    expect(warn).toHaveBeenCalledTimes(5);
  });

  it("clips string values to 200 chars", () => {
    const out = normalizeCustom({ note: "y".repeat(300) });
    expect((out?.note as string).length).toBe(200);
  });

  it("returns null when nothing valid survives", () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    // @ts-expect-error — testing runtime rejection
    expect(normalizeCustom({ bad: { a: 1 } })).toBeNull();
  });
});

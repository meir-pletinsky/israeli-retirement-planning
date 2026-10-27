import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// The tax engine depends on the calendar year (the pension exemption rises by
// year), so the clock is pinned. Only Date is faked; timers still run.
vi.useFakeTimers({ toFake: ["Date"] });
vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));

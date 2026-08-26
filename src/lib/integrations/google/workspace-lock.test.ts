import { describe, expect, it } from "vitest";
import { withGoogleWorkspaceAccountLock } from "./workspace-lock";

describe("withGoogleWorkspaceAccountLock", () => {
  it("serializes overlapping work for the same Google account", async () => {
    const events: string[] = [];
    let releaseFirst!: () => void;
    let signalFirstStarted!: () => void;
    const firstCanFinish = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const firstStarted = new Promise<void>((resolve) => {
      signalFirstStarted = resolve;
    });

    const first = withGoogleWorkspaceAccountLock("same-account", async () => {
      events.push("first:start");
      signalFirstStarted();
      await firstCanFinish;
      events.push("first:end");
    });
    const second = withGoogleWorkspaceAccountLock("same-account", async () => {
      events.push("second:start");
      events.push("second:end");
    });

    await firstStarted;
    expect(events).toEqual(["first:start"]);
    releaseFirst();
    await Promise.all([first, second]);
    expect(events).toEqual(["first:start", "first:end", "second:start", "second:end"]);
  });

  it("allows different Google accounts to proceed independently", async () => {
    const started: string[] = [];
    let release!: () => void;
    let signalAStarted!: () => void;
    let signalBStarted!: () => void;
    const firstCanFinish = new Promise<void>((resolve) => {
      release = resolve;
    });
    const aStarted = new Promise<void>((resolve) => {
      signalAStarted = resolve;
    });
    const bStarted = new Promise<void>((resolve) => {
      signalBStarted = resolve;
    });

    const first = withGoogleWorkspaceAccountLock("account-a", async () => {
      started.push("a");
      signalAStarted();
      await firstCanFinish;
    });
    const second = withGoogleWorkspaceAccountLock("account-b", async () => {
      started.push("b");
      signalBStarted();
    });

    await Promise.all([aStarted, bStarted]);
    expect(started).toEqual(["a", "b"]);
    release();
    await Promise.all([first, second]);
  });
});

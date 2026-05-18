import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createKitchenBellDataUrl,
  disposeKitchenBell,
  hasKitchenBellSupport,
  playKitchenBell,
  prepareKitchenBell,
} from "@/src/components/kds/kitchen-bell";

function createBellRefs() {
  return {
    audioContextRef: { current: null as AudioContext | null },
    audioElementRef: { current: null as HTMLAudioElement | null },
  };
}

describe("kitchen bell helpers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("creates a reusable wav data url without any external asset", () => {
    const first = createKitchenBellDataUrl();
    const second = createKitchenBellDataUrl();

    expect(first).toMatch(/^data:audio\/wav;base64,/);
    expect(second).toBe(first);
  });

  it("prepares and plays the generated bell through HTMLAudio when available", async () => {
    const playMock = vi.fn(async () => undefined);
    const pauseMock = vi.fn();

    class FakeAudio {
      currentTime = 8;
      pause = pauseMock;
      play = playMock;
      preload = "";
      src: string;
      volume = 0;

      constructor(src: string) {
        this.src = src;
      }
    }

    vi.stubGlobal("Audio", FakeAudio as unknown as typeof Audio);

    const refs = createBellRefs();

    expect(hasKitchenBellSupport()).toBe(true);
    expect(await prepareKitchenBell(refs)).toBe(true);
    expect(refs.audioElementRef.current).toBeInstanceOf(FakeAudio);
    expect(await playKitchenBell(refs)).toBe(true);
    expect(pauseMock).toHaveBeenCalled();
    expect(playMock).toHaveBeenCalled();

    await disposeKitchenBell(refs);
    expect(refs.audioElementRef.current).toBeNull();
  });
});

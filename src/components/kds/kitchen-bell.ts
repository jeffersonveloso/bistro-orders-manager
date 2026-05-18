import type { MutableRefObject } from "react";

type BrowserAudioContextConstructor = typeof AudioContext;

interface KitchenBellRefs {
  audioContextRef: MutableRefObject<AudioContext | null>;
  audioElementRef: MutableRefObject<HTMLAudioElement | null>;
}

let cachedKitchenBellDataUrl: string | null = null;

export function getBrowserAudioContextConstructor() {
  if (typeof window === "undefined") {
    return null;
  }

  return (
    window.AudioContext ??
    (
      window as Window &
        typeof globalThis & {
          webkitAudioContext?: BrowserAudioContextConstructor;
        }
    ).webkitAudioContext ??
    null
  );
}

function isAudioElementSupported() {
  return typeof Audio !== "undefined";
}

export function hasKitchenBellSupport() {
  return isAudioElementSupported() || Boolean(getBrowserAudioContextConstructor());
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function encodeBase64(bytes: Uint8Array) {
  const BufferConstructor = (
    globalThis as typeof globalThis & {
      Buffer?: {
        from(value: Uint8Array): {
          toString(encoding: "base64"): string;
        };
      };
    }
  ).Buffer;

  if (BufferConstructor) {
    return BufferConstructor.from(bytes).toString("base64");
  }

  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

export function createKitchenBellDataUrl() {
  if (cachedKitchenBellDataUrl) {
    return cachedKitchenBellDataUrl;
  }

  const sampleRate = 22_050;
  const totalSamples = Math.floor(sampleRate * 0.82);
  const sampleData = new Int16Array(totalSamples);
  const steps = [
    { amplitude: 0.5, duration: 0.18, frequency: 987.77, startAt: 0 },
    { amplitude: 0.42, duration: 0.18, frequency: 1318.51, startAt: 0.2 },
    { amplitude: 0.35, duration: 0.24, frequency: 1567.98, startAt: 0.42 },
  ];

  // Generate a short wav so browsers can play it without fetching any asset.
  for (const step of steps) {
    const startIndex = Math.floor(step.startAt * sampleRate);
    const noteSamples = Math.floor(step.duration * sampleRate);

    for (
      let sampleIndex = 0;
      sampleIndex < noteSamples && startIndex + sampleIndex < sampleData.length;
      sampleIndex += 1
    ) {
      const attack = Math.min(sampleIndex / (sampleRate * 0.012), 1);
      const release = Math.min((noteSamples - sampleIndex) / (sampleRate * 0.05), 1);
      const envelope = attack * release;
      const time = sampleIndex / sampleRate;
      const carrier = Math.sin(2 * Math.PI * step.frequency * time);
      const overtone = Math.sin(2 * Math.PI * step.frequency * 2 * time) * 0.22;
      const sampleValue = (carrier + overtone) * step.amplitude * envelope;
      const targetIndex = startIndex + sampleIndex;
      const currentValue = sampleData[targetIndex] / 0x7fff;
      const mixedValue = Math.max(-1, Math.min(1, currentValue + sampleValue));

      sampleData[targetIndex] = Math.round(mixedValue * 0x7fff);
    }
  }

  const bytes = new Uint8Array(44 + sampleData.length * 2);
  const view = new DataView(bytes.buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + sampleData.length * 2, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, sampleData.length * 2, true);

  for (let index = 0; index < sampleData.length; index += 1) {
    view.setInt16(44 + index * 2, sampleData[index], true);
  }

  cachedKitchenBellDataUrl = `data:audio/wav;base64,${encodeBase64(bytes)}`;
  return cachedKitchenBellDataUrl;
}

function ensureKitchenBellAudioElement(
  audioElementRef: MutableRefObject<HTMLAudioElement | null>,
) {
  if (!isAudioElementSupported()) {
    return null;
  }

  const audioElement = audioElementRef.current ?? new Audio(createKitchenBellDataUrl());
  audioElement.preload = "auto";
  audioElement.volume = 1;
  audioElementRef.current = audioElement;

  return audioElement;
}

async function ensureKitchenBellContext(
  audioContextRef: MutableRefObject<AudioContext | null>,
) {
  const AudioContextConstructor = getBrowserAudioContextConstructor();

  if (!AudioContextConstructor) {
    return null;
  }

  const context = audioContextRef.current ?? new AudioContextConstructor();
  audioContextRef.current = context;

  if (context.state === "suspended") {
    try {
      await context.resume();
    } catch {
      return null;
    }
  }

  return context.state === "running" ? context : null;
}

async function playKitchenBellAudioElement(
  audioElementRef: MutableRefObject<HTMLAudioElement | null>,
) {
  const audioElement = ensureKitchenBellAudioElement(audioElementRef);

  if (!audioElement) {
    return false;
  }

  try {
    audioElement.pause();
    audioElement.currentTime = 0;

    const playResult = audioElement.play();

    if (playResult && typeof playResult.then === "function") {
      await playResult;
    }

    return true;
  } catch {
    return false;
  }
}

async function playKitchenBellOscillator(
  audioContextRef: MutableRefObject<AudioContext | null>,
) {
  const context = await ensureKitchenBellContext(audioContextRef);

  if (!context) {
    return false;
  }

  const masterGain = context.createGain();
  masterGain.connect(context.destination);
  masterGain.gain.setValueAtTime(0.0001, context.currentTime);

  const now = context.currentTime;
  const steps = [
    { duration: 0.26, frequency: 1046.5, offset: 0, peak: 0.12 },
    { duration: 0.32, frequency: 1318.51, offset: 0.14, peak: 0.08 },
  ];

  for (const step of steps) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const startAt = now + step.offset;
    const releaseAt = startAt + step.duration;

    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(step.frequency, startAt);
    oscillator.connect(gain);
    gain.connect(masterGain);

    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(step.peak, startAt + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, releaseAt);

    oscillator.start(startAt);
    oscillator.stop(releaseAt + 0.02);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  }

  window.setTimeout(() => {
    masterGain.disconnect();
  }, 650);

  return true;
}

export async function prepareKitchenBell({
  audioContextRef,
  audioElementRef,
}: KitchenBellRefs) {
  if (ensureKitchenBellAudioElement(audioElementRef)) {
    return true;
  }

  const context = await ensureKitchenBellContext(audioContextRef);
  return Boolean(context);
}

export async function playKitchenBell({
  audioContextRef,
  audioElementRef,
}: KitchenBellRefs) {
  if (await playKitchenBellAudioElement(audioElementRef)) {
    return true;
  }

  return playKitchenBellOscillator(audioContextRef);
}

export async function disposeKitchenBell({
  audioContextRef,
  audioElementRef,
}: KitchenBellRefs) {
  const audioElement = audioElementRef.current;
  audioElementRef.current = null;

  if (audioElement) {
    try {
      audioElement.pause();
      audioElement.currentTime = 0;
    } catch {
      // Ignore best-effort teardown errors from the browser media element.
    }
  }

  const context = audioContextRef.current;
  audioContextRef.current = null;

  if (context) {
    await context.close().catch(() => undefined);
  }
}

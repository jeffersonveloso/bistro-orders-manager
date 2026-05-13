import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

const operationalLocale = "pt-BR";
const operationalTimeZone = "America/Sao_Paulo";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatOperationalTime(
  value: string | Date,
  options: {
    includeSeconds?: boolean;
  } = {},
) {
  return new Date(value).toLocaleTimeString(operationalLocale, {
    hour: "2-digit",
    minute: "2-digit",
    second: options.includeSeconds ? "2-digit" : undefined,
    timeZone: operationalTimeZone,
  });
}

export function formatOperationalDateTime(value: string | Date) {
  return new Date(value).toLocaleString(operationalLocale, {
    timeZone: operationalTimeZone,
  });
}

export function formatMinutesFrom(isoDate: string) {
  const diffInMinutes = Math.max(
    0,
    Math.round((Date.now() - new Date(isoDate).getTime()) / 60_000),
  );

  if (diffInMinutes < 1) {
    return "agora";
  }

  if (diffInMinutes === 1) {
    return "1 min";
  }

  return `${diffInMinutes} min`;
}

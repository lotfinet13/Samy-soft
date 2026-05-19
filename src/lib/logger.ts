type LogLevel = "debug" | "info" | "warn" | "error";

const PREFIX = "[samy-soft]";

function emit(level: LogLevel, area: string, message: string, meta?: unknown): void {
  const line = `${PREFIX}[${area}] ${message}`;
  if (meta !== undefined) {
    const fn =
      level === "error"
        ? console.error
        : level === "warn"
          ? console.warn
          : level === "debug"
            ? console.debug
            : console.info;
    fn(line, meta);
    return;
  }
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else if (level === "debug") console.debug(line);
  else console.info(line);
}

/** Centralized renderer logger — use instead of raw console in UI code. */
export const logger = {
  debug: (area: string, message: string, meta?: unknown) => emit("debug", area, message, meta),
  info: (area: string, message: string, meta?: unknown) => emit("info", area, message, meta),
  warn: (area: string, message: string, meta?: unknown) => emit("warn", area, message, meta),
  error: (area: string, message: string, meta?: unknown) => emit("error", area, message, meta),
};

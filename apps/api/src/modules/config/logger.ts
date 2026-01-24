const sensitiveKeys = new Set(["email", "phone", "phoneNumber", "mobile"]);

export const redactSensitive = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(redactSensitive);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, val]) => {
        if (sensitiveKeys.has(key)) {
          return [key, "[REDACTED]"];
        }
        return [key, redactSensitive(val)];
      })
    );
  }
  return value;
};

export const logInfo = (message: string, payload?: unknown) => {
  if (payload) {
    console.info(message, redactSensitive(payload));
    return;
  }
  console.info(message);
};

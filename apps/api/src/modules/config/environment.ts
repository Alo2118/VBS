import type { BookingPolicy, NotificationPolicy } from "@vbs/shared";

const parseNumber = (value: string | undefined, fallback: number) => {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const parseBoolean = (value: string | undefined, fallback: boolean) => {
  if (value === undefined) {
    return fallback;
  }
  return value.toLowerCase() === "true";
};

export const bookingPolicy: BookingPolicy = {
  cancellationHours: parseNumber(process.env.BOOKING_CANCELLATION_HOURS, 24),
  maxAdvanceDays: parseNumber(process.env.BOOKING_MAX_ADVANCE_DAYS, 14),
  slotDurationMinutes: parseNumber(process.env.BOOKING_SLOT_DURATION_MINUTES, 60)
};

export const notificationConfig: NotificationPolicy = {
  emailEnabled: parseBoolean(process.env.NOTIFICATIONS_EMAIL_ENABLED, true),
  smsEnabled: parseBoolean(process.env.NOTIFICATIONS_SMS_ENABLED, true)
};

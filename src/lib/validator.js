import { z } from 'zod';

export const SettingsSchema = z.object({
  categories: z.record(z.string(), z.array(z.string())),
  idleThreshold: z.number().int().min(1),
  trackStartTime: z.string().datetime().nullable(),
});

export const DaySchema = z.record(z.string(), z.number().nonnegative());

export const SessionSchema = z.object({
  id: z.string(),
  domain: z.string(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  duration: z.number().nonnegative(),
});

export const DomainMetaSchema = z.object({
  firstSeen: z.string().datetime(),
  category: z.string().nullable(),
});

export const AppDataSchema = z.object({
  schemaVersion: z.number().int().positive(),
  settings: SettingsSchema,
  days: z.record(z.string(), DaySchema),
  sessions: z.array(SessionSchema),
  domains: z.record(z.string(), DomainMetaSchema),
});

/**
 * Validates extension data.
 * @param {object} data - The data object to validate
 * @returns {{success: boolean, data?: object, errors?: string[]}} Validation result
 */
export function validateData(data) {
  const result = AppDataSchema.safeParse(data);
  if (!result.success) {
    return {
      success: false,
      errors: result.error.errors.map(err => `${err.path.join('.')}: ${err.message}`),
    };
  }
  return {
    success: true,
    data: result.data,
  };
}

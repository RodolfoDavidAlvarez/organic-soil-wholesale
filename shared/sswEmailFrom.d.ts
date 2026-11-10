export const SSW_EMAIL_FROM_ADDRESS: string;
export const SSW_EMAIL_REPLY_TO: string;
export const SSW_BUSINESS_CARD_FROM_NAME: string;

export function extractEmailAddress(value?: string | null): string;
export function extractDisplayName(value?: string | null): string;
export function isBlockedSenderAddress(value?: string | null): boolean;
export function getSswEmailFromAddress(env?: NodeJS.ProcessEnv): string;
export function sswFrom(displayName?: string, env?: NodeJS.ProcessEnv): string;
export function resolveSswFrom(
  candidate?: string | null,
  fallbackDisplayName?: string,
  env?: NodeJS.ProcessEnv,
): string;
export function withSswReplyTo<T extends Record<string, unknown>>(payload: T, replyTo?: string): T & { from: string };
export function guardResend<T>(client: T): T;

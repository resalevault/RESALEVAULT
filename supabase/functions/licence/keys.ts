/**
 * Copia de las constantes de licencia para la Edge Function.
 *
 * No se importa `src/shared/license-keys.ts` porque el empaquetado de Supabase
 * sube solo la carpeta de la funcion. Para que no puedan desincronizarse,
 * `tests/licence-keys-sync.test.ts` compara ambos ficheros y falla si difieren.
 */

export const LICENSE_PUBLIC_KEY_BASE64 = 'MCowBQYDK2VwAyEAytExp1lfGmhRRw6V2ShlASFYuwmBfNQcE7KoghAveD0='

export const LICENSE_FORMAT_VERSION = 1

export const ALLOWED_PLANS = ['free', 'pro', 'business'] as const
export const ALLOWED_KINDS = ['perpetual', 'subscription', 'founder'] as const

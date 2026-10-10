import { z } from 'zod';

const bool = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((v) => v === true || v === 'true' || v === '1');

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  APP_ORIGIN: z.string().url().default('http://localhost:5173'),
  TRUST_PROXY: z.string().optional().default('0'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  SESSION_SECRET: z.string().min(24, 'SESSION_SECRET must be at least 24 characters'),

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  LOCAL_STORAGE_DIR: z.string().default('./storage'),
  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().optional().default('auto'),
  S3_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: bool,
  S3_PUBLIC_BASE_URL: z.string().optional(),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional().default(587),
  SMTP_SECURE: bool,
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  ADMIN_NOTIFY_EMAIL: z.string().optional(),
  REQUIRE_EMAIL_VERIFICATION: bool,
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  // Print variable names only — never values.
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) console.error(`  ${issue.path.join('.')}: ${issue.message}`);
  process.exit(1);
}
const env = parsed.data;

if (env.NODE_ENV === 'production') {
  if (env.STORAGE_DRIVER !== 's3') {
    console.error('STORAGE_DRIVER=s3 is required in production so uploaded media persists across deploys.');
    process.exit(1);
  }
  if (!env.APP_ORIGIN.startsWith('https://')) {
    console.warn('[warn] APP_ORIGIN is not https:// — serve the site over HTTPS in production.');
  }
}
if (env.STORAGE_DRIVER === 's3') {
  for (const k of ['S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'] as const) {
    if (!env[k]) {
      console.error(`${k} is required when STORAGE_DRIVER=s3`);
      process.exit(1);
    }
  }
}

const smtpConfigured = Boolean(env.SMTP_HOST && env.SMTP_FROM);

export const config = {
  ...env,
  isProd: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  trustProxy: /^\d+$/.test(env.TRUST_PROXY) ? Number(env.TRUST_PROXY) : env.TRUST_PROXY,
  smtpConfigured,
  requireEmailVerification: smtpConfigured && env.REQUIRE_EMAIL_VERIFICATION,
  cookies: {
    session: env.NODE_ENV === 'production' ? '__Host-svss_session' : 'svss_session',
    csrf: env.NODE_ENV === 'production' ? '__Host-svss_csrf' : 'svss_csrf',
  },
  sessionTtlMs: {
    CUSTOMER: 30 * 24 * 60 * 60 * 1000,
    ADMIN: 12 * 60 * 60 * 1000,
  },
  uploads: {
    maxImageBytes: 15 * 1024 * 1024,
    maxVideoBytes: 150 * 1024 * 1024,
    maxEnquiryImageBytes: 8 * 1024 * 1024,
    maxEnquiryImages: 4,
  },
};

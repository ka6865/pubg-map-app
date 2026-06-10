const REDACTED = "[REDACTED]";
const SENSITIVE_KEY_PATTERN = /(api[_-]?key|secret|token|password|passwd|authorization|cookie|service[_-]?role|webhook|database[_-]?url|connection[_-]?string)/i;

export function redactForAgentLog<T>(value: T): T {
  return redactValue(value, new WeakSet()) as T;
}

function redactValue(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map((item) => redactValue(item, seen));
  if (typeof value === "object") {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : redactValue(entry, seen)
      ])
    );
  }
  return String(value);
}

function redactString(value: string) {
  let output = value;
  for (const secret of knownSecrets()) {
    output = output.split(secret).join(REDACTED);
  }

  return output
    .replace(/(authorization\s*:\s*bearer\s+)[^\s"'`]+/gi, `$1${REDACTED}`)
    .replace(/(bearer\s+)[A-Za-z0-9._~+/=-]{12,}/gi, `$1${REDACTED}`)
    .replace(/((?:api[_-]?key|secret|token|password|passwd|service[_-]?role)\s*[:=]\s*)[^\s"',}]+/gi, `$1${REDACTED}`)
    .replace(/(postgres(?:ql)?:\/\/[^:\s/]+:)[^@\s/]+(@)/gi, `$1${REDACTED}$2`)
    .replace(/(https?:\/\/[^:\s/]+:)[^@\s/]+(@)/gi, `$1${REDACTED}$2`);
}

function knownSecrets() {
  return [
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.GOOGLE_GEMINI_API_KEY,
    process.env.ADMIN_AGENT_CRON_SECRET,
    process.env.CRON_SECRET,
    process.env.DISCORD_WEBHOOK_URL,
    process.env.TAVILY_API_KEY,
    process.env.VERCEL_TOKEN
  ].filter((value): value is string => Boolean(value && value.length >= 8));
}

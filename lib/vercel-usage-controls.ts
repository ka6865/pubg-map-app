export function isVercelSpeedInsightsEnabled() {
  return process.env.NEXT_PUBLIC_ENABLE_SPEED_INSIGHTS === "true";
}


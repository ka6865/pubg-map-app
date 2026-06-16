/**
 * @fileoverview IP 관련 유틸리티
 *
 * 클라이언트 IP 추출, 마스킹(개인정보 보호), IP 차단 목록 검사 기능을 제공합니다.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Request 헤더에서 클라이언트 IP를 추출합니다.
 * x-forwarded-for → x-real-ip → fallback '0.0.0.0' 순서로 확인합니다.
 */
export function extractClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    // 프록시 체인에서 첫 번째 IP가 실제 클라이언트
    const firstIp = forwarded.split(",")[0].trim();
    if (firstIp) return firstIp;
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  return "0.0.0.0";
}

/**
 * 전체 IP를 마스킹하여 앞 두 옥텟만 노출합니다.
 * 예: '121.130.45.89' → '121.130'
 * IPv6의 경우 앞 두 그룹만 노출합니다.
 */
export function maskIp(fullIp: string): string {
  if (!fullIp) return "0.0";

  // IPv4
  if (fullIp.includes(".")) {
    const parts = fullIp.split(".");
    if (parts.length >= 2) {
      return `${parts[0]}.${parts[1]}`;
    }
    return fullIp;
  }

  // IPv6
  if (fullIp.includes(":")) {
    const parts = fullIp.split(":");
    if (parts.length >= 2) {
      return `${parts[0]}:${parts[1]}`;
    }
  }

  return fullIp;
}

/**
 * IP가 차단 목록에 존재하는지 확인합니다.
 * expires_at이 null이면 영구 차단, 값이 있으면 만료 여부를 확인합니다.
 */
export async function checkIpBlacklist(
  ip: string,
  supabaseAdmin: SupabaseClient
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("ip_blacklist")
    .select("id, expires_at")
    .eq("ip_address", ip)
    .limit(1);

  if (error || !data || data.length === 0) {
    return false;
  }

  const record = data[0];

  // 만료 시간이 없으면 영구 차단
  if (!record.expires_at) {
    return true;
  }

  // 만료 시간이 현재보다 미래이면 여전히 차단 중
  return new Date(record.expires_at) > new Date();
}

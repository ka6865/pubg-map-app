import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { withOptionalAuth } from "@/utils/supabase/guard";
import { extractClientIp } from "@/lib/board/ipUtils";

/**
 * @fileoverview 게시글/댓글 신고 접수 API
 *
 * 누적 신고 3회 이상 시 Discord Webhook으로 관리자 알림을 자동 발송합니다.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const REPORT_THRESHOLD = 3;

async function sendDiscordAlert(targetType: string, targetId: number, reportCount: number) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  const adminUrl = `${process.env.NEXT_PUBLIC_SITE_URL || "https://bgms.app"}/admin/dashboard`;
  const typeLabel = targetType === "post" ? "게시글" : "댓글";

  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      embeds: [{
        title: "🚨 신고 누적 알림",
        description: `**${typeLabel} ID: ${targetId}** 에 대한 신고가 **${reportCount}건** 이상 누적되었습니다.`,
        color: 0xFF4444,
        fields: [
          { name: "대상 유형", value: typeLabel, inline: true },
          { name: "대상 ID", value: String(targetId), inline: true },
          { name: "신고 누적", value: `${reportCount}건`, inline: true },
        ],
        footer: { text: "BGMS 관제탑" },
        timestamp: new Date().toISOString(),
      }],
      components: [{
        type: 1,
        components: [{
          type: 2,
          style: 5,
          label: "어드민 대시보드 열기",
          url: adminUrl,
        }],
      }],
    }),
  });
}

export async function POST(request: Request) {
  try {
    const auth = await withOptionalAuth();
    if (auth.error) return auth.error;
    const { user } = auth;

    const body = await request.json();
    const { target_type, target_id, reason, detail } = body;

    if (!target_type || !target_id || !reason) {
      return NextResponse.json({ error: "필수 입력값이 누락되었습니다." }, { status: 400 });
    }
    if (!["post", "comment"].includes(target_type)) {
      return NextResponse.json({ error: "잘못된 신고 대상 유형입니다." }, { status: 400 });
    }

    const reporterIp = extractClientIp(request);
    const supabaseAdmin = createAdminClient(supabaseUrl, supabaseServiceKey);

    // 중복 신고 방지: 같은 IP가 같은 대상에 이미 신고한 경우 차단
    const { data: existing } = await supabaseAdmin
      .from("reports")
      .select("id")
      .eq("target_type", target_type)
      .eq("target_id", Number(target_id))
      .eq("reporter_ip", reporterIp)
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json({ error: "이미 신고하신 항목입니다." }, { status: 409 });
    }

    // 신고 접수
    await supabaseAdmin.from("reports").insert([{
      target_type,
      target_id: Number(target_id),
      reason,
      detail: detail || null,
      reporter_ip: reporterIp,
      reporter_id: user?.id || null,
      status: "pending",
    }]);

    // 누적 신고 수 집계
    const { count } = await supabaseAdmin
      .from("reports")
      .select("id", { count: "exact", head: true })
      .eq("target_type", target_type)
      .eq("target_id", Number(target_id))
      .eq("status", "pending");

    // 임계치 이상이면 Discord 알림 발송
    if (count && count >= REPORT_THRESHOLD) {
      await sendDiscordAlert(target_type, Number(target_id), count);
    }

    return NextResponse.json({ success: true, message: "신고가 접수되었습니다." });
  } catch (err: any) {
    console.error("[Report Create] Unexpected error:", err);
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

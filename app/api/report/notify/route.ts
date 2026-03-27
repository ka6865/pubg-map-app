// app/api/report/notify/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "../../../../lib/supabase";

export async function POST(request: Request) {
  try {
    // type이 "up"(추천 통과)이거나 "down"(비추천 통과) 문자열로 들어옵니다.
    const { markerId, type = "up" } = await request.json(); 
    if (!markerId)
      return NextResponse.json(
        { error: "마커 ID가 없습니다." },
        { status: 400 }
      );

    // 1. 제보된 마커 데이터 가져오기
    const { data: marker, error: markerError } = await supabase
      .from("pending_markers")
      .select("*")
      .eq("id", markerId)
      .single();

    if (markerError || !marker) throw new Error("마커를 찾을 수 없습니다.");

    // 🌟 도배 방지: 이미 알림이 갔다면 그대로 종료
    if (type === "down" && marker.is_down_notified) {
      return NextResponse.json({ message: "이미 비추천 알림이 발송된 제보입니다." });
    }
    if (type === "up" && marker.is_notified) {
      return NextResponse.json({ message: "이미 승인 알림이 발송된 제보입니다." });
    }

    // 2. 투표에 참여한 유저들의 최신 닉네임 가져오기 (비추천 vs 추천)
    let targetIds = type === "down" ? marker.downvoter_ids : marker.contributor_ids;
    if (!targetIds) targetIds = [];
    
    const { data: profiles } = await supabase
      .from("profiles")
      .select("nickname")
      .in("id", targetIds);

    const nicknames =
      profiles && profiles.length > 0
        ? profiles.map((p) => p.nickname).join(", ")
        : "알 수 없음";

    // 3. 환경 변수 로드
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

    if (!webhookUrl)
      throw new Error("디스코드 웹훅 URL이 설정되지 않았습니다.");

    // 4. 분류에 따른 디스코드 임베드 디자인 변경
    let embed;
    if (type === "down") {
      embed = {
        title: "🚨 [관제탑 경고] 허위 제보 누적 초과 (비추천 5 이상)",
        description: "허위 제보가 많아 파기 처리가 요구됩니다. 관리자 팝업에서 파기해주세요.",
        color: 0xef4444, // 경고 레드색상
        fields: [
          { name: "🗺️ 맵", value: marker.map_name, inline: true },
          { name: "🚙 종류", value: marker.marker_type, inline: true },
          { name: "👎 비추천 점수", value: `${marker.down_weight || 0}점`, inline: true },
          {
            name: "📍 좌표 (x, y)",
            value: `${marker.x.toFixed(1)}, ${marker.y.toFixed(1)}`,
            inline: false,
          },
          { name: "👥 비추천 유저", value: nicknames, inline: false },
          {
            name: "⚙️ 관리자 제보 검토 센터 (안전 링크)",
            value: `[✅/❌ 인게임 제보 심사 페이지 열기](${siteUrl}/admin/review?id=${marker.id})  |  [🛠️ 에디터에서 보기](${siteUrl}/map-editor?lat=${marker.y}&lng=${marker.x})`,
            inline: false,
          },
        ],
        timestamp: new Date().toISOString(),
      };
    } else {
      embed = {
        title: "🚨 [관제탑] 새로운 차량 제보가 임계점을 돌파했습니다!",
        description: "교차 검증(추천 5 이상)이 완료되었습니다. 승인 여부를 결정해주세요.",
        color: 0xf2a900, // 배틀그라운드 노란색상
        fields: [
          { name: "🗺️ 맵", value: marker.map_name, inline: true },
          { name: "🚙 종류", value: marker.marker_type, inline: true },
          { name: "🔥 신뢰도(추천)", value: `${marker.weight}점`, inline: true },
          {
            name: "📍 좌표 (x, y)",
            value: `${marker.x.toFixed(1)}, ${marker.y.toFixed(1)}`,
            inline: false,
          },
          { name: "👥 기여자 목록", value: nicknames, inline: false },
          {
            name: "⚙️ 관리자 제보 검토 센터 (안전 링크)",
            value: `[✅/❌ 인게임 제보 심사 페이지 열기](${siteUrl}/admin/review?id=${marker.id})  |  [🛠️ 에디터에서 보기](${siteUrl}/map-editor?lat=${marker.y}&lng=${marker.x})`,
            inline: false,
          },
        ],
        timestamp: new Date().toISOString(),
      };
    }

    // 5. 디스코드 발송
    const discordRes = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] }),
    });

    if (!discordRes.ok) throw new Error("디스코드 알림 발송 실패");

    // 6. DB Lock 잠금 (타입에 맞춰 boolean 교체)
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const updatePayload = type === "down" ? { is_down_notified: true } : { is_notified: true };
    const { error: updateError } = await supabaseAdmin
      .from("pending_markers")
      .update(updatePayload)
      .eq("id", marker.id);

    if (updateError) {
      console.error("DB 속성 잠금 처리 실패:", updateError);
      throw new Error("DB 업데이트 잠금에 실패했습니다.");
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("디스코드 알림 에러:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

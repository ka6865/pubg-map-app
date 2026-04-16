// app/api/admin/reject/route.ts
import { NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/server";

export async function POST(request: Request) {
  try {
    const supabaseServer = await createClient();
    const { data: { user } } = await supabaseServer.auth.getUser();
    if (!user) return NextResponse.json({ error: "🔒 로그인이 만료되었거나 유효하지 않습니다." }, { status: 401 });

    const { data: profile } = await supabaseServer.from("profiles").select("nickname, role").eq("id", user.id).single();
    if (profile?.role !== "admin") return NextResponse.json({ error: "⛔ 관리자 권한이 없습니다." }, { status: 403 });

    const supabaseAdmin = createSupabaseAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: "마커 ID가 누락되었습니다." }, { status: 400 });

    const { data: pending } = await supabaseAdmin
      .from("pending_markers")
      .select("*")
      .eq("id", id)
      .single();

    if (!pending) return NextResponse.json({ error: "이미 처리되었거나 존재하지 않는 제보입니다." }, { status: 404 });

    const { error: deleteError } = await supabaseAdmin
      .from("pending_markers")
      .delete()
      .eq("id", id);

    if (deleteError) throw deleteError;

    // 🌟 디스코드 알림 전송 (파기 완료)
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (webhookUrl) {
      const embed = {
        title: "🗑️ [관제탑 처리 완료] 허위 제보 파기",
        description: `관리자 **${profile?.nickname || "알 수 없음"}**님이 허위 혹은 오등록된 제보를 파기(삭제)했습니다.`,
        color: 0x6b7280, // 회색 (파기)
        fields: [
          { name: "🗺️ 맵", value: pending.map_name, inline: true },
          { name: "🚙 종류", value: pending.marker_type, inline: true },
          { name: "📍 좌표", value: `${pending.x.toFixed(1)}, ${pending.y.toFixed(1)}`, inline: true },
        ],
        timestamp: new Date().toISOString(),
      };
      
      await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ embeds: [embed] }),
      }).catch(err => console.error("Discord send error:", err));
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("파기 API 에러:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

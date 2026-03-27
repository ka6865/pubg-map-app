// app/api/report/vote/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
    const token = authHeader.replace("Bearer ", "");
    
    const { markerId, voteType } = await request.json(); // voteType: 'up' | 'down'
    if (!markerId || !voteType) return NextResponse.json({ error: "필수 데이터 누락" }, { status: 400 });

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 1. 유저 인증
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: "세션이 만료되었습니다." }, { status: 401 });

    // 2. 어드민 여부 확인 (어드민은 중복 투표 프리패스 가능)
    const { data: profile } = await supabaseAdmin.from("profiles").select("role").eq("id", user.id).single();
    const isAdmin = profile?.role === "admin";

    // 3. 기존 제보 획득
    const { data: pending, error: fetchError } = await supabaseAdmin
      .from("pending_markers")
      .select("*")
      .eq("id", markerId)
      .single();

    if (fetchError || !pending) {
      return NextResponse.json({ error: "존재하지 않는 제보입니다." }, { status: 404 });
    }

    // 4. 중복 투표 방지 확인
    const upIds = pending.contributor_ids || [];
    const downIds = pending.downvoter_ids || [];
    const hasVoted = upIds.includes(user.id) || downIds.includes(user.id);

    if (hasVoted && !isAdmin) {
      return NextResponse.json({ error: "이미 이 제보의 검증에 참여하셨습니다." }, { status: 403 });
    }

    // 5. 투표 분기 반영
    let newUpWeight = pending.weight || 1;
    let newDownWeight = pending.down_weight || 0;
    
    let updatedUpIds = [...upIds];
    let updatedDownIds = [...downIds];

    if (voteType === "up") {
      newUpWeight += 1;
      updatedUpIds.push(user.id);
    } else if (voteType === "down") {
      newDownWeight += 1;
      updatedDownIds.push(user.id);
    }

    // 6. DB 업데이트 진행
    const { error: updateError } = await supabaseAdmin
      .from("pending_markers")
      .update({
        weight: newUpWeight,
        contributor_ids: updatedUpIds,
        down_weight: newDownWeight,
        downvoter_ids: updatedDownIds,
        updated_at: new Date().toISOString()
      })
      .eq("id", markerId);

    if (updateError) throw updateError;

    // 7. 통합 임계점(Threshold) 달성 리포팅 트리거 분석
    let triggerNotify: "up" | "down" | null = null;
    const THRESHOLD = 5;

    if (voteType === "up" && newUpWeight >= THRESHOLD && !pending.is_notified) {
      triggerNotify = "up";
    } else if (voteType === "down" && newDownWeight >= THRESHOLD && !pending.is_down_notified) {
      triggerNotify = "down";
    }

    return NextResponse.json({ 
      success: true, 
      weight: newUpWeight, 
      down_weight: newDownWeight,
      triggerNotify 
    });
  } catch (error: any) {
    console.error("투표 API 에러:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

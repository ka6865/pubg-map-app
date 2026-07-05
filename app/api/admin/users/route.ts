import { NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/server";

// 관리자 권한 검증 및 Supabase Admin 클라이언트 반환
async function verifyAdmin() {
  const supabaseServer = await createClient();
  const { data: { user } } = await supabaseServer.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabaseServer
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  
  if (profile?.role === "admin") {
    const supabaseAdmin = createSupabaseAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    return { user, supabaseAdmin };
  }
  return null;
}

// 1. GET: auth.users 기준으로 profiles 테이블 정보와 병합하여 전체 목록 반환 (누락 식별 플래그 포함)
export async function GET() {
  const adminContext = await verifyAdmin();
  if (!adminContext) {
    return NextResponse.json({ error: "🔒 관리자 권한이 없습니다." }, { status: 403 });
  }

  try {
    // A. Profiles 전체 정보 조회
    const { data: profiles, error: pErr } = await adminContext.supabaseAdmin
      .from("profiles")
      .select("*");

    if (pErr) throw pErr;

    // B. Auth Users 전체 정보 조회 (페이지네이션 제한 해결)
    const users: any[] = [];
    let page = 1;
    const perPage = 1000;
    while (true) {
      const { data, error: uErr } = await adminContext.supabaseAdmin.auth.admin.listUsers({
        page,
        perPage,
      });
      if (uErr) throw uErr;
      
      const pageUsers = data?.users || [];
      users.push(...pageUsers);
      
      if (pageUsers.length < perPage) break;
      page++;
    }

    // C. 두 정보 결합 (auth.users 기준으로 병합하여 프로필 누락 유저 식별)
    const authUserIds = new Set(users.map(authUser => authUser.id));
    const mergedUsers = users.map(authUser => {
      const profile = profiles?.find(p => p.id === authUser.id);
      
      const provider = authUser.app_metadata?.provider || 
                       (authUser as any).raw_app_meta_data?.provider || 
                       (authUser as any).identities?.[0]?.provider || 
                       "unknown";

      if (profile) {
        return {
          ...profile,
          email: authUser.email || "소셜 로그인 유저 (이메일 미공개)",
          created_at: authUser.created_at || profile.updated_at,
          last_sign_in_at: authUser.last_sign_in_at || null,
          provider: provider,
          email_confirmed: !!authUser.email_confirmed_at,
          is_missing_profile: false,
          is_orphan_profile: false
        };
      }

      // profiles 테이블에 프로필 레코드가 없는 유저 (가짜 프로필 데이터 생성)
      const meta = authUser.user_metadata || {};
      const fallbackNickname = meta.full_name || meta.user_name || meta.name || meta.nickname || authUser.email?.split("@")[0] || "User";
      const fallbackAvatar = meta.avatar_url || meta.avatar || null;

      return {
        id: authUser.id,
        nickname: fallbackNickname,
        avatar_url: fallbackAvatar,
        role: "user",
        pubg_nickname: null,
        pubg_platform: null,
        updated_at: null,
        email: authUser.email || "소셜 로그인 유저 (이메일 미공개)",
        created_at: authUser.created_at,
        last_sign_in_at: authUser.last_sign_in_at || null,
        provider: provider,
        email_confirmed: !!authUser.email_confirmed_at,
        is_missing_profile: true,
        is_orphan_profile: false
      };
    });

    const orphanProfiles = (profiles || [])
      .filter(profile => !authUserIds.has(profile.id))
      .map(profile => ({
        ...profile,
        email: "Auth 계정 없음",
        created_at: profile.updated_at || null,
        last_sign_in_at: null,
        provider: "orphan",
        email_confirmed: false,
        is_missing_profile: false,
        is_orphan_profile: true
      }));

    const usersWithConsistencyFlags = [...orphanProfiles, ...mergedUsers];

    // 정렬: 유령 프로필과 프로필 누락 회원을 목록 상단에 먼저 노출
    usersWithConsistencyFlags.sort((a, b) => {
      if (a.is_orphan_profile && !b.is_orphan_profile) return -1;
      if (!a.is_orphan_profile && b.is_orphan_profile) return 1;
      if (a.is_missing_profile && !b.is_missing_profile) return -1;
      if (!a.is_missing_profile && b.is_missing_profile) return 1;
      return (a.nickname || "").localeCompare(b.nickname || "");
    });

    return NextResponse.json(usersWithConsistencyFlags);
  } catch (error: any) {
    console.error("Fetch admin users error:", error);
    return NextResponse.json({ error: error.message || "유저 정보를 불러올 수 없습니다." }, { status: 500 });
  }
}

// 2. POST: 유저 권한(role) / PUBG 연동 스펙 수동 업데이트 및 누락 프로필 일괄 복구 동기화
export async function POST(request: Request) {
  const adminContext = await verifyAdmin();
  if (!adminContext) {
    return NextResponse.json({ error: "🔒 관리자 권한이 없습니다." }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { action, id, role, pubg_nickname, pubg_platform } = body;

    // A. 일괄 복구 동기화(sync) 액션 처리
    if (action === "sync") {
      // 1) Auth Users 리스트 조회
      const { data: { users }, error: uErr } = await adminContext.supabaseAdmin.auth.admin.listUsers();
      if (uErr) throw uErr;

      // 2) Profiles 테이블 조회
      const { data: profiles, error: pErr } = await adminContext.supabaseAdmin
        .from("profiles")
        .select("id");
      if (pErr) throw pErr;

      const profileIds = new Set(profiles.map(p => p.id));
      const missingUsers = users.filter(u => !profileIds.has(u.id));

      if (missingUsers.length === 0) {
        return NextResponse.json({ success: true, message: "동기화할 누락된 회원이 없습니다." });
      }

      // 3) 누락 회원 profiles 테이블에 일괄 INSERT
      const insertData = missingUsers.map(u => {
        const meta = u.user_metadata || {};
        return {
          id: u.id,
          nickname: meta.full_name || meta.user_name || meta.name || meta.nickname || u.email?.split("@")[0] || "User",
          avatar_url: meta.avatar_url || meta.avatar || null,
          role: "user",
          updated_at: new Date().toISOString()
        };
      });

      const { error: insertErr } = await adminContext.supabaseAdmin
        .from("profiles")
        .insert(insertData);
      
      if (insertErr) throw insertErr;

      return NextResponse.json({ success: true, count: insertData.length });
    }

    // B. 단일 회원 정보 수정 처리
    if (!id) {
      return NextResponse.json({ error: "수정 대상 유저 ID가 필요합니다." }, { status: 400 });
    }

    // profiles 테이블 정보 수정 (profiles 테이블에 없을 경우 insert, 있을 경우 update 하거나 error 처리)
    // profiles 테이블에 해당 유저가 있는지 체크하여 없으면 새로 생성, 있으면 업데이트
    const { data: existingProfile } = await adminContext.supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("id", id)
      .single();

    if (!existingProfile) {
      // 누락 상태에서 개별 저장 시 생성
      const { error: insertErr } = await adminContext.supabaseAdmin
        .from("profiles")
        .insert({
          id,
          role: role || "user",
          pubg_nickname: pubg_nickname || null,
          pubg_platform: pubg_platform || null,
          nickname: "User", // fallback
          updated_at: new Date().toISOString()
        });
      if (insertErr) throw insertErr;
    } else {
      const { error: updateErr } = await adminContext.supabaseAdmin
        .from("profiles")
        .update({
          role,
          pubg_nickname: pubg_nickname || null,
          pubg_platform: pubg_platform || null,
          updated_at: new Date().toISOString()
        })
        .eq("id", id);
      if (updateErr) throw updateErr;
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Save admin user error:", error);
    return NextResponse.json({ error: error.message || "유저 정보 저장 실패" }, { status: 500 });
  }
}

// 3. DELETE: 유저 강제 회원탈퇴 처리
// profiles.id에는 auth.users FK가 없으므로 Auth 삭제 후 profile도 명시적으로 정리합니다.
export async function DELETE(request: Request) {
  const adminContext = await verifyAdmin();
  if (!adminContext) {
    return NextResponse.json({ error: "🔒 관리자 권한이 없습니다." }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "삭제할 유저 ID가 필요합니다." }, { status: 400 });
  }

  try {
    if (id === adminContext.user.id) {
      return NextResponse.json({ error: "현재 로그인한 관리자 계정은 여기서 삭제할 수 없습니다." }, { status: 400 });
    }

    const { data: profileBeforeDelete } = await adminContext.supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("id", id)
      .maybeSingle();

    const { data: { users }, error: listErr } = await adminContext.supabaseAdmin.auth.admin.listUsers();
    if (listErr) throw listErr;
    const authUserExists = users.some(user => user.id === id);

    if (authUserExists) {
      const { error: deleteErr } = await adminContext.supabaseAdmin.auth.admin.deleteUser(id);
      if (deleteErr) throw deleteErr;
    }

    const { error: profileDeleteErr } = await adminContext.supabaseAdmin
      .from("profiles")
      .delete()
      .eq("id", id);
    if (profileDeleteErr) throw profileDeleteErr;

    return NextResponse.json({
      success: true,
      deletedAuthUser: authUserExists,
      deletedProfile: Boolean(profileBeforeDelete)
    });
  } catch (error: any) {
    console.error("Delete admin user error:", error);
    return NextResponse.json({ error: error.message || "유저 삭제 실패" }, { status: 500 });
  }
}

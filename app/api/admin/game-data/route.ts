import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// 관리자 권한 검증 헬퍼 함수
async function verifyAdmin(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) return null;
  const token = authHeader.replace("Bearer ", "");

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) return null;

  const { data: profile } = await supabaseAdmin.from("profiles").select("role").eq("id", user.id).single();
  return profile?.role === "admin" ? { user, supabaseAdmin } : null;
}

export async function POST(request: Request) {
  const adminContext = await verifyAdmin(request);
  if (!adminContext) return NextResponse.json({ error: "관리자 권한이 없습니다." }, { status: 403 });

  const { category, item } = await request.json();
  if (!category || !item) return NextResponse.json({ error: "잘못된 요청 데이터입니다." }, { status: 400 });

  const { error } = await adminContext.supabaseAdmin
    .from(category)
    .upsert(item);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const adminContext = await verifyAdmin(request);
  if (!adminContext) return NextResponse.json({ error: "관리자 권한이 없습니다." }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  const id = searchParams.get("id");

  if (!category || !id) return NextResponse.json({ error: "ID와 카테고리가 필요합니다." }, { status: 400 });

  const { error } = await adminContext.supabaseAdmin
    .from(category)
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

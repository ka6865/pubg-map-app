import { NextResponse } from "next/server";

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID;
const CATEGORY_ID = process.env.DISCORD_CATEGORY_ID;

/**
 * @fileoverview 디스코드 음성 채널을 동적으로 생성하고 초대장을 발급하는 API입니다.
 * 관리자 권한(Bot Token)을 사용하여 실시간으로 채널을 생성합니다.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { type, author } = body; // 'duo' | 'squad'
    const userLimit = type === "duo" ? 2 : 4;

    if (!BOT_TOKEN || !GUILD_ID) {
      return NextResponse.json(
        { error: "서버의 디스코드 설정(TOKEN, GUILD_ID)이 올바르지 않습니다." },
        { status: 500 }
      );
    }

    console.log(`🌐 [Discord Room Creation]: Requesting ${type} room for ${author}`);

    // 1. 디스코드 음성 채널 생성 요청
    const parentId = CATEGORY_ID?.trim() || undefined; // 🌟 공백 제거 및 유효성 확인

    const createRes = await fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/channels`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: `🔊 [${type.toUpperCase()}] ${author}님의 팀`,
        type: 2, // Voice Channel
        user_limit: userLimit,
        parent_id: parentId && parentId.length > 5 ? parentId : undefined, // 🌟 더 안전하게 처리
      }),
    });

    const channel = await createRes.json();
    if (!createRes.ok) {
      console.error("❌ [Discord Channel Create Failed]:", channel);
      throw new Error(channel.message || "채널 생성 중 오류가 발생했습니다.");
    }

    // 2. 생성된 채널의 초대 링크 발급 (만료 없음, 무제한)
    const inviteRes = await fetch(`https://discord.com/api/v10/channels/${channel.id}/invites`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        max_age: 0,
        max_uses: 0,
        unique: true,
      }),
    });

    const invite = await inviteRes.json();
    if (!inviteRes.ok) {
      console.error("❌ [Discord Invite Create Failed]:", invite);
      throw new Error(invite.message || "초대 링크 생성 중 오류가 발생했습니다.");
    }

    console.log(`✅ [Discord Room Ready]: Channel ID ${channel.id}, Code ${invite.code}`);

    return NextResponse.json({
      success: true,
      channelId: channel.id,
      inviteUrl: `https://discord.gg/${invite.code}`,
    });

  } catch (err: any) {
    console.error("🚨 [Discord API Critical Error]:", err);
    return NextResponse.json(
      { error: err.message || "디스코드 연동 중 서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

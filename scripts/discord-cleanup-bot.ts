import { Client, GatewayIntentBits, ChannelType } from "discord.js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// ES 모듈에서 __dirname 대체
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// .env 서비스 로드 (방향에 맞춰 조정 필요)
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID;

if (!BOT_TOKEN || !GUILD_ID) {
  console.error("❌ [Bot Error]: .env.local 파일에 DISCORD_BOT_TOKEN 또는 DISCORD_GUILD_ID가 없습니다.");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates, // 보이스 채널 상태 감지 필수
  ],
});

client.once("ready", () => {
  console.log(`✅ [Bot Ready]: ${client.user?.tag} 로그인됨 (서버: ${GUILD_ID})`);
  console.log("🚀 [System]: 미니 PC에서 인원 감지 엔진이 작동 중입니다.");
});

// 보이스 채널 상태 변경 감지 이벤트
client.on("voiceStateUpdate", async (oldState, newState) => {
  // 사용자가 채널을 나갔을 때 (oldState.channelId가 있고 newState.channelId가 다를 때)
  if (oldState.channelId && oldState.channelId !== newState.channelId) {
    try {
      const channel = await oldState.guild.channels.fetch(oldState.channelId);

      // 음성 채널이고 BGMS에서 만든 이름 형식인 경우
      if (
        channel &&
        channel.type === ChannelType.GuildVoice &&
        (channel.name.startsWith("🔊 [DUO]") || channel.name.startsWith("🔊 [SQUAD]"))
      ) {
        // 현재 채널에 남은 인원 확인
        const memberCount = channel.members.size;
        console.log(`👥 [Channel Update]: ${channel.name} - 남은 인원: ${memberCount}`);

        // 인원이 0명이면 채널 삭제
        if (memberCount === 0) {
          console.log(`🧹 [Auto Cleanup]: ${channel.name} (ID: ${channel.id}) 방을 정리합니다.`);
          await channel.delete("인원이 0명이 되어 자동 삭제됨");
          console.log("✅ [Success]: 채널이 성공적으로 삭제되었습니다.");
        }
      }
    } catch (err: any) {
      // 채널이 이미 삭제되었거나 권한 오류 등 무시 가능한 에러 처리
      if (err.code !== 10003) {
        console.error("🚨 [Bot Runtime Error]:", err.message);
      }
    }
  }
});

client.login(BOT_TOKEN);

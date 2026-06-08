"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { 
  Send, Bot, User, Settings, ArrowLeft, RotateCcw, 
  Database, FileText, CheckCircle2, AlertCircle, Loader2, Link2
} from "lucide-react";
import { ChatMessage, BotSettings, ToolExecution } from "@/types/admin-bot";

export default function AdminBotPage() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "model",
      content: "안녕하세요, 관리자님! 저는 PUBG 실시간 DB 통계 조회 및 분석 리포트 자동 발행이 가능한 BGMS AI 어드민 봇입니다. 어떤 분석이나 포스팅 작업을 지시하시겠습니까?",
      timestamp: new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
    }
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  
  // 봇의 기본 페르소나 설정
  const [settings, setSettings] = useState<BotSettings>({
    botName: "BGMS AI 비서 봇",
    systemPrompt: "너는 배틀그라운드 지도 분석 서비스(BGMS)의 똑똑하고 친근한 공식 운영진이자 분석 AI 에이전트봇이야. 유저들에게는 지나친 비속어는 배제하고 적당히 위트가 넘치는 스마트한 구어체(존댓말)로 정제하여 글을 작성해야 해. 팩트 데이터가 주어지면 그대로 활용하고, 이미지 검색 노출을 위해 맵 이름과 구체적인 수치들을 생생하게 스토리텔링 형식으로 포스팅 본문에 배치해야 해."
  });

  const chatEndRef = useRef<HTMLDivElement>(null);
  const messageContainerRef = useRef<HTMLDivElement>(null);

  // 1. 관리자 권한 확인 (Supabase JWT Guard)
  useEffect(() => {
    async function checkAdmin() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/auth/login"); // 로그인하지 않았다면 이동
        return;
      }

      // 프로필에서 admin 역할 확인
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .maybeSingle();

      if (profile?.role === "admin") {
        setIsAdmin(true);
      } else {
        setIsAdmin(false);
        alert("관리자 권한이 없습니다.");
        router.push("/");
      }
    }
    checkAdmin();
  }, [router]);

  // 자동 스크롤 하단 이동 (모바일 키보드가 올라올 때 대응)
  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // 대화 초기화 (Reset)
  const handleReset = () => {
    if (confirm("대화 기록을 초기화하시겠습니까?")) {
      setMessages([
        {
          id: "welcome",
          role: "model",
          content: "대화가 초기화되었습니다. 지시하실 내용을 새로 입력해 주세요.",
          timestamp: new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
        }
      ]);
    }
  };

  // 봇에게 메시지 전송
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    const userMessageContent = inputValue.trim();
    setInputValue("");
    setIsLoading(true);

    const userMsgId = `user-${Date.now()}`;
    const newMessages = [
      ...messages,
      {
        id: userMsgId,
        role: "user" as const,
        content: userMessageContent,
        timestamp: new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
      }
    ];
    setMessages(newMessages);

    // AI 응답 뼈대 생성
    const botMsgId = `bot-${Date.now()}`;
    setMessages(prev => [
      ...prev,
      {
        id: botMsgId,
        role: "model" as const,
        content: "",
        timestamp: new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }),
        toolsUsed: []
      }
    ]);

    try {
      // API 통신 히스토리 데이터 구성
      const historyPayload = newMessages.slice(1, -1).map(m => ({
        role: m.role,
        content: m.content
      }));

      const response = await fetch("/api/admin/bot/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessageContent,
          systemPrompt: settings.systemPrompt,
          history: historyPayload
        })
      });

      if (!response.ok) {
        throw new Error("서버와의 통신이 원활하지 않습니다.");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const payload = JSON.parse(line);
              
              if (payload.type === "tool_start") {
                // 도구 실행 칩 추가 (대기 상태)
                setMessages(prev => prev.map(m => {
                  if (m.id === botMsgId) {
                    const currentTools = m.toolsUsed || [];
                    return {
                      ...m,
                      toolsUsed: [
                        ...currentTools,
                        { toolName: payload.toolName, status: "running", params: payload.params }
                      ]
                    };
                  }
                  return m;
                }));
              } else if (payload.type === "tool_end") {
                // 도구 실행 성공/실패 갱신
                setMessages(prev => prev.map(m => {
                  if (m.id === botMsgId) {
                    const currentTools = m.toolsUsed || [];
                    const updatedTools = currentTools.map(t => 
                      t.toolName === payload.toolName && t.status === "running"
                        ? { ...t, status: payload.status, error: payload.status === "failed" ? payload.result : undefined }
                        : t
                    );
                    return { ...m, toolsUsed: updatedTools };
                  }
                  return m;
                }));
              } else if (payload.type === "chunk") {
                // 최종 텍스트 수신 반영
                fullText += payload.data;
                setMessages(prev => prev.map(m => {
                  if (m.id === botMsgId) {
                    return { ...m, content: fullText };
                  }
                  return m;
                }));
              }
            } catch (err) {
              // 개별 라인 파싱 지연 오류 가드로 무시
            }
          }
        }
      }
    } catch (error: any) {
      setMessages(prev => prev.map(m => {
        if (m.id === botMsgId) {
          return {
            ...m,
            content: `오류가 발생했습니다: ${error.message || "연동 실패"}`
          };
        }
        return m;
      }));
    } finally {
      setIsLoading(false);
    }
  };

  if (isAdmin === null) {
    return (
      <div className="flex h-screen w-full items-center justify-content justify-center bg-zinc-950 text-zinc-400">
        <Loader2 className="mr-2 h-6 w-6 animate-spin text-amber-500" />
        <span className="text-sm font-medium">관리자 권한 조회 중...</span>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] w-full flex-col bg-zinc-950 text-zinc-50 font-sans antialiased overflow-hidden">
      
      {/* 📱 1. 헤더 영역 (네온 액센트 & Glassmorphism) */}
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-800 bg-zinc-900/80 p-4 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => router.push("/admin/dashboard")}
            className="rounded-full p-1.5 active:bg-zinc-800 text-zinc-400 active:text-zinc-100 transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-amber-500 animate-pulse"></span>
              <h1 className="text-base font-bold tracking-tight text-zinc-100">{settings.botName}</h1>
            </div>
            <p className="text-xs text-zinc-400">어드민 제어 에이전트</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button 
            onClick={handleReset}
            className="rounded-full p-2 active:bg-zinc-800 text-zinc-400 active:text-zinc-100 transition-colors"
            title="대화 리셋"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className={`rounded-full p-2 transition-colors ${showSettings ? "bg-amber-500/10 text-amber-500" : "text-zinc-400 active:bg-zinc-800"}`}
            title="봇 설정"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* ⚙️ 2. 봇 페르소나 설정 드로워 (모바일 특화 아코디언) */}
      {showSettings && (
        <div className="border-b border-zinc-800 bg-zinc-900/90 p-4 transition-all duration-300">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-amber-500 mb-2">에이전트 페르소나 지침 (System Prompt)</h2>
          <textarea
            value={settings.systemPrompt}
            onChange={(e) => setSettings({ ...settings, systemPrompt: e.target.value })}
            className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 text-xs text-zinc-300 focus:border-amber-500 focus:outline-none"
            rows={4}
          />
          <div className="mt-2.5 flex justify-end">
            <button
              onClick={() => {
                setShowSettings(false);
                alert("봇 페르소나가 변경되었습니다.");
              }}
              className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-zinc-950 active:bg-amber-600 transition-colors"
            >
              지침 적용
            </button>
          </div>
        </div>
      )}

      {/* 💬 3. 채팅 메시지 영역 */}
      <main 
        ref={messageContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 pb-24"
      >
        {messages.map((msg) => {
          const isUser = msg.role === "user";
          return (
            <div 
              key={msg.id}
              className={`flex w-full gap-3 ${isUser ? "justify-end" : "justify-start"}`}
            >
              {/* AI 프로필 아이콘 */}
              {!isUser && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-500">
                  <Bot className="h-4 w-4" />
                </div>
              )}

              <div className="flex flex-col max-w-[85%] gap-1.5">
                {/* 툴 실행 상태 타임라인 시각화 (모바일 전용 상태 칩) */}
                {!isUser && msg.toolsUsed && msg.toolsUsed.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-1">
                    {msg.toolsUsed.map((tool, idx) => {
                      const isRunning = tool.status === "running";
                      const isSuccess = tool.status === "success";
                      return (
                        <div 
                          key={idx}
                          className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium tracking-wide transition-all ${
                            isRunning 
                              ? "border-amber-500/30 bg-amber-500/5 text-amber-400 animate-pulse" 
                              : isSuccess 
                                ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-400" 
                                : "border-rose-500/30 bg-rose-500/5 text-rose-400"
                          }`}
                        >
                          {tool.toolName === "get_db_statistics" ? (
                            <Database className="h-3 w-3 shrink-0" />
                          ) : tool.toolName === "take_map_screenshot" ? (
                            <Link2 className="h-3 w-3 shrink-0" />
                          ) : (
                            <FileText className="h-3 w-3 shrink-0" />
                          )}
                          <span>
                            {tool.toolName === "get_db_statistics" 
                              ? "DB 집계" 
                              : tool.toolName === "take_map_screenshot" 
                                ? "지도 캡처" 
                                : "포스팅 발행"}
                            {isRunning ? " 중..." : isSuccess ? " 완료" : " 실패"}
                          </span>
                          {isRunning ? (
                            <Loader2 className="h-2.5 w-2.5 animate-spin" />
                          ) : isSuccess ? (
                            <CheckCircle2 className="h-2.5 w-2.5" />
                          ) : (
                            <AlertCircle className="h-2.5 w-2.5" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* 메시지 말풍선 */}
                <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm break-words whitespace-pre-wrap ${
                  isUser 
                    ? "bg-amber-500 text-zinc-950 font-medium rounded-tr-none" 
                    : "bg-zinc-900 border border-zinc-800 text-zinc-200 rounded-tl-none"
                }`}>
                  {msg.content === "" && isLoading && !msg.toolsUsed?.some(t => t.status === "running") ? (
                    <div className="flex items-center gap-1.5 py-1 text-zinc-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: "0ms" }}></span>
                      <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: "150ms" }}></span>
                      <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: "300ms" }}></span>
                    </div>
                  ) : (
                    msg.content
                  )}
                </div>
                
                {/* 타임스탬프 */}
                <span className="text-[10px] text-zinc-500 px-1">{msg.timestamp}</span>
              </div>

              {/* 유저 프로필 아이콘 */}
              {isUser && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-800 border border-zinc-700 text-zinc-300">
                  <User className="h-4 w-4" />
                </div>
              )}
            </div>
          );
        })}
        <div ref={chatEndRef} />
      </main>

      {/* ⌨️ 4. 모바일 터치 최적화 입력창 영역 */}
      <footer className="fixed bottom-0 left-0 right-0 border-t border-zinc-800 bg-zinc-900/90 p-3 pb-safe backdrop-blur-md">
        <form onSubmit={handleSendMessage} className="flex gap-2 items-center">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="AI 봇에게 통계 발행 명령을 내려주세요..."
            disabled={isLoading}
            className="flex-1 rounded-full border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-xs text-zinc-200 placeholder:text-zinc-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!inputValue.trim() || isLoading}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-500 text-zinc-950 transition-transform active:scale-95 disabled:bg-zinc-800 disabled:text-zinc-600"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </footer>
    </div>
  );
}

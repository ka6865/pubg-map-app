"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  Cloud,
  Database,
  FileText,
  Link2,
  Loader2,
  RotateCcw,
  Search,
  Send,
  Settings,
  Terminal,
  User,
  XCircle
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { BotSettings, ChatMessage, ToolExecution } from "@/types/admin-bot";

const AGENT_CLIENT_TIMEOUT_MS = 45_000;

export default function AdminBotPage() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "model",
      content: "안녕하세요, 운영자님. 저는 BGMS AI 비서입니다. 운영 점검, 비용 확인, 승인 요청 생성처럼 필요한 일을 말로 시켜주세요. 실제 수락/거절은 운영 대시보드에서 처리합니다.",
      timestamp: new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
    }
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0);
  const [settings, setSettings] = useState<BotSettings>({
    botName: "BGMS AI 비서 봇",
    systemPrompt: "너는 배틀그라운드 지도 분석 서비스(BGMS)의 똑똑하고 친근한 공식 운영진이자 분석 AI 에이전트봇이야. 유저들에게는 지나친 비속어는 배제하고 적당히 위트가 넘치는 스마트한 구어체(존댓말)로 정제하여 글을 작성해야 해. 팩트 데이터가 주어지면 그대로 활용하고, 이미지 검색 노출을 위해 맵 이름과 구체적인 수치들을 생생하게 스토리텔링 형식으로 포스팅 본문에 배치해야 해. 특히, 게시판 등록용 본문을 작성할 때는 Markdown 문법을 절대 쓰지 말고 HTML 문법(<p>, <h3>, <ul>, <img src='이미지주소' /> 등)을 사용해 작성해 줘."
  });

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function loadPendingApprovals() {
    const response = await fetch("/api/admin/agent/approvals");
    if (!response.ok) return;
    const data = await response.json();
    const approvals = data.approvals || [];
    setPendingApprovalCount(approvals.filter((approval: any) => approval.status === "pending").length);
  }

  useEffect(() => {
    async function checkAdmin() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login");
        return;
      }

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

  useEffect(() => {
    if (!isAdmin) return;

    const params = new URLSearchParams(window.location.search);
    const approvalId = params.get("approval");
    const section = params.get("section");
    const prompt = params.get("prompt");

    if (approvalId) {
      router.replace(`/admin/dashboard?section=approvals&approval=${encodeURIComponent(approvalId)}`);
      return;
    }

    if (section && ["approvals", "status", "memories", "guide", "today"].includes(section)) {
      router.replace(`/admin/dashboard?section=${encodeURIComponent(section)}`);
      return;
    }

    if (prompt) {
      setInputValue(prompt);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isAdmin, router]);

  useEffect(() => {
    if (isAdmin) loadPendingApprovals();
  }, [isAdmin]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleReset = () => {
    if (!confirm("대화 기록을 초기화하시겠습니까?")) return;
    setMessages([
      {
        id: "welcome",
        role: "model",
        content: "대화가 초기화되었습니다. 필요한 운영 작업을 다시 입력해 주세요.",
        timestamp: new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
      }
    ]);
  };

  const openApprovalDashboard = (approvalId?: string) => {
    if (approvalId) {
      router.push(`/admin/dashboard?section=approvals&approval=${encodeURIComponent(approvalId)}`);
      return;
    }
    router.push("/admin/dashboard?section=approvals");
  };

  const sendAgentMessage = async (messageText: string) => {
    if (!messageText.trim() || isLoading) return;

    const userMessageContent = messageText.trim();
    setInputValue("");
    setIsLoading(true);

    const abortController = new AbortController();
    const startedAt = Date.now();
    const timeoutId = window.setTimeout(() => abortController.abort(), AGENT_CLIENT_TIMEOUT_MS);

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: userMessageContent,
      timestamp: new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
    };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);

    const botMsgId = `bot-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: botMsgId,
        role: "model",
        content: "",
        timestamp: new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }),
        toolsUsed: []
      }
    ]);

    try {
      const historyPayload = nextMessages.slice(1, -1).map((message) => ({
        role: message.role,
        content: message.content
      }));

      const response = await fetch("/api/admin/bot/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortController.signal,
        body: JSON.stringify({
          message: userMessageContent,
          systemPrompt: settings.systemPrompt,
          history: historyPayload
        })
      });

      if (!response.ok) throw new Error("서버와의 통신이 원활하지 않습니다.");

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      if (reader) {
        while (true) {
          const remainingMs = AGENT_CLIENT_TIMEOUT_MS - (Date.now() - startedAt);
          if (remainingMs <= 0) {
            await reader.cancel().catch(() => undefined);
            abortController.abort();
            throw createClientTimeoutError();
          }

          const { done, value } = await withClientTimeout(
            reader.read(),
            remainingMs,
            () => {
              abortController.abort();
              reader.cancel().catch(() => undefined);
            }
          );
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const payload = JSON.parse(line);

              if (payload.type === "tool_start") {
                setMessages((prev) => prev.map((message) => {
                  if (message.id !== botMsgId) return message;
                  return {
                    ...message,
                    toolsUsed: [
                      ...(message.toolsUsed || []),
                      {
                        toolName: payload.toolName,
                        status: "running",
                        params: payload.params,
                        safetyLevel: payload.safetyLevel
                      }
                    ]
                  };
                }));
              } else if (payload.type === "tool_end") {
                setMessages((prev) => prev.map((message) => {
                  if (message.id !== botMsgId) return message;
                  const tools = (message.toolsUsed || []).map((tool) => (
                    tool.toolName === payload.toolName && tool.status === "running"
                      ? {
                          ...tool,
                          status: payload.status,
                          approvalId: payload.approvalId,
                          error: payload.status === "failed" ? payload.result : undefined
                        }
                      : tool
                  ));
                  return { ...message, toolsUsed: tools };
                }));
                if (payload.status === "approval_required") loadPendingApprovals();
              } else if (payload.type === "approval_required") {
                loadPendingApprovals();
              } else if (payload.type === "chunk") {
                fullText += payload.data;
                setMessages((prev) => prev.map((message) => (
                  message.id === botMsgId ? { ...message, content: fullText } : message
                )));
              }
            } catch {
              // 스트리밍 중 잘린 라인은 다음 chunk에서 이어질 수 있어 무시합니다.
            }
          }
        }
      }
    } catch (error: any) {
      const message = error?.name === "AbortError"
        ? "응답 시간이 45초를 넘어서 중단했습니다. 같은 질문을 다시 보내거나, 운영 대시보드에서 수동 점검을 먼저 실행해 주세요."
        : error.message || "연동 실패";
      setMessages((prev) => prev.map((item) => (
        item.id === botMsgId
          ? { ...item, content: `오류가 발생했습니다: ${message}` }
          : item
      )));
    } finally {
      window.clearTimeout(timeoutId);
      setIsLoading(false);
      loadPendingApprovals();
    }
  };

  const handleSendMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    await sendAgentMessage(inputValue);
  };

  if (isAdmin === null) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-zinc-950 text-zinc-400">
        <Loader2 className="mr-2 h-6 w-6 animate-spin text-amber-500" />
        <span className="text-sm font-medium">관리자 권한 조회 중...</span>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-zinc-950 font-sans text-zinc-50 antialiased">
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-zinc-800 bg-zinc-900/90 p-3 backdrop-blur-md sm:p-4">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          <button
            onClick={() => router.push("/admin/dashboard")}
            className="rounded-full p-1.5 text-zinc-400 transition-colors active:bg-zinc-800 active:text-zinc-100"
            title="운영 대시보드"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-amber-500" />
              <h1 className="truncate text-sm font-bold tracking-tight text-zinc-100 sm:text-base">{settings.botName}</h1>
            </div>
            <p className="truncate text-[11px] text-zinc-400 sm:text-xs">말로 요청하고, 실행 관리는 대시보드에서 합니다.</p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => router.push("/admin/dashboard")}
            className="relative flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-xs font-semibold text-amber-300 transition-colors active:border-amber-400 sm:px-3"
            title="운영 대시보드"
          >
            <Activity className="h-4 w-4" />
            <span className="hidden sm:inline">운영 대시보드</span>
            {pendingApprovalCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold text-zinc-950">
                {pendingApprovalCount}
              </span>
            )}
          </button>
          <button
            onClick={handleReset}
            className="rounded-full p-2 text-zinc-400 transition-colors active:bg-zinc-800 active:text-zinc-100"
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

      {showSettings && (
        <div className="border-b border-zinc-800 bg-zinc-900/90 p-4">
          <h2 className="mb-2 text-xs font-semibold text-amber-500">에이전트 페르소나 지침</h2>
          <textarea
            value={settings.systemPrompt}
            onChange={(event) => setSettings({ ...settings, systemPrompt: event.target.value })}
            className="w-full rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 text-xs text-zinc-300 focus:border-amber-500 focus:outline-none"
            rows={4}
          />
          <div className="mt-2.5 flex justify-end">
            <button
              onClick={() => setShowSettings(false)}
              className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-zinc-950 active:bg-amber-600"
            >
              지침 적용
            </button>
          </div>
        </div>
      )}

      <main className="flex-1 space-y-4 overflow-x-hidden overflow-y-auto p-3 pb-6 sm:p-4">
        {messages.map((message) => {
          const isUser = message.role === "user";
          return (
            <div key={message.id} className={`flex w-full gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
              {!isUser && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-amber-500/30 bg-amber-500/10 text-amber-500">
                  <Bot className="h-4 w-4" />
                </div>
              )}

              <div className="flex min-w-0 max-w-[85%] flex-col gap-1.5">
                {!isUser && message.toolsUsed && message.toolsUsed.length > 0 && (
                  <div className="mb-1 flex flex-wrap gap-1.5">
                    {message.toolsUsed.map((tool, index) => (
                      <ToolChip
                        key={`${tool.toolName}-${index}`}
                        tool={tool}
                        onOpenApproval={() => openApprovalDashboard(tool.approvalId)}
                      />
                    ))}
                  </div>
                )}

                <div className={`whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm ${
                  isUser
                    ? "rounded-tr-none bg-amber-500 font-medium text-zinc-950"
                    : "rounded-tl-none border border-zinc-800 bg-zinc-900 text-zinc-200"
                }`}>
                  {message.content === "" && isLoading && !message.toolsUsed?.some((tool) => tool.status === "running") ? (
                    <div className="flex items-center gap-1.5 py-1 text-zinc-400">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400" style={{ animationDelay: "0ms" }} />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400" style={{ animationDelay: "150ms" }} />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400" style={{ animationDelay: "300ms" }} />
                    </div>
                  ) : (
                    message.content
                  )}
                </div>

                <span className="px-1 text-[10px] text-zinc-500">{message.timestamp}</span>
              </div>

              {isUser && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-zinc-700 bg-zinc-800 text-zinc-300">
                  <User className="h-4 w-4" />
                </div>
              )}
            </div>
          );
        })}
        <div ref={chatEndRef} />
      </main>

      <footer className="z-10 w-full border-t border-zinc-800 bg-zinc-900/90 p-3 pb-[env(safe-area-inset-bottom)] backdrop-blur-md">
        <form onSubmit={handleSendMessage} className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
            placeholder="운영 점검이나 승인 요청을 말로 시켜주세요..."
            disabled={isLoading}
            className="min-w-0 flex-1 rounded-full border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-xs text-zinc-200 placeholder:text-zinc-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!inputValue.trim() || isLoading}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500 text-zinc-950 transition-transform active:scale-95 disabled:bg-zinc-800 disabled:text-zinc-600"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </form>
      </footer>
    </div>
  );
}

function ToolChip({ tool, onOpenApproval }: { tool: ToolExecution; onOpenApproval: () => void }) {
  const isRunning = tool.status === "running";
  const isSuccess = tool.status === "success";
  const isApprovalRequired = tool.status === "approval_required";

  return (
    <button
      type="button"
      onClick={onOpenApproval}
      disabled={!tool.approvalId}
      title={tool.approvalId ? "운영 대시보드에서 이 요청 보기" : undefined}
      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium tracking-wide transition-all disabled:cursor-default ${
        isRunning
          ? "animate-pulse border-amber-500/30 bg-amber-500/5 text-amber-400"
          : isSuccess
            ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-400"
            : isApprovalRequired
              ? "border-sky-500/30 bg-sky-500/5 text-sky-400"
              : "border-rose-500/30 bg-rose-500/5 text-rose-400"
      }`}
    >
      <ToolIcon toolName={tool.toolName} />
      <span>
        {getToolLabel(tool.toolName)}
        {isRunning ? " 중..." : isSuccess ? " 완료" : isApprovalRequired ? " 승인 대기" : " 실패"}
      </span>
      {isRunning ? (
        <Loader2 className="h-2.5 w-2.5 animate-spin" />
      ) : isSuccess ? (
        <CheckCircle2 className="h-2.5 w-2.5" />
      ) : isApprovalRequired ? (
        <ClipboardCheck className="h-2.5 w-2.5" />
      ) : (
        <AlertCircle className="h-2.5 w-2.5" />
      )}
      {tool.approvalId && (
        <span className="ml-0.5 rounded-full bg-sky-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-sky-300">
          대시보드
        </span>
      )}
    </button>
  );
}

function ToolIcon({ toolName }: { toolName: string }) {
  const className = "h-3 w-3 shrink-0";
  if (toolName === "get_db_statistics") return <Database className={className} />;
  if (toolName === "take_map_screenshot") return <Link2 className={className} />;
  if (toolName === "tavily_search") return <Search className={className} />;
  if (toolName === "get_vercel_deployments") return <Cloud className={className} />;
  if (toolName === "get_vercel_build_logs") return <Terminal className={className} />;
  if (toolName.includes("approval") || toolName.includes("cache") || toolName.includes("memory")) return <ClipboardCheck className={className} />;
  if (toolName.includes("operations") || toolName.includes("readiness") || toolName.includes("monitor")) return <Activity className={className} />;
  if (toolName.includes("incident") || toolName.includes("risk")) return <AlertCircle className={className} />;
  if (toolName.includes("post") || toolName.includes("content") || toolName.includes("briefing") || toolName.includes("report")) return <FileText className={className} />;
  if (toolName.includes("cleanup")) return <XCircle className={className} />;
  return <FileText className={className} />;
}

function getToolLabel(toolName: string) {
  const labels: Record<string, string> = {
    get_db_statistics: "DB 집계",
    take_map_screenshot: "지도 캡처",
    tavily_search: "웹 검색",
    get_vercel_deployments: "배포 조회",
    get_vercel_build_logs: "빌드 분석",
    inspect_operations: "운영 진단",
    inspect_agent_readiness: "준비 점검",
    inspect_approval_queue: "승인 분석",
    inspect_incident_timeline: "사고 타임라인",
    inspect_handoff_packet: "인수인계",
    inspect_owner_brief: "운영자 브리핑",
    inspect_monitor_trend: "추세 점검",
    inspect_today_action_board: "오늘 액션",
    inspect_daily_checkout: "마감 점검",
    inspect_risk_radar: "위험 예측",
    inspect_approval_advisor: "승인 권고",
    inspect_mission_control: "미션 컨트롤",
    inspect_owner_inbox: "오너 인박스",
    inspect_final_readiness: "최종 점검",
    request_cache_cleanup: "캐시 정리",
    search_agent_memories: "기억 검색",
    request_agent_memory: "기억 저장",
    generate_operations_briefing: "브리핑 생성",
    request_operations_report: "리포트 저장",
    generate_content_draft: "초안 생성",
    analyze_content_performance: "성과 분석",
    request_content_post: "콘텐츠 발행"
  };
  return labels[toolName] || "도구 실행";
}

function createClientTimeoutError() {
  const error = new Error("Agent client request timed out");
  error.name = "AbortError";
  return error;
}

function withClientTimeout<T>(promise: Promise<T>, timeoutMs: number, onTimeout: () => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      onTimeout();
      reject(createClientTimeoutError());
    }, Math.max(1, timeoutMs));

    promise
      .then((value) => {
        window.clearTimeout(timeout);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timeout);
        reject(error);
      });
  });
}

"use client";

/* eslint-disable react-hooks/immutability, react-hooks/purity */

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { 
  Send, Bot, User, Settings, ArrowLeft, RotateCcw, 
  Database, FileText, CheckCircle2, AlertCircle, Loader2, Link2, Search, Cloud, Terminal, ClipboardCheck, XCircle, Eye, Activity, Clipboard
} from "lucide-react";
import { AgentApproval, AgentApprovalSummary, AgentCommandCenter, AgentMemory, AgentMemorySummary, AgentMonitorSnapshot, AgentRun, AgentStep, ChatMessage, BotSettings } from "@/types/admin-bot";

type ApprovalFilter = "pending" | "high" | "stale" | "done" | "all";
const AGENT_CLIENT_TIMEOUT_MS = 45_000;

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
  const [showApprovals, setShowApprovals] = useState(false);
  const [showMemories, setShowMemories] = useState(false);
  const [showCommandCenter, setShowCommandCenter] = useState(false);
  const [approvals, setApprovals] = useState<AgentApproval[]>([]);
  const [approvalSummary, setApprovalSummary] = useState<AgentApprovalSummary | null>(null);
  const [approvalFilter, setApprovalFilter] = useState<ApprovalFilter>("pending");
  const [agentRuns, setAgentRuns] = useState<AgentRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedRunSteps, setSelectedRunSteps] = useState<AgentStep[]>([]);
  const [selectedRunTimeline, setSelectedRunTimeline] = useState<string | null>(null);
  const [timelineLoadingId, setTimelineLoadingId] = useState<string | null>(null);
  const [memories, setMemories] = useState<AgentMemory[]>([]);
  const [memorySummary, setMemorySummary] = useState<AgentMemorySummary | null>(null);
  const [commandCenter, setCommandCenter] = useState<AgentCommandCenter | null>(null);
  const [monitorSnapshot, setMonitorSnapshot] = useState<AgentMonitorSnapshot | null>(null);
  const [selectedApprovalId, setSelectedApprovalId] = useState<string | null>(null);
  const [approvalLoadingId, setApprovalLoadingId] = useState<string | null>(null);
  const [approvalActionNotice, setApprovalActionNotice] = useState<string | null>(null);
  const [memoryLoadingId, setMemoryLoadingId] = useState<string | null>(null);
  const [monitorLoading, setMonitorLoading] = useState(false);
  const [monitorReportLoading, setMonitorReportLoading] = useState(false);
  const [digestReportLoading, setDigestReportLoading] = useState(false);
  const [finalReportLoading, setFinalReportLoading] = useState(false);
  const [incidentReportLoading, setIncidentReportLoading] = useState(false);
  const [handoffReportLoading, setHandoffReportLoading] = useState(false);
  const [memoryQuery, setMemoryQuery] = useState("");
  const [memoryCategory, setMemoryCategory] = useState("all");
  const [memoryIncludeInactive, setMemoryIncludeInactive] = useState(false);
  
  // 봇의 기본 페르소나 설정
  const [settings, setSettings] = useState<BotSettings>({
    botName: "BGMS AI 비서 봇",
    systemPrompt: "너는 배틀그라운드 지도 분석 서비스(BGMS)의 똑똑하고 친근한 공식 운영진이자 분석 AI 에이전트봇이야. 유저들에게는 지나친 비속어는 배제하고 적당히 위트가 넘치는 스마트한 구어체(존댓말)로 정제하여 글을 작성해야 해. 팩트 데이터가 주어지면 그대로 활용하고, 이미지 검색 노출을 위해 맵 이름과 구체적인 수치들을 생생하게 스토리텔링 형식으로 포스팅 본문에 배치해야 해. 특히, 게시판 등록용 본문을 작성할 때는 Markdown 문법을 절대 쓰지 말고 HTML 문법(<p>, <h3>, <ul>, <img src='이미지주소' /> 등)을 사용해 작성해 줘."
  });

  const chatEndRef = useRef<HTMLDivElement>(null);
  const messageContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 1. 관리자 권한 확인 (Supabase JWT Guard)
  useEffect(() => {
    async function checkAdmin() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login"); // 로그인하지 않았다면 이동
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

  useEffect(() => {
    if (isAdmin) {
      loadApprovals();
      loadCommandCenter();
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    const searchParams = new URLSearchParams(window.location.search);
    const approvalId = searchParams.get("approval");
    const runId = searchParams.get("run");
    if (!approvalId && !runId) return;

    setShowApprovals(true);
    setShowMemories(false);
    setApprovalFilter("all");

    if (approvalId) {
      setSelectedApprovalId(approvalId);
      Promise.all([loadApprovals(), loadAgentRuns()]);
    }

    if (runId) {
      Promise.all([loadApprovals(), loadAgentRuns()]);
      loadRunDetail(runId);
    }
  }, [isAdmin]);

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

  const loadApprovals = async () => {
    const response = await fetch("/api/admin/agent/approvals");
    if (!response.ok) return;
    const data = await response.json();
    const nextApprovals = data.approvals || [];
    setApprovals(nextApprovals);
    setApprovalSummary(data.summary || null);
    setSelectedApprovalId(current => nextApprovals.some((approval: AgentApproval) => approval.id === current) ? current : nextApprovals?.[0]?.id || null);
  };

  const loadAgentRuns = async () => {
    const response = await fetch("/api/admin/agent/runs");
    if (!response.ok) return;
    const data = await response.json();
    setAgentRuns(data.runs || []);
  };

  const loadRunDetail = async (runId: string) => {
    setSelectedRunId(runId);
    setSelectedRunTimeline(null);
    const response = await fetch(`/api/admin/agent/runs/${runId}`);
    if (!response.ok) {
      setSelectedRunSteps([]);
      return;
    }
    const data = await response.json();
    setSelectedRunSteps(data.steps || []);
  };

  const loadRunTimeline = async (runId: string) => {
    setTimelineLoadingId(runId);
    try {
      const response = await fetch(`/api/admin/agent/runs/${runId}/timeline`);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "timeline 생성에 실패했습니다.");
      }
      const data = await response.json();
      setSelectedRunTimeline(data.markdown || "");
    } catch (error: any) {
      alert(error.message || "timeline 생성에 실패했습니다.");
    } finally {
      setTimelineLoadingId(null);
    }
  };

  const copyRunTimeline = async () => {
    if (!selectedRunTimeline) return;
    try {
      await navigator.clipboard.writeText(selectedRunTimeline);
      alert("Timeline markdown을 클립보드에 복사했습니다.");
    } catch {
      alert("복사에 실패했습니다. 아래 내용을 직접 선택해 복사해 주세요.");
    }
  };

  const copyCommandCenterMarkdown = async () => {
    try {
      const response = await fetch("/api/admin/agent/command-center?format=markdown");
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "운영 요약 export 생성에 실패했습니다.");
      }
      const data = await response.json();
      await navigator.clipboard.writeText(data.markdown || "");
      alert("운영 커맨드센터 요약 markdown을 클립보드에 복사했습니다.");
    } catch (error: any) {
      alert(error.message || "운영 요약 복사에 실패했습니다.");
    }
  };

  const copyDailyDigestMarkdown = async () => {
    try {
      const response = await fetch("/api/admin/agent/command-center?format=digest");
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "일일 운영 digest 생성에 실패했습니다.");
      }
      const data = await response.json();
      await navigator.clipboard.writeText(data.markdown || "");
      alert("일일 운영 digest markdown을 클립보드에 복사했습니다.");
    } catch (error: any) {
      alert(error.message || "일일 운영 digest 복사에 실패했습니다.");
    }
  };

  const copyFinalReadinessMarkdown = async () => {
    try {
      const response = await fetch("/api/admin/agent/command-center?format=final");
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "최종 readiness 보고서 생성에 실패했습니다.");
      }
      const data = await response.json();
      await navigator.clipboard.writeText(data.markdown || "");
      alert("최종 readiness 보고서 markdown을 클립보드에 복사했습니다.");
    } catch (error: any) {
      alert(error.message || "최종 readiness 보고서 복사에 실패했습니다.");
    }
  };

  const requestDailyDigestReportSave = async () => {
    setDigestReportLoading(true);
    try {
      const response = await fetch("/api/admin/agent/command-center", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format: "digest",
          reason: "일일 운영 digest 기록 보존"
        })
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "일일 운영 digest 저장 요청에 실패했습니다.");
      }
      const body = await response.json();
      await Promise.all([loadApprovals(), loadCommandCenter()]);
      setShowApprovals(true);
      setShowMemories(false);
      setSelectedApprovalId(body.approvalId || null);
      alert("일일 운영 digest 저장 승인 요청을 생성했습니다.");
    } catch (error: any) {
      alert(error.message || "일일 운영 digest 저장 요청에 실패했습니다.");
    } finally {
      setDigestReportLoading(false);
    }
  };

  const requestFinalReadinessReportSave = async () => {
    setFinalReportLoading(true);
    try {
      const response = await fetch("/api/admin/agent/command-center", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format: "final",
          reason: "최종형 Admin Agent readiness 증거 보존"
        })
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "최종 readiness 보고서 저장 요청에 실패했습니다.");
      }
      const body = await response.json();
      await Promise.all([loadApprovals(), loadCommandCenter()]);
      setShowApprovals(true);
      setShowMemories(false);
      setSelectedApprovalId(body.approvalId || null);
      alert("최종 readiness 보고서 저장 승인 요청을 생성했습니다.");
    } catch (error: any) {
      alert(error.message || "최종 readiness 보고서 저장 요청에 실패했습니다.");
    } finally {
      setFinalReportLoading(false);
    }
  };

  const copyHandoffPacketMarkdown = async () => {
    try {
      const response = await fetch("/api/admin/agent/handoff?hours=24&format=markdown");
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "운영 handoff packet 생성에 실패했습니다.");
      }
      const data = await response.json();
      await navigator.clipboard.writeText(data.markdown || "");
      alert("운영 인수인계 패킷 markdown을 클립보드에 복사했습니다.");
    } catch (error: any) {
      alert(error.message || "운영 인수인계 패킷 복사에 실패했습니다.");
    }
  };

  const requestHandoffPacketReportSave = async () => {
    setHandoffReportLoading(true);
    try {
      const response = await fetch("/api/admin/agent/handoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hours: 24,
          reason: "운영 인수인계 기록 보존"
        })
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "운영 인수인계 저장 요청에 실패했습니다.");
      }
      const body = await response.json();
      await Promise.all([loadApprovals(), loadCommandCenter()]);
      setShowApprovals(true);
      setShowMemories(false);
      setSelectedApprovalId(body.approvalId || null);
      alert("운영 인수인계 리포트 저장 승인 요청을 생성했습니다.");
    } catch (error: any) {
      alert(error.message || "운영 인수인계 저장 요청에 실패했습니다.");
    } finally {
      setHandoffReportLoading(false);
    }
  };

  const copyIncidentTimelineMarkdown = async () => {
    try {
      const response = await fetch("/api/admin/agent/incidents?hours=24&format=markdown");
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "사고 타임라인 export 생성에 실패했습니다.");
      }
      const data = await response.json();
      await navigator.clipboard.writeText(data.markdown || "");
      alert("최근 24시간 사고 타임라인 markdown을 클립보드에 복사했습니다.");
    } catch (error: any) {
      alert(error.message || "사고 타임라인 복사에 실패했습니다.");
    }
  };

  const requestIncidentTimelineReportSave = async () => {
    setIncidentReportLoading(true);
    try {
      const response = await fetch("/api/admin/agent/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hours: 24,
          reason: "최근 24시간 사고 타임라인 운영 기록 보존"
        })
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "사고 타임라인 저장 요청에 실패했습니다.");
      }
      const body = await response.json();
      await Promise.all([loadApprovals(), loadCommandCenter()]);
      setShowApprovals(true);
      setShowMemories(false);
      setSelectedApprovalId(body.approvalId || null);
      alert("사고 타임라인 리포트 저장 승인 요청을 생성했습니다.");
    } catch (error: any) {
      alert(error.message || "사고 타임라인 저장 요청에 실패했습니다.");
    } finally {
      setIncidentReportLoading(false);
    }
  };

  const loadCommandCenter = async () => {
    const response = await fetch("/api/admin/agent/command-center");
    if (!response.ok) return;
    const data = await response.json();
    setCommandCenter(data);
  };

  const runManualMonitor = async () => {
    setMonitorLoading(true);
    try {
      const response = await fetch("/api/admin/agent/monitor", { method: "POST" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "수동 운영 점검에 실패했습니다.");
      }
      const snapshot = await response.json();
      setMonitorSnapshot(snapshot);
      await Promise.all([loadCommandCenter(), loadAgentRuns()]);
    } catch (error: any) {
      alert(error.message || "수동 운영 점검에 실패했습니다.");
    } finally {
      setMonitorLoading(false);
    }
  };

  const requestMonitorReportSave = async () => {
    if (!monitorSnapshot) return;
    setMonitorReportLoading(true);
    try {
      const response = await fetch("/api/admin/agent/briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `BGMS 수동 운영 점검 ${new Date(monitorSnapshot.generatedAt).toLocaleString("ko-KR")}`,
          snapshot: monitorSnapshot
        })
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "수동 점검 리포트 저장 요청에 실패했습니다.");
      }
      const body = await response.json();
      await Promise.all([loadApprovals(), loadCommandCenter()]);
      setShowApprovals(true);
      setShowMemories(false);
      setSelectedApprovalId(body.approvalId || null);
      alert("수동 점검 리포트 저장 승인 요청을 생성했습니다.");
    } catch (error: any) {
      alert(error.message || "수동 점검 리포트 저장 요청에 실패했습니다.");
    } finally {
      setMonitorReportLoading(false);
    }
  };

  const loadMemories = async (options?: { q?: string; category?: string; includeInactive?: boolean }) => {
    const q = options?.q ?? memoryQuery;
    const category = options?.category ?? memoryCategory;
    const includeInactive = options?.includeInactive ?? memoryIncludeInactive;
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (category !== "all") params.set("category", category);
    if (includeInactive) params.set("includeInactive", "true");
    const response = await fetch(`/api/admin/agent/memories${params.toString() ? `?${params.toString()}` : ""}`);
    if (!response.ok) return;
    const data = await response.json();
    setMemories(data.memories || []);
    setMemorySummary(data.summary || null);
  };

  const handleToggleApprovals = async () => {
    const next = !showApprovals;
    setShowApprovals(next);
    if (next) setShowMemories(false);
    if (next) {
      await Promise.all([loadApprovals(), loadAgentRuns()]);
    }
  };

  const handleToggleMemories = async () => {
    const next = !showMemories;
    setShowMemories(next);
    if (next) {
      setShowApprovals(false);
      await loadMemories();
    }
  };

  const openMemorySearch = async (query: string) => {
    setShowApprovals(false);
    setShowMemories(true);
    setMemoryQuery(query);
    await loadMemories({ q: query });
  };

  const openApprovalFromTool = async (approvalId?: string) => {
    if (!approvalId) return;
    setShowMemories(false);
    setShowApprovals(true);
    setApprovalFilter("all");
    setSelectedApprovalId(approvalId);
    await Promise.all([loadApprovals(), loadAgentRuns()]);
    setSelectedApprovalId(approvalId);
  };

  const handleApprovalAction = async (id: string, action: "approve" | "reject") => {
    const fetchOptions: RequestInit = { method: "POST" };
    if (action === "reject") {
      const reason = window.prompt("거절 사유를 입력해 주세요. 이 내용은 승인 로그에 남습니다.", "");
      if (reason === null) return;
      fetchOptions.headers = { "Content-Type": "application/json" };
      fetchOptions.body = JSON.stringify({ reason: reason.trim() || "관리자 거절" });
    } else {
      const approval = approvals.find((item) => item.id === id);
      if (approval?.impact?.risk === "high") {
        const ok = window.confirm([
          "고위험 승인 작업입니다.",
          approval.impact.summary,
          typeof approval.impact.estimatedRows === "number" ? `예상 영향 row: ${approval.impact.estimatedRows.toLocaleString("ko-KR")}` : "",
          "정말 실행하시겠습니까?"
        ].filter(Boolean).join("\n"));
        if (!ok) return;
        const approvalNote = window.prompt("승인 사유/메모를 입력해 주세요. 이 내용은 실행 로그에 남습니다.", "");
        if (approvalNote === null) return;
        fetchOptions.headers = { "Content-Type": "application/json" };
        fetchOptions.body = JSON.stringify({
          confirmedImpact: true,
          approvalNote: approvalNote.trim() || "고위험 impact 확인 후 승인"
        });
      }
    }

    setApprovalLoadingId(id);
    try {
      const response = await fetch(`/api/admin/agent/approvals/${id}/${action}`, fetchOptions);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "승인 요청 처리에 실패했습니다.");
      }
      const body = await response.json().catch(() => ({}));
      await loadApprovals();
      await loadAgentRuns();
      await loadCommandCenter();
      await loadMemories();
      setApprovalFilter("all");
      setSelectedApprovalId(id);
      const resultMessage = action === "approve"
        ? body.result?.execution?.message || "승인 작업이 처리되었습니다."
        : body.result?.reason ? `거절됨: ${body.result.reason}` : "승인 요청을 거절했습니다.";
      setApprovalActionNotice(resultMessage);
    } catch (error: any) {
      alert(error.message || "승인 요청 처리에 실패했습니다.");
    } finally {
      setApprovalLoadingId(null);
    }
  };

  const handleDeactivateMemory = async (id: string) => {
    if (!confirm("이 memory/report를 비활성화하시겠습니까? 삭제가 아니라 목록과 검색에서 숨기는 처리입니다.")) return;
    setMemoryLoadingId(id);
    try {
      const response = await fetch(`/api/admin/agent/memories/${id}/deactivate`, { method: "POST" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "memory 비활성화에 실패했습니다.");
      }
      await loadMemories();
      await loadCommandCenter();
    } catch (error: any) {
      alert(error.message || "memory 비활성화에 실패했습니다.");
    } finally {
      setMemoryLoadingId(null);
    }
  };

  const selectedApproval = approvals.find((approval) => approval.id === selectedApprovalId) || null;
  const pendingApprovalCount = approvals.filter((approval) => approval.status === "pending").length;
  const filteredApprovals = approvals.filter((approval) => {
    if (approvalFilter === "pending") return approval.status === "pending";
    if (approvalFilter === "high") return approval.queue?.priority === "high";
    if (approvalFilter === "stale") return approval.queue?.isStale;
    if (approvalFilter === "done") return approval.status !== "pending";
    return true;
  });
  const activeMemoryCount = memories.length || commandCenter?.memories?.items?.length || 0;
  const selectedApprovalRisk = selectedApproval?.impact?.risk || null;
  const memoryCategories = ["all", "incident", "policy", "report", "content", "operations"];
  const approvalStaleHours = commandCenter?.thresholds?.approvalStaleHours || 24;

  const getMemoryCategoryCount = (category: string) => {
    if (category === "all") return memorySummary?.total ?? memories.length;
    return memorySummary?.byCategory?.[category] ?? 0;
  };

  const getApprovalTitle = (approval: AgentApproval) => {
    return approval.payload?.title || approval.payload?.cleanupType || approval.action_type;
  };

  const getApprovalRisk = (approval: AgentApproval) => {
    if (approval.impact?.risk === "high") return `높은 위험 · ${approval.impact.summary}`;
    if (approval.impact?.risk === "medium") return `검토 필요 · ${approval.impact.summary}`;
    if (approval.impact?.risk === "low") return `낮은 위험 · ${approval.impact.summary}`;
    if (approval.action_type === "create_board_post") return "게시판 공개 발행";
    if (approval.action_type === "flush_old_cache") return "분석 캐시 대량 삭제";
    if (approval.action_type === "flush_player_cache") return "플레이어 캐시 삭제";
    if (approval.action_type === "flush_match_cache") return "매치 캐시 삭제";
    if (approval.action_type === "reset_benchmarks") return "벤치마크 초기화";
    return "관리자 승인 필요";
  };

  const formatDateTime = (value?: string | null) => {
    if (!value) return "-";
    return new Date(value).toLocaleString("ko-KR", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  const translateStatus = (value?: string | null) => {
    if (!value) return "-";
    const map: Record<string, string> = {
      completed: "완료",
      failed: "실패",
      running: "실행 중",
      pending: "대기",
      approved: "승인됨",
      rejected: "거절됨",
      ok: "정상",
      warn: "주의",
      critical: "위험",
      ready: "준비됨",
      pass: "통과",
      review: "검토",
      block: "차단",
      high: "높음",
      medium: "중간",
      low: "낮음",
      dangerous: "위험",
      write: "쓰기",
      read: "조회",
      safe: "안전",
      approval_required: "승인 필요",
      manual_check: "수동 확인",
      manual: "수동 확인",
      incident: "장애 대응",
      deploy_guard: "배포 보호",
      approval_review: "승인 검토",
      watch: "관찰",
      attention: "주의",
      blocked: "차단",
      urgent: "긴급",
      focus: "집중",
      act: "조치 필요",
      calm: "안정",
      recover: "복구",
      follow_up: "후속 조치",
      unresolved: "미해결",
      partial: "일부 준비",
      excellent: "매우 좋음",
      stable: "안정",
      needs_attention: "주의 필요",
      warming_up: "준비 중",
      useful: "유용",
      on_track: "정상 진행",
      needs_focus: "집중 필요",
      no_data: "데이터 없음",
      warning: "주의",
      changed: "변경됨",
      same: "동일"
    };
    return map[value] || value;
  };

  const translatePhase = (value?: string | null) => {
    if (!value) return "";
    const map: Record<string, string> = {
      stabilize: "안정화",
      decide: "판단",
      approve: "승인",
      delegate: "위임",
      verify: "검증",
      record: "기록",
      watch: "관찰",
      reject: "거절",
      defer: "보류",
      Now: "지금",
      "This Week": "이번 주",
      Later: "나중에"
    };
    return map[value] || translateStatus(value);
  };

  const translateSignal = (value?: string | null) => {
    if (!value) return "";
    return value
      .replaceAll("Latest Monitor Snapshot", "최근 점검 결과")
      .replaceAll("Monitor Trend", "점검 추세")
      .replaceAll("Daily Checkout", "마감 점검")
      .replaceAll("Owner Brief", "운영자 요약")
      .replaceAll("Operating Mode", "운영 모드")
      .replaceAll("Today Action Board", "오늘 할 일 보드")
      .replaceAll("Approval Queue", "승인 대기열")
      .replaceAll("Current Signals", "현재 신호")
      .replaceAll("Next Best Actions", "다음 추천 작업")
      .replaceAll("Final Readiness", "최종 준비 상태")
      .replaceAll("Admin Agent", "관리자 AI")
      .replaceAll("Agent Readiness", "에이전트 준비 상태")
      .replaceAll("Rollout Readiness", "배포 전 점검")
      .replaceAll("Agent readiness critical", "에이전트 준비 상태 위험")
      .replaceAll("Agent readiness", "에이전트 준비 상태")
      .replaceAll("agent readiness", "에이전트 준비 상태")
      .replaceAll("readiness", "준비 상태")
      .replaceAll("Rollout fail", "배포 전 점검 실패")
      .replaceAll("rollout readiness fail", "배포 전 점검 실패")
      .replaceAll("rollout", "배포 전 점검")
      .replaceAll("scheduled operational monitor", "자동 운영 점검")
      .replaceAll("manual operational monitor", "수동 운영 점검")
      .replaceAll("deployment gate", "배포 안전문")
      .replaceAll("Deployment", "배포")
      .replaceAll("deployment", "배포")
      .replaceAll("tool registry", "도구 목록")
      .replaceAll("tools", "도구")
      .replaceAll("tool", "도구")
      .replaceAll("approval queue", "승인 대기열")
      .replaceAll("approval", "승인")
      .replaceAll("self-test", "자가 점검")
      .replaceAll("monitor snapshot", "점검 기록")
      .replaceAll("monitor", "점검")
      .replaceAll("snapshot", "기록")
      .replaceAll("memory", "운영 기억")
      .replaceAll("env", "환경변수")
      .replaceAll("quota", "호출 한도")
      .replaceAll("remaining", "남은")
      .replaceAll("Remaining Work", "남은 작업")
      .replaceAll("severity", "위험도")
      .replaceAll("alerts", "알림")
      .replaceAll("alert", "알림")
      .replaceAll("gate block", "승인 차단")
      .replaceAll("gate", "안전문")
      .replaceAll("checkout", "마감 점검")
      .replaceAll("thresholds", "기준값")
      .replaceAll("stale", "오래됨")
      .replaceAll("latest report", "최근 보고서")
      .replaceAll("owner", "운영자")
      .replaceAll("automation", "자동화")
      .replaceAll("contract", "기준표")
      .replaceAll("capability", "기능")
      .replaceAll("outcome", "결과")
      .replaceAll("operator", "운영자")
      .replaceAll("mission", "임무")
      .replaceAll("inbox", "확인함")
      .replaceAll("Recommended Playbooks", "추천 처리 절차")
      .replaceAll("Related Memories", "관련 운영 기억")
      .replaceAll("candidates", "후보")
      .replaceAll("posts", "게시글")
      .replaceAll("Top", "상위")
      .replaceAll("views", "조회")
      .replaceAll("engagement", "반응률")
      .replaceAll("momentum", "흐름")
      .replaceAll("status", "상태")
      .replaceAll("critical", "위험")
      .replaceAll("high", "높음")
      .replaceAll("medium", "중간")
      .replaceAll("low", "낮음")
      .replaceAll("READINESS", "준비 상태")
      .replaceAll("OPERATIONS", "운영")
      .replaceAll("CONTENT", "콘텐츠")
      .replaceAll("DEPLOYMENT", "배포")
      .replaceAll("scheduled", "자동")
      .replaceAll("operational", "운영")
      .replaceAll("ready", "준비됨")
      .replaceAll("completed", "완료")
      .replaceAll("failed", "실패")
      .replaceAll("running", "실행 중")
      .replaceAll("pass", "통과")
      .replaceAll("review", "검토")
      .replaceAll("block", "차단")
      .replaceAll("watch", "관찰")
      .replaceAll("score", "점수");
  };

  const formatApprovalResult = (value?: string | null) => {
    if (!value) return "";
    try {
      const parsed = JSON.parse(value);
      if (parsed?.rejected) return `거절됨: ${parsed.reason || "사유 미입력"}`;
      const lines = [];
      if (parsed?.execution?.message) lines.push(parsed.execution.message);
      else if (parsed?.execution?.success) lines.push("승인 작업이 성공적으로 실행되었습니다.");
      if (parsed?.postExecution) {
        lines.push(`결과 요약: ${parsed.postExecution.outcome}`);
        if (parsed.postExecution.metrics?.length) {
          lines.push(`핵심 수치: ${parsed.postExecution.metrics.map((item: any) => `${item.label} ${item.value}`).join(" · ")}`);
        }
        if (parsed.postExecution.followUp?.length) {
          lines.push(`후속 점검: ${parsed.postExecution.followUp.join(" / ")}`);
        }
        if (parsed.postExecution.audit?.relatedResource) {
          lines.push(`관련 리소스: ${parsed.postExecution.audit.relatedResource}`);
        }
      }
      if (parsed?.decision) {
        if (parsed.decision.approvalNote) lines.push(`승인 메모: ${parsed.decision.approvalNote}`);
        if (parsed.decision.highRisk) {
          lines.push(`고위험 확인: ${parsed.decision.confirmedImpact ? "완료" : "미확인"}`);
        }
      }
      if (lines.length) return lines.join("\n");
      return JSON.stringify(parsed, null, 2);
    } catch {
      return value;
    }
  };

  const formatStepResult = (value?: string | null) => {
    if (!value) return "";
    try {
      const parsed = JSON.parse(value);
      if (parsed?.message) return parsed.message;
      if (parsed?.approvalRequired) return parsed.message || "승인 대기 요청이 생성되었습니다.";
      return JSON.stringify(parsed, null, 2);
    } catch {
      return value;
    }
  };

  const sendAgentMessage = async (messageText: string) => {
    if (!messageText.trim() || isLoading) return;

    const userMessageContent = messageText.trim();
    setInputValue("");
    setIsLoading(true);
    const abortController = new AbortController();
    const startedAt = Date.now();
    const timeoutId = window.setTimeout(() => abortController.abort(), AGENT_CLIENT_TIMEOUT_MS);

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
        signal: abortController.signal,
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
                // 도구 실행 칩 추가 (대기 상태)
                setMessages(prev => prev.map(m => {
                  if (m.id === botMsgId) {
                    const currentTools = m.toolsUsed || [];
                    return {
                      ...m,
                      toolsUsed: [
                        ...currentTools,
                        { toolName: payload.toolName, status: "running", params: payload.params, safetyLevel: payload.safetyLevel }
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
                        ? { ...t, status: payload.status, approvalId: payload.approvalId, error: payload.status === "failed" ? payload.result : undefined }
                        : t
                    );
                    return { ...m, toolsUsed: updatedTools };
                  }
                  return m;
                }));
                if (payload.status === "approval_required") {
                  loadApprovals();
                }
              } else if (payload.type === "approval_required") {
                loadApprovals();
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
            } catch {
              // 개별 라인 파싱 지연 오류 가드로 무시
            }
          }
        }
      }
    } catch (error: any) {
      const message = error?.name === "AbortError"
        ? "응답 시간이 45초를 넘어서 중단했습니다. 같은 질문을 다시 보내거나, 운영판의 수동 점검 버튼으로 상태를 먼저 확인해 주세요."
        : error.message || "연동 실패";
      setMessages(prev => prev.map(m => {
        if (m.id === botMsgId) {
          return {
            ...m,
            content: `오류가 발생했습니다: ${message}`
          };
        }
        return m;
      }));
    } finally {
      window.clearTimeout(timeoutId);
      setIsLoading(false);
      loadCommandCenter();
      if (showMemories) loadMemories();
    }
  };

  const stagePrompt = (prompt: string) => {
    setInputValue(prompt);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  // 봇에게 메시지 전송
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
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
    <div className="flex h-[calc(100dvh-4.5rem)] w-full flex-col bg-zinc-950 text-zinc-50 font-sans antialiased overflow-hidden">
      
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
            onClick={handleToggleApprovals}
            className={`relative flex items-center gap-1.5 rounded-full px-2.5 py-2 text-xs font-semibold transition-colors ${showApprovals ? "bg-emerald-500/10 text-emerald-400" : "text-zinc-400 active:bg-zinc-800"}`}
            title="승인 대기"
          >
            <ClipboardCheck className="h-4 w-4" />
            <span className="hidden sm:inline">승인</span>
            {pendingApprovalCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold text-zinc-950">
                {pendingApprovalCount}
              </span>
            )}
          </button>
          <button
            onClick={handleToggleMemories}
            className={`relative flex items-center gap-1.5 rounded-full px-2.5 py-2 text-xs font-semibold transition-colors ${showMemories ? "bg-sky-500/10 text-sky-400" : "text-zinc-400 active:bg-zinc-800"}`}
            title="운영 기억"
          >
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">기억</span>
            {activeMemoryCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-sky-500 px-1 text-[10px] font-bold text-zinc-950">
                {activeMemoryCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setShowCommandCenter((value) => !value)}
            className={`hidden items-center gap-1.5 rounded-full px-2.5 py-2 text-xs font-semibold transition-colors sm:flex ${showCommandCenter ? "bg-amber-500/10 text-amber-400" : "text-zinc-400 active:bg-zinc-800"}`}
            title="운영판 열기/접기"
          >
            <Activity className="h-4 w-4" />
            <span>운영판</span>
          </button>
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

      {commandCenter && (
        <section className={`shrink-0 border-b border-zinc-800 bg-zinc-950 px-4 py-3 ${showCommandCenter ? "max-h-[34dvh] overflow-y-auto" : ""}`}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                commandCenter.severity === "ok"
                  ? "bg-emerald-500"
                  : commandCenter.severity === "warn"
                    ? "bg-amber-500"
                    : "bg-rose-500"
              }`} />
              <div className="min-w-0">
                <h2 className="truncate text-sm font-bold text-zinc-100">AI 비서 사용법</h2>
                <p className="text-xs text-zinc-500">
                  {showCommandCenter
                    ? "운영판을 펼쳐서 상세 지표를 확인 중입니다."
                    : "궁금한 걸 입력하면 조회는 바로 하고, 위험 작업은 승인 요청만 만듭니다."}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2 overflow-x-auto pb-1">
              <button
                onClick={() => setShowCommandCenter((value) => !value)}
                className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold ${
                  showCommandCenter
                    ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                    : "border-zinc-800 text-zinc-300 active:border-amber-500"
                }`}
              >
                <Activity className="h-3.5 w-3.5" />
                {showCommandCenter ? "운영판 접기" : "운영판 보기"}
              </button>
              <button
                onClick={copyCommandCenterMarkdown}
                className={`${showCommandCenter ? "hidden md:inline-flex" : "hidden"} items-center gap-1.5 rounded-md border border-zinc-800 px-2 py-1 text-xs font-semibold text-zinc-400 active:border-zinc-600 active:text-zinc-200`}
              >
                <Clipboard className="h-3.5 w-3.5" />
                요약 복사
              </button>
              <button
                onClick={copyDailyDigestMarkdown}
                className={`${showCommandCenter ? "hidden sm:inline-flex" : "hidden"} items-center gap-1.5 rounded-md border border-sky-500/20 px-2 py-1 text-xs font-semibold text-sky-300 active:border-sky-400`}
              >
                <Clipboard className="h-3.5 w-3.5" />
                일일 요약
              </button>
              <button
                onClick={copyFinalReadinessMarkdown}
                className={`${showCommandCenter ? "hidden md:inline-flex" : "hidden"} items-center gap-1.5 rounded-md border border-emerald-500/20 px-2 py-1 text-xs font-semibold text-emerald-300 active:border-emerald-400`}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                최종 보고
              </button>
              <button
                onClick={requestDailyDigestReportSave}
                disabled={digestReportLoading}
                className={`${showCommandCenter ? "hidden lg:inline-flex" : "hidden"} items-center gap-1.5 rounded-md border border-sky-500/20 px-2 py-1 text-xs font-semibold text-sky-300 active:border-sky-400 disabled:opacity-50`}
              >
                {digestReportLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                요약 저장
              </button>
              <button
                onClick={requestFinalReadinessReportSave}
                disabled={finalReportLoading}
                className={`${showCommandCenter ? "hidden xl:inline-flex" : "hidden"} items-center gap-1.5 rounded-md border border-emerald-500/20 px-2 py-1 text-xs font-semibold text-emerald-300 active:border-emerald-400 disabled:opacity-50`}
              >
                {finalReportLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                최종 저장
              </button>
              <button
                onClick={copyHandoffPacketMarkdown}
                className={`${showCommandCenter ? "hidden sm:inline-flex" : "hidden"} items-center gap-1.5 rounded-md border border-emerald-500/20 px-2 py-1 text-xs font-semibold text-emerald-300 active:border-emerald-400`}
              >
                <ClipboardCheck className="h-3.5 w-3.5" />
                인수인계
              </button>
              <button
                onClick={requestHandoffPacketReportSave}
                disabled={handoffReportLoading}
                className={`${showCommandCenter ? "hidden lg:inline-flex" : "hidden"} items-center gap-1.5 rounded-md border border-emerald-500/20 px-2 py-1 text-xs font-semibold text-emerald-300 active:border-emerald-400 disabled:opacity-50`}
              >
                {handoffReportLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
                인계 저장
              </button>
              <button
                onClick={copyIncidentTimelineMarkdown}
                className={`${showCommandCenter ? "hidden md:inline-flex" : "hidden"} items-center gap-1.5 rounded-md border border-rose-500/20 px-2 py-1 text-xs font-semibold text-rose-300 active:border-rose-400`}
              >
                <AlertCircle className="h-3.5 w-3.5" />
                사고 타임라인
              </button>
              <button
                onClick={requestIncidentTimelineReportSave}
                disabled={incidentReportLoading}
                className={`${showCommandCenter ? "hidden sm:inline-flex" : "hidden"} items-center gap-1.5 rounded-md border border-amber-500/20 px-2 py-1 text-xs font-semibold text-amber-300 active:border-amber-400 disabled:opacity-50`}
              >
                {incidentReportLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ClipboardCheck className="h-3.5 w-3.5" />}
                사고 저장
              </button>
              <button
                onClick={runManualMonitor}
                disabled={monitorLoading}
                className="inline-flex items-center gap-1.5 rounded-md border border-sky-500/30 bg-sky-500/5 px-2 py-1 text-xs font-semibold text-sky-300 active:border-sky-400 disabled:opacity-50"
              >
                {monitorLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Activity className="h-3.5 w-3.5" />}
                수동 점검
              </button>
              <button
                onClick={loadCommandCenter}
                className="rounded-md border border-zinc-800 px-2 py-1 text-xs text-zinc-400 active:border-zinc-600 active:text-zinc-200"
              >
                갱신
              </button>
            </div>
          </div>

          {showCommandCenter ? (
          <>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
            <div className={`rounded-md border p-2 ${
              (commandCenter.approvalGateSummary?.blockCount || 0) > 0
                ? "border-rose-500/30 bg-rose-500/5"
                : "border-zinc-800 bg-zinc-900"
            }`}>
              <p className="text-[10px] font-semibold text-zinc-500">승인 대기</p>
              <p className="mt-1 text-lg font-bold text-zinc-100">{commandCenter.pendingApprovals.count}</p>
              {(commandCenter.pendingApprovals.highRiskCount || commandCenter.pendingApprovals.staleCount || commandCenter.approvalGateSummary?.blockCount) ? (
                <p className={`mt-0.5 text-[10px] ${(commandCenter.approvalGateSummary?.blockCount || 0) > 0 ? "text-rose-400" : "text-amber-400"}`}>
                  고위험 {commandCenter.pendingApprovals.highRiskCount || 0} · 오래됨 {commandCenter.pendingApprovals.staleCount || 0}
                  {(commandCenter.approvalGateSummary?.blockCount || 0) > 0 ? ` · 차단 ${commandCenter.approvalGateSummary?.blockCount}` : ""}
                </p>
              ) : null}
            </div>
            <div className="rounded-md border border-zinc-800 bg-zinc-900 p-2">
              <p className="text-[10px] font-semibold text-zinc-500">실패한 실행</p>
              <p className="mt-1 text-lg font-bold text-zinc-100">{commandCenter.failedRuns.count}</p>
            </div>
            <div className="rounded-md border border-zinc-800 bg-zinc-900 p-2">
              <p className="text-[10px] font-semibold text-zinc-500">API 오류</p>
              <p className="mt-1 text-lg font-bold text-zinc-100">{commandCenter.apiErrors.total}</p>
            </div>
            <div className="rounded-md border border-zinc-800 bg-zinc-900 p-2">
              <p className="text-[10px] font-semibold text-zinc-500">AI 비용</p>
              <p className="mt-1 text-lg font-bold text-zinc-100">${commandCenter.aiUsage.totalCostUsd.toFixed(4)}</p>
            </div>
            <div className={`rounded-md border p-2 ${
              commandCenter.deploymentHealth?.severity === "critical"
                ? "border-rose-500/30 bg-rose-500/5"
                : commandCenter.deploymentHealth?.severity === "warn"
                  ? "border-amber-500/30 bg-amber-500/5"
                  : "border-zinc-800 bg-zinc-900"
            }`}>
              <p className="text-[10px] font-semibold text-zinc-500">배포 상태</p>
              <div className="mt-1 flex items-center gap-1.5">
                <Cloud className={`h-3.5 w-3.5 ${
                  commandCenter.deploymentHealth?.severity === "critical"
                    ? "text-rose-400"
                    : commandCenter.deploymentHealth?.severity === "warn"
                      ? "text-amber-400"
                      : "text-emerald-400"
                }`} />
                <p className="truncate text-sm font-bold text-zinc-100">
                  {commandCenter.deploymentHealth?.configured === false
                    ? "연결 안 함"
                    : translateStatus(commandCenter.deploymentHealth?.latest?.state || "ok")}
                </p>
              </div>
            </div>
          </div>

          {commandCenter.operatingMode && (
            <div className={`mt-2 rounded-md border p-2 text-xs ${
              commandCenter.operatingMode.mode === "incident" || commandCenter.operatingMode.mode === "deploy_guard"
                ? "border-rose-500/20 bg-rose-500/5 text-rose-100"
                : commandCenter.operatingMode.mode === "approval_review" || commandCenter.operatingMode.mode === "watch"
                  ? "border-amber-500/20 bg-amber-500/5 text-amber-100"
                  : "border-emerald-500/20 bg-emerald-500/5 text-emerald-100"
            }`}>
              <div className="mb-1 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{translateSignal(commandCenter.operatingMode.label)}</p>
                  <p className="mt-0.5 line-clamp-2 text-[11px] opacity-80">{translateSignal(commandCenter.operatingMode.summary)}</p>
                </div>
                <span className="shrink-0 rounded-full bg-zinc-950/60 px-2 py-0.5 text-[10px] font-semibold">
                  {commandCenter.operatingMode.score}/100
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 flex-wrap gap-1">
                  {commandCenter.operatingMode.reasons.slice(0, 4).map((reason) => (
                    <span key={reason} className="rounded bg-zinc-950/50 px-2 py-1 text-[10px] opacity-90">
                      {translateSignal(reason)}
                    </span>
                  ))}
                </div>
                <button
                  onClick={() => sendAgentMessage(commandCenter.operatingMode!.primaryAction.prompt)}
                  disabled={isLoading}
                  className="shrink-0 rounded bg-zinc-100 px-2 py-1 text-[10px] font-semibold text-zinc-950 active:bg-white disabled:opacity-50"
                >
                  {translateSignal(commandCenter.operatingMode.primaryAction.label)}
                </button>
              </div>
            </div>
          )}

          {commandCenter.deploymentHealth && commandCenter.deploymentHealth.configured && commandCenter.deploymentHealth.severity !== "ok" && (
            <div className={`mt-2 rounded-md border p-2 text-xs ${
              commandCenter.deploymentHealth.severity === "critical"
                ? "border-rose-500/20 bg-rose-500/5 text-rose-100"
                : "border-amber-500/20 bg-amber-500/5 text-amber-100"
            }`}>
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="font-semibold">Vercel 배포 확인 필요</p>
                <span className="rounded-full bg-zinc-950/60 px-2 py-0.5 text-[10px] font-semibold">
                  {translateStatus(commandCenter.deploymentHealth.severity)}
                </span>
              </div>
              <p className="leading-relaxed">{translateSignal(commandCenter.deploymentHealth.message)}</p>
              {commandCenter.deploymentHealth.latest?.uid && (
                <p className="mt-1 text-[11px] opacity-80">최근 배포 ID: {commandCenter.deploymentHealth.latest.uid}</p>
              )}
            </div>
          )}

          {monitorSnapshot && (
            <div className={`mt-2 rounded-md border p-2 text-xs ${
              monitorSnapshot.severity === "critical"
                ? "border-rose-500/20 bg-rose-500/5 text-rose-100"
                : monitorSnapshot.severity === "warn"
                  ? "border-amber-500/20 bg-amber-500/5 text-amber-100"
                  : "border-emerald-500/20 bg-emerald-500/5 text-emerald-100"
            }`}>
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="font-semibold">수동 운영 점검 결과</p>
                <span className="rounded-full bg-zinc-950/60 px-2 py-0.5 text-[10px] font-semibold">
                  {translateStatus(monitorSnapshot.severity)}
                </span>
              </div>
              <p className="leading-relaxed">
                {monitorSnapshot.alerts.length
                  ? monitorSnapshot.alerts.slice(0, 2).map((alert) => translateSignal(alert.message)).join(" / ")
                  : "운영 상태가 정상 범위입니다."}
              </p>
              {monitorSnapshot.recommendations[0] && (
                <p className="mt-1 text-[11px] opacity-80">{translateSignal(monitorSnapshot.recommendations[0])}</p>
              )}
              {monitorSnapshot.notification && (
                <p className="mt-1 text-[10px] opacity-70">
                  Discord: {monitorSnapshot.notification.sent ? "발송됨" : translateSignal(monitorSnapshot.notification.reason)}
                </p>
              )}
              {(monitorSnapshot.approvalGateSummary || monitorSnapshot.dailyCheckout || monitorSnapshot.nextActions?.[0]) && (
                <div className="mt-2 grid gap-2 md:grid-cols-3">
                  {monitorSnapshot.approvalGateSummary && (
                    <div className="rounded border border-zinc-800 bg-zinc-950/50 p-2">
                      <p className="text-[10px] font-semibold opacity-60">승인 차단</p>
                      <p className="mt-1 text-sm font-semibold">
                        차단 {monitorSnapshot.approvalGateSummary.blockCount}
                      </p>
                      <p className="text-[10px] opacity-70">
                        통과/검토 {monitorSnapshot.approvalGateSummary.passCount}/{monitorSnapshot.approvalGateSummary.reviewCount}
                      </p>
                    </div>
                  )}
                  {monitorSnapshot.dailyCheckout && (
                    <div className="rounded border border-zinc-800 bg-zinc-950/50 p-2">
                      <p className="text-[10px] font-semibold opacity-60">마감 점검</p>
                      <p className="mt-1 text-sm font-semibold">
                        {translateSignal(monitorSnapshot.dailyCheckout.label)} · {monitorSnapshot.dailyCheckout.score}/100
                      </p>
                      <p className="line-clamp-1 text-[10px] opacity-70">
                        {translateSignal(monitorSnapshot.dailyCheckout.openRisks?.[0]) || "남은 위험 신호 없음"}
                      </p>
                    </div>
                  )}
                  {monitorSnapshot.nextActions?.[0] && (
                    <div className="rounded border border-zinc-800 bg-zinc-950/50 p-2">
                      <p className="text-[10px] font-semibold opacity-60">추천 작업</p>
                      <p className="mt-1 line-clamp-1 text-sm font-semibold">
                        {translateSignal(monitorSnapshot.nextActions[0].title)}
                      </p>
                      <p className="text-[10px] opacity-70">
                        점수 {monitorSnapshot.nextActions[0].urgencyScore ?? "-"} · {translateStatus(monitorSnapshot.nextActions[0].priority)}
                      </p>
                    </div>
                  )}
                </div>
              )}
              <div className="mt-2 flex items-center justify-between gap-2">
                <p className="text-[10px] opacity-60">{formatDateTime(monitorSnapshot.generatedAt)} 점검</p>
                <div className="flex items-center gap-1.5">
                  {monitorSnapshot.dailyCheckout?.handoffPrompt && (
                    <button
                      onClick={() => stagePrompt(monitorSnapshot.dailyCheckout!.handoffPrompt)}
                      disabled={isLoading}
                      className="rounded border border-zinc-700 bg-zinc-950/60 px-2 py-1 text-[10px] font-semibold opacity-90 active:border-emerald-500 disabled:opacity-50"
                    >
                      마감 프롬프트
                    </button>
                  )}
                  <button
                    onClick={requestMonitorReportSave}
                    disabled={monitorReportLoading}
                    className="rounded border border-zinc-700 bg-zinc-950/60 px-2 py-1 text-[10px] font-semibold opacity-90 active:border-zinc-500 disabled:opacity-50"
                  >
                    {monitorReportLoading ? "요청 중" : "리포트 저장 요청"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {commandCenter.latestRun && (
            <div className="mt-2 rounded-md border border-zinc-800 bg-zinc-900 p-2">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-xs text-zinc-300">{translateSignal(commandCenter.latestRun.message)}</p>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  commandCenter.latestRun.status === "completed"
                    ? "bg-emerald-500/10 text-emerald-400"
                    : commandCenter.latestRun.status === "failed"
                      ? "bg-rose-500/10 text-rose-400"
                      : "bg-amber-500/10 text-amber-400"
                }`}>
                  {translateStatus(commandCenter.latestRun.status)}
                </span>
              </div>
            </div>
          )}

          {commandCenter.latestMonitorSnapshot?.item && (
            <div className={`mt-2 rounded-md border p-2 text-xs ${
              commandCenter.latestMonitorSnapshot.item.severity === "critical"
                ? "border-rose-500/20 bg-rose-500/5 text-rose-100"
                : commandCenter.latestMonitorSnapshot.item.severity === "warn"
                  ? "border-amber-500/20 bg-amber-500/5 text-amber-100"
                  : "border-emerald-500/20 bg-emerald-500/5 text-emerald-100"
            }`}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">최근 점검 결과</p>
                  <p className="mt-0.5 text-[10px] opacity-70">
                    {formatDateTime(commandCenter.latestMonitorSnapshot.item.runCompletedAt || commandCenter.latestMonitorSnapshot.item.generatedAt)}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-zinc-950/60 px-2 py-0.5 text-[10px] font-semibold">
                  {translateStatus(commandCenter.latestMonitorSnapshot.item.severity)}
                </span>
              </div>
              <div className="grid gap-2 md:grid-cols-3">
                <div className="rounded border border-zinc-800 bg-zinc-950/50 p-2">
                  <p className="text-[10px] font-semibold opacity-60">알림</p>
                  <p className="mt-1 text-sm font-semibold">{commandCenter.latestMonitorSnapshot.item.alerts?.length || 0}</p>
                  <p className="line-clamp-1 text-[10px] opacity-70">
                    {translateSignal(commandCenter.latestMonitorSnapshot.item.alerts?.[0]?.message) || "정상 범위"}
                  </p>
                </div>
                <div className="rounded border border-zinc-800 bg-zinc-950/50 p-2">
                  <p className="text-[10px] font-semibold opacity-60">승인 차단</p>
                  <p className="mt-1 text-sm font-semibold">{commandCenter.latestMonitorSnapshot.item.approvalGateSummary?.blockCount || 0}</p>
                  <p className="text-[10px] opacity-70">
                    통과/검토 {commandCenter.latestMonitorSnapshot.item.approvalGateSummary?.passCount || 0}/{commandCenter.latestMonitorSnapshot.item.approvalGateSummary?.reviewCount || 0}
                  </p>
                </div>
                <div className="rounded border border-zinc-800 bg-zinc-950/50 p-2">
                  <p className="text-[10px] font-semibold opacity-60">마감 점검</p>
                  <p className="mt-1 line-clamp-1 text-sm font-semibold">
                    {translateSignal(commandCenter.latestMonitorSnapshot.item.dailyCheckout?.label) || "미기록"}
                  </p>
                  <p className="text-[10px] opacity-70">
                    점수 {commandCenter.latestMonitorSnapshot.item.dailyCheckout?.score ?? "-"}
                  </p>
                </div>
              </div>
            </div>
          )}

          {commandCenter.monitorTrend && (
            <div className={`mt-2 rounded-md border p-2 text-xs ${
              commandCenter.monitorTrend.direction === "worsening"
                ? "border-rose-500/20 bg-rose-500/5 text-rose-100"
                : commandCenter.monitorTrend.direction === "improving"
                  ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-100"
                  : commandCenter.monitorTrend.direction === "stable"
                    ? "border-sky-500/20 bg-sky-500/5 text-sky-100"
                    : "border-zinc-800 bg-zinc-950/60 text-zinc-300"
            }`}>
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">점검 추세</p>
                  <p className="mt-0.5 line-clamp-2 text-[11px] opacity-80">{translateSignal(commandCenter.monitorTrend.summary)}</p>
                </div>
                <span className="shrink-0 rounded-full bg-zinc-950/60 px-2 py-0.5 text-[10px] font-semibold">
                  {translateSignal(commandCenter.monitorTrend.label)}
                </span>
              </div>
              <div className="grid gap-1.5 md:grid-cols-4">
                <div className="rounded border border-zinc-800 bg-zinc-950/50 p-2">
                  <p className="text-[10px] font-semibold opacity-60">점검 횟수</p>
                  <p className="mt-1 text-sm font-semibold">{commandCenter.monitorTrend.sampleSize}</p>
                </div>
                <div className="rounded border border-zinc-800 bg-zinc-950/50 p-2">
                  <p className="text-[10px] font-semibold opacity-60">알림 변화</p>
                  <p className="mt-1 text-sm font-semibold">{commandCenter.monitorTrend.deltas.alertCount > 0 ? "+" : ""}{commandCenter.monitorTrend.deltas.alertCount}</p>
                </div>
                <div className="rounded border border-zinc-800 bg-zinc-950/50 p-2">
                  <p className="text-[10px] font-semibold opacity-60">승인 차단 변화</p>
                  <p className="mt-1 text-sm font-semibold">{commandCenter.monitorTrend.deltas.gateBlockCount > 0 ? "+" : ""}{commandCenter.monitorTrend.deltas.gateBlockCount}</p>
                </div>
                <div className="rounded border border-zinc-800 bg-zinc-950/50 p-2">
                  <p className="text-[10px] font-semibold opacity-60">마감 점수 변화</p>
                  <p className="mt-1 text-sm font-semibold">{commandCenter.monitorTrend.deltas.checkoutScore > 0 ? "+" : ""}{commandCenter.monitorTrend.deltas.checkoutScore}</p>
                </div>
              </div>
              <p className="mt-2 line-clamp-2 text-[10px] leading-relaxed opacity-75">{translateSignal(commandCenter.monitorTrend.recommendation)}</p>
            </div>
          )}

          {commandCenter.dailyCheckout && (
            <div className={`mt-2 rounded-md border p-2 ${
              commandCenter.dailyCheckout.status === "blocked"
                ? "border-rose-500/20 bg-rose-500/5"
                : commandCenter.dailyCheckout.status === "attention"
                  ? "border-amber-500/20 bg-amber-500/5"
                  : "border-emerald-500/20 bg-emerald-500/5"
            }`}>
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-zinc-100">오늘 마감 점검 · {translateSignal(commandCenter.dailyCheckout.label)}</p>
                  <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-zinc-400">{translateSignal(commandCenter.dailyCheckout.summary)}</p>
                </div>
                <span className="shrink-0 rounded-full bg-zinc-950/60 px-2 py-0.5 text-[10px] font-semibold text-zinc-100">
                  {commandCenter.dailyCheckout.score}/100
                </span>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <div className="rounded border border-zinc-800 bg-zinc-950/60 p-2">
                  <p className="mb-1 text-[10px] font-semibold text-zinc-500">남은 위험</p>
                  <ul className="space-y-1 text-[10px] leading-relaxed text-zinc-400">
                    {commandCenter.dailyCheckout.openRisks.slice(0, 3).map((risk) => (
                      <li key={risk} className="line-clamp-1">{translateSignal(risk)}</li>
                    ))}
                  </ul>
                </div>
                <div className="rounded border border-zinc-800 bg-zinc-950/60 p-2">
                  <p className="mb-1 text-[10px] font-semibold text-zinc-500">내일 먼저 볼 것</p>
                  <ul className="space-y-1 text-[10px] leading-relaxed text-zinc-400">
                    {commandCenter.dailyCheckout.tomorrowFocus.slice(0, 3).map((focus) => (
                      <li key={focus} className="line-clamp-1">{translateSignal(focus)}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-end gap-1.5">
                <button
                  onClick={() => stagePrompt(commandCenter.dailyCheckout!.handoffPrompt)}
                  disabled={isLoading}
                  className="rounded border border-zinc-800 px-2 py-1 text-[10px] font-semibold text-zinc-400 active:border-emerald-500 active:text-emerald-300 disabled:opacity-50"
                >
                  입력에 넣기
                </button>
                <button
                  onClick={() => sendAgentMessage(commandCenter.dailyCheckout!.handoffPrompt)}
                  disabled={isLoading}
                  className="rounded bg-emerald-500 px-2 py-1 text-[10px] font-semibold text-zinc-950 active:bg-emerald-400 disabled:opacity-50"
                >
                  마감 액션 실행
                </button>
              </div>
            </div>
          )}

          {commandCenter.todayActionBoard && (
            <div className={`mt-2 rounded-md border p-2 ${
              commandCenter.todayActionBoard.status === "blocked"
                ? "border-rose-500/20 bg-rose-500/5"
                : commandCenter.todayActionBoard.status === "attention"
                  ? "border-amber-500/20 bg-amber-500/5"
                  : "border-emerald-500/20 bg-emerald-500/5"
            }`}>
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-zinc-100">오늘 할 일 보드</p>
                  <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-zinc-400">{translateSignal(commandCenter.todayActionBoard.summary)}</p>
                </div>
                <button
                  onClick={() => sendAgentMessage(commandCenter.todayActionBoard!.primaryPrompt)}
                  disabled={isLoading}
                  className="shrink-0 rounded bg-zinc-100 px-2 py-1 text-[10px] font-semibold text-zinc-950 active:bg-white disabled:opacity-50"
                >
                  첫 액션
                </button>
              </div>
              <div className="grid gap-2 md:grid-cols-4">
                {([
                  ["지금 처리", commandCenter.todayActionBoard.lanes.doNow, "rose"],
                  ["검토", commandCenter.todayActionBoard.lanes.review, "amber"],
                  ["관찰", commandCenter.todayActionBoard.lanes.watch, "sky"],
                  ["기록", commandCenter.todayActionBoard.lanes.save, "emerald"]
                ] as const).map(([label, items, tone]) => (
                  <div key={label} className="rounded border border-zinc-800 bg-zinc-950/60 p-2">
                    <div className="mb-1 flex items-center justify-between gap-1">
                      <p className={`text-[10px] font-semibold uppercase tracking-wide ${
                        tone === "rose" ? "text-rose-300" : tone === "amber" ? "text-amber-300" : tone === "sky" ? "text-sky-300" : "text-emerald-300"
                      }`}>{label}</p>
                      <span className="rounded-full bg-zinc-900 px-1.5 py-0.5 text-[10px] text-zinc-500">{items.length}</span>
                    </div>
                    {items.length ? (
                      <div className="space-y-1.5">
                        {items.slice(0, 2).map((item) => (
                          <button
                            key={item.id}
                            onClick={() => stagePrompt(item.prompt)}
                            disabled={isLoading}
                            className="w-full rounded border border-zinc-800 bg-zinc-900/80 p-1.5 text-left active:border-emerald-500 disabled:opacity-50"
                          >
                            <div className="mb-0.5 flex items-center justify-between gap-1">
                              <p className="line-clamp-1 text-[11px] font-semibold text-zinc-100">{translateSignal(item.title)}</p>
                              <span className="shrink-0 text-[10px] text-zinc-500">{item.score}</span>
                            </div>
                            <p className="line-clamp-2 text-[10px] leading-relaxed text-zinc-500">{translateSignal(item.reason)}</p>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="rounded bg-zinc-900/70 px-2 py-2 text-[10px] text-zinc-600">대기 항목 없음</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {commandCenter.nextActions && commandCenter.nextActions.length > 0 && (
            <div className="mt-2 rounded-md border border-sky-500/20 bg-sky-500/5 p-2">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-sky-100">추천 작업</p>
                <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-300">
                  {commandCenter.nextActions.length}개
                </span>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {commandCenter.nextActions.map((action) => (
                  <article
                    key={action.id}
                    className="rounded-md border border-sky-500/20 bg-zinc-950/70 p-2"
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="truncate text-xs font-semibold text-sky-100">{translateSignal(action.title)}</p>
                      <div className="flex shrink-0 items-center gap-1">
                        {typeof action.urgencyScore === "number" && (
                          <span className="rounded-full bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-sky-300">
                            {action.urgencyScore}
                          </span>
                        )}
                        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                          action.priority === "high"
                            ? "bg-rose-500/10 text-rose-300"
                            : action.priority === "medium"
                              ? "bg-amber-500/10 text-amber-300"
                              : "bg-emerald-500/10 text-emerald-300"
                        }`}>
                          {translateStatus(action.priority)}
                        </span>
                      </div>
                    </div>
                    {action.category && (
                      <p className="mb-1 text-[10px] font-semibold text-sky-300/60">{translateSignal(action.category)}</p>
                    )}
                    <p className="line-clamp-2 text-[11px] leading-relaxed text-sky-100/70">{translateSignal(action.reason)}</p>
                    <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-zinc-500">{translateSignal(action.expectedOutcome)}</p>
                    {(action.checklist?.length || 0) > 0 && (
                      <ul className="mt-2 space-y-1 text-[10px] leading-relaxed text-zinc-500">
                        {action.checklist?.slice(0, 3).map((item) => (
                          <li key={item} className="flex gap-1.5">
                            <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-sky-400/60" />
                            <span className="line-clamp-1">{translateSignal(item)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="mt-2 flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => stagePrompt(action.prompt)}
                        disabled={isLoading}
                        className="rounded border border-zinc-800 px-2 py-1 text-[10px] font-semibold text-zinc-400 active:border-sky-500 active:text-sky-300 disabled:opacity-50"
                      >
                        입력에 넣기
                      </button>
                      <button
                        onClick={() => sendAgentMessage(action.prompt)}
                        disabled={isLoading}
                        className="rounded bg-sky-500 px-2 py-1 text-[10px] font-semibold text-zinc-950 active:bg-sky-400 disabled:opacity-50"
                      >
                        실행
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}

          {commandCenter.improvementBacklog && (
            <div className={`mt-2 rounded-md border p-2 ${
              commandCenter.improvementBacklog.label === "excellent"
                ? "border-emerald-500/20 bg-emerald-500/5"
                : commandCenter.improvementBacklog.label === "stable"
                  ? "border-sky-500/20 bg-sky-500/5"
                  : commandCenter.improvementBacklog.label === "needs_attention"
                    ? "border-amber-500/20 bg-amber-500/5"
                    : "border-rose-500/20 bg-rose-500/5"
            }`}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-zinc-100">개선할 일 목록</p>
                  <p className="mt-0.5 line-clamp-2 text-[11px] text-zinc-400">{translateSignal(commandCenter.improvementBacklog.summary)}</p>
                </div>
                <span className="shrink-0 rounded-full bg-zinc-950/60 px-2 py-0.5 text-[10px] font-semibold text-zinc-200">
                  {commandCenter.improvementBacklog.score}/100
                </span>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {commandCenter.improvementBacklog.items.slice(0, 4).map((item) => (
                  <article key={item.id} className="rounded-md border border-zinc-800 bg-zinc-950/70 p-2">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="truncate text-xs font-semibold text-zinc-100">{translateSignal(item.title)}</p>
                      <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                        item.priority === "high"
                          ? "bg-rose-500/10 text-rose-300"
                          : item.priority === "medium"
                            ? "bg-amber-500/10 text-amber-300"
                            : "bg-emerald-500/10 text-emerald-300"
                      }`}>
                        {translateStatus(item.priority)} · {translateSignal(item.owner)}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-[11px] leading-relaxed text-zinc-400">{translateSignal(item.reason)}</p>
                    <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-zinc-500">{translateSignal(item.action)}</p>
                  </article>
                ))}
              </div>
            </div>
          )}

          {commandCenter.ownerBrief && (
            <div className={`mt-2 rounded-md border p-2 ${
              commandCenter.ownerBrief.status === "calm"
                ? "border-emerald-500/20 bg-emerald-500/5"
                : commandCenter.ownerBrief.status === "watch"
                  ? "border-amber-500/20 bg-amber-500/5"
                  : "border-rose-500/20 bg-rose-500/5"
            }`}>
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-zinc-100">30초 운영자 요약</p>
                  <p className="mt-0.5 line-clamp-2 text-[11px] font-semibold text-zinc-200">{translateSignal(commandCenter.ownerBrief.headline)}</p>
                  <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-zinc-500">{translateSignal(commandCenter.ownerBrief.summary)}</p>
                </div>
                <span className="shrink-0 rounded-full bg-zinc-950/60 px-2 py-0.5 text-[10px] font-semibold text-zinc-300">
                  {commandCenter.ownerBrief.confidence}%
                </span>
              </div>
              <div className="grid gap-2 md:grid-cols-[1.1fr_0.9fr]">
                <button
                  onClick={() => stagePrompt(commandCenter.ownerBrief?.doNow.prompt || "오늘 운영 브리핑 해줘")}
                  className="rounded-md border border-sky-500/30 bg-sky-500/10 p-2 text-left active:border-sky-400"
                >
                  <p className="text-[11px] font-semibold text-sky-200">지금 할 일</p>
                  <p className="mt-0.5 truncate text-xs font-semibold text-zinc-100">{translateSignal(commandCenter.ownerBrief.doNow.title)}</p>
                  <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-zinc-500">{translateSignal(commandCenter.ownerBrief.doNow.reason)}</p>
                </button>
                <div className="rounded-md border border-zinc-800 bg-zinc-950/60 p-2">
                  <p className="mb-1 text-[11px] font-semibold text-zinc-200">직접 확인</p>
                  {commandCenter.ownerBrief.needsOwnerReview.length ? (
                    <div className="space-y-1">
                      {commandCenter.ownerBrief.needsOwnerReview.slice(0, 2).map((item) => (
                        <p key={`${item.title}-${item.location}`} className="line-clamp-1 text-[10px] text-zinc-500">
                          <span className="text-zinc-300">{translateSignal(item.title)}</span> · {translateSignal(item.location)}
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[10px] text-emerald-300">즉시 직접 볼 항목 없음</p>
                  )}
                </div>
              </div>
              {(commandCenter.ownerBrief.delegateToAgent.length || 0) > 0 && (
                <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
                  {commandCenter.ownerBrief.delegateToAgent.slice(0, 3).map((item) => (
                    <button
                      key={item.prompt}
                      onClick={() => stagePrompt(item.prompt)}
                      className="shrink-0 rounded border border-zinc-800 bg-zinc-950/70 px-2 py-1 text-left text-[10px] text-zinc-400 active:border-sky-500 active:text-sky-300"
                    >
                      <span className="block max-w-44 truncate font-semibold text-zinc-200">{translateSignal(item.title)}</span>
                      <span className="block max-w-44 truncate">{translateSignal(item.reason)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {commandCenter.automationContracts && (
            <div className="mt-2 rounded-md border border-zinc-800 bg-zinc-950/70 p-2">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-zinc-100">자동화 기준표</p>
                  <p className="mt-0.5 line-clamp-2 text-[11px] text-zinc-400">{translateSignal(commandCenter.automationContracts.summary)}</p>
                </div>
                <span className="shrink-0 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                  무료 플랜
                </span>
              </div>
              <div className="grid gap-1.5 md:grid-cols-2 xl:grid-cols-5">
                {commandCenter.automationContracts.contracts.slice(0, 5).map((contract) => (
                  <button
                    key={contract.id}
                    onClick={() => contract.prompt ? stagePrompt(contract.prompt) : undefined}
                    className="rounded-md border border-zinc-800 bg-zinc-950/70 p-2 text-left active:border-sky-500"
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="truncate text-[11px] font-semibold text-zinc-100">{translateSignal(contract.title)}</p>
                      <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                        contract.risk === "safe"
                          ? "bg-emerald-500/10 text-emerald-300"
                          : contract.risk === "approval_required"
                            ? "bg-amber-500/10 text-amber-300"
                            : "bg-zinc-800 text-zinc-300"
                      }`}>
                        {contract.risk === "safe" ? "안전" : contract.risk === "approval_required" ? "승인 필요" : "수동"}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-[10px] leading-relaxed text-zinc-500">{translateSignal(contract.whatRuns)}</p>
                    <p className="mt-1 truncate text-[10px] text-sky-300">{translateSignal(contract.whereToCheck)}</p>
                  </button>
                ))}
              </div>
              <div className="mt-2 grid gap-1.5 md:grid-cols-2">
                {commandCenter.automationContracts.guardrails.slice(0, 4).map((guardrail) => (
                  <p key={guardrail} className="rounded border border-zinc-800 bg-zinc-950/50 px-2 py-1 text-[10px] leading-relaxed text-zinc-500">
                    {translateSignal(guardrail)}
                  </p>
                ))}
              </div>
            </div>
          )}

          {commandCenter.operatingSop && (
            <div className={`mt-2 rounded-md border p-2 ${
              commandCenter.operatingSop.status === "blocked"
                ? "border-rose-500/20 bg-rose-500/5"
                : commandCenter.operatingSop.status === "incident"
                  ? "border-amber-500/20 bg-amber-500/5"
                  : commandCenter.operatingSop.status === "watch"
                    ? "border-sky-500/20 bg-sky-500/5"
                    : "border-emerald-500/20 bg-emerald-500/5"
            }`}>
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-zinc-100">운영 절차</p>
                  <p className="mt-0.5 line-clamp-1 text-[11px] font-semibold text-zinc-200">{translateSignal(commandCenter.operatingSop.title)}</p>
                  <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-zinc-500">{translateSignal(commandCenter.operatingSop.summary)}</p>
                </div>
                <button
                  onClick={() => sendAgentMessage(commandCenter.operatingSop!.primaryPrompt)}
                  disabled={isLoading}
                  className="shrink-0 rounded bg-zinc-100 px-2 py-1 text-[10px] font-semibold text-zinc-950 active:bg-white disabled:opacity-50"
                >
                  첫 SOP
                </button>
              </div>
              <div className="grid gap-2 md:grid-cols-3">
                {commandCenter.operatingSop.procedures.slice(0, 3).map((procedure) => (
                  <article key={procedure.id} className="rounded-md border border-zinc-800 bg-zinc-950/70 p-2">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="truncate text-[11px] font-semibold text-zinc-100">{translateSignal(procedure.title)}</p>
                      <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                        procedure.severity === "critical"
                          ? "bg-rose-500/10 text-rose-300"
                          : procedure.severity === "warn"
                            ? "bg-amber-500/10 text-amber-300"
                            : "bg-emerald-500/10 text-emerald-300"
                      }`}>
                        {procedure.risk === "approval_required" ? "승인" : procedure.risk === "manual_check" ? "수동" : "조회"}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-[10px] leading-relaxed text-zinc-500">{translateSignal(procedure.why)}</p>
                    <div className="mt-2 space-y-1">
                      {procedure.steps.slice(0, 2).map((step) => (
                        <p key={step.id} className="line-clamp-1 rounded border border-zinc-800 bg-zinc-900/70 px-1.5 py-1 text-[10px] text-zinc-400">
                          {translateSignal(step.label)} · {translateSignal(step.owner)}
                        </p>
                      ))}
                    </div>
                    <div className="mt-2 flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => stagePrompt(procedure.nextPrompt)}
                        disabled={isLoading}
                        className="rounded border border-zinc-800 px-2 py-1 text-[10px] font-semibold text-zinc-400 active:border-sky-500 active:text-sky-300 disabled:opacity-50"
                      >
                        입력
                      </button>
                      <button
                        onClick={() => sendAgentMessage(procedure.nextPrompt)}
                        disabled={isLoading}
                        className="rounded bg-sky-500 px-2 py-1 text-[10px] font-semibold text-zinc-950 active:bg-sky-400 disabled:opacity-50"
                      >
                        실행
                      </button>
                    </div>
                  </article>
                ))}
              </div>
              <div className="mt-2 grid gap-1.5 md:grid-cols-3">
                {commandCenter.operatingSop.guardrails.slice(0, 3).map((guardrail) => (
                  <p key={guardrail} className="rounded border border-zinc-800 bg-zinc-950/50 px-2 py-1 text-[10px] leading-relaxed text-zinc-500">
                    {translateSignal(guardrail)}
                  </p>
                ))}
              </div>
            </div>
          )}

          {commandCenter.riskRadar && (
            <div className={`mt-2 rounded-md border p-2 ${
              commandCenter.riskRadar.status === "act"
                ? "border-rose-500/20 bg-rose-500/5"
                : commandCenter.riskRadar.status === "watch"
                  ? "border-sky-500/20 bg-sky-500/5"
                  : "border-emerald-500/20 bg-emerald-500/5"
            }`}>
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-zinc-100">위험 예측</p>
                  <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-zinc-400">{translateSignal(commandCenter.riskRadar.summary)}</p>
                </div>
                <button
                  onClick={() => sendAgentMessage(commandCenter.riskRadar!.primaryPrompt)}
                  disabled={isLoading}
                  className="shrink-0 rounded bg-zinc-100 px-2 py-1 text-[10px] font-semibold text-zinc-950 active:bg-white disabled:opacity-50"
                >
                  예방 액션
                </button>
              </div>
              <div className="grid gap-2 md:grid-cols-3">
                {commandCenter.riskRadar.items.slice(0, 3).map((risk) => (
                  <article key={risk.id} className="rounded-md border border-zinc-800 bg-zinc-950/70 p-2">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="truncate text-[11px] font-semibold text-zinc-100">{translateSignal(risk.title)}</p>
                      <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                        risk.severity === "critical"
                          ? "bg-rose-500/10 text-rose-300"
                          : risk.severity === "high"
                            ? "bg-amber-500/10 text-amber-300"
                            : risk.severity === "medium"
                              ? "bg-sky-500/10 text-sky-300"
                              : "bg-emerald-500/10 text-emerald-300"
                      }`}>
                        {risk.score}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-[10px] leading-relaxed text-zinc-500">{translateSignal(risk.why)}</p>
                    <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-zinc-400">{translateSignal(risk.prevention)}</p>
                    <div className="mt-2 flex items-center justify-between gap-1.5">
                      <span className="truncate rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] text-zinc-500">
                        {translateSignal(risk.category)} · {translateSignal(risk.horizon)}
                      </span>
                      <button
                        onClick={() => stagePrompt(risk.prompt)}
                        disabled={isLoading}
                        className="rounded border border-zinc-800 px-2 py-1 text-[10px] font-semibold text-zinc-400 active:border-sky-500 active:text-sky-300 disabled:opacity-50"
                      >
                        입력
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}

          {commandCenter.decisionTrace && (
            <div className={`mt-2 rounded-md border p-2 ${
              commandCenter.decisionTrace.confidence === "high"
                ? "border-emerald-500/20 bg-emerald-500/5"
                : commandCenter.decisionTrace.confidence === "medium"
                  ? "border-sky-500/20 bg-sky-500/5"
                  : "border-amber-500/20 bg-amber-500/5"
            }`}>
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-zinc-100">판단 근거</p>
                  <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-zinc-400">{translateSignal(commandCenter.decisionTrace.summary)}</p>
                </div>
                <span className="shrink-0 rounded-full bg-zinc-950/60 px-2 py-0.5 text-[10px] font-semibold text-zinc-200">
                  {translateStatus(commandCenter.decisionTrace.confidence)}
                </span>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {commandCenter.decisionTrace.decisions.slice(0, 2).map((decision) => (
                  <button
                    key={decision.id}
                    onClick={() => stagePrompt(decision.prompt)}
                    disabled={isLoading}
                    className="rounded-md border border-zinc-800 bg-zinc-950/70 p-2 text-left active:border-sky-500 disabled:opacity-50"
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="truncate text-[11px] font-semibold text-zinc-100">{translateSignal(decision.title)}</p>
                      <span className="shrink-0 rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] text-zinc-500">{translateSignal(decision.nextCheck)}</span>
                    </div>
                    <p className="line-clamp-2 text-[10px] leading-relaxed text-zinc-500">{translateSignal(decision.conclusion)}</p>
                    <p className="mt-1 truncate text-[10px] text-sky-300">근거: {decision.basedOn.map((item) => translateSignal(item)).join(", ")}</p>
                  </button>
                ))}
              </div>
              <div className="mt-2 grid gap-1.5 md:grid-cols-2">
                <div className="rounded border border-zinc-800 bg-zinc-950/60 p-2">
                  <p className="mb-1 text-[10px] font-semibold text-zinc-500">핵심 관찰</p>
                  {commandCenter.decisionTrace.observations.slice(0, 3).map((observation) => (
                    <p key={observation.id} className="truncate text-[10px] leading-relaxed text-zinc-400">
                    {translateSignal(observation.label)}: {translateSignal(String(observation.value))}
                    </p>
                  ))}
                </div>
                <div className="rounded border border-zinc-800 bg-zinc-950/60 p-2">
                  <p className="mb-1 text-[10px] font-semibold text-zinc-500">아직 모르는 부분</p>
                  {commandCenter.decisionTrace.blindSpots.slice(0, 3).map((blindSpot) => (
                    <p key={blindSpot} className="line-clamp-1 text-[10px] leading-relaxed text-zinc-400">{translateSignal(blindSpot)}</p>
                  ))}
                </div>
              </div>
            </div>
          )}

          {commandCenter.safetyAudit && (
            <div className={`mt-2 rounded-md border p-2 ${
              commandCenter.safetyAudit.status === "block"
                ? "border-rose-500/20 bg-rose-500/5"
                : commandCenter.safetyAudit.status === "watch"
                  ? "border-amber-500/20 bg-amber-500/5"
                  : "border-emerald-500/20 bg-emerald-500/5"
            }`}>
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-zinc-100">안전 점검</p>
                  <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-zinc-400">{translateSignal(commandCenter.safetyAudit.summary)}</p>
                </div>
                <button
                  onClick={() => sendAgentMessage(commandCenter.safetyAudit!.primaryPrompt)}
                  disabled={isLoading}
                  className="shrink-0 rounded bg-zinc-100 px-2 py-1 text-[10px] font-semibold text-zinc-950 active:bg-white disabled:opacity-50"
                >
                  안전 점검
                </button>
              </div>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                {commandCenter.safetyAudit.invariants
                  .filter((item) => item.status !== "ok")
                  .concat(commandCenter.safetyAudit.invariants.filter((item) => item.status === "ok"))
                  .slice(0, 4)
                  .map((item) => (
                    <button
                      key={item.id}
                      onClick={() => stagePrompt(item.action)}
                      disabled={isLoading}
                      className="rounded-md border border-zinc-800 bg-zinc-950/70 p-2 text-left active:border-sky-500 disabled:opacity-50"
                    >
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <p className="truncate text-[11px] font-semibold text-zinc-100">{translateSignal(item.label)}</p>
                        <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                          item.status === "critical"
                            ? "bg-rose-500/10 text-rose-300"
                            : item.status === "warn"
                              ? "bg-amber-500/10 text-amber-300"
                              : "bg-emerald-500/10 text-emerald-300"
                        }`}>
                          {translateStatus(item.status)}
                        </span>
                      </div>
                      <p className="line-clamp-2 text-[10px] leading-relaxed text-zinc-500">{translateSignal(item.evidence)}</p>
                      <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-zinc-400">{translateSignal(item.risk)}</p>
                    </button>
                  ))}
              </div>
              {(commandCenter.safetyAudit.requiredFixes.length || commandCenter.safetyAudit.recommendedChecks.length) > 0 && (
                <div className="mt-2 rounded border border-zinc-800 bg-zinc-950/60 p-2">
                  <p className="mb-1 text-[10px] font-semibold text-zinc-500">다음 안전 확인</p>
                  {(commandCenter.safetyAudit.requiredFixes.length
                    ? commandCenter.safetyAudit.requiredFixes
                    : commandCenter.safetyAudit.recommendedChecks
                  ).slice(0, 3).map((check) => (
                    <p key={check} className="line-clamp-1 text-[10px] leading-relaxed text-zinc-400">{translateSignal(check)}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {commandCenter.approvalAdvisor && (
            <div className={`mt-2 rounded-md border p-2 ${
              commandCenter.approvalAdvisor.status === "blocked"
                ? "border-rose-500/20 bg-rose-500/5"
                : commandCenter.approvalAdvisor.status === "review"
                  ? "border-amber-500/20 bg-amber-500/5"
                  : "border-emerald-500/20 bg-emerald-500/5"
            }`}>
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-zinc-100">승인 판단 도우미</p>
                  <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-zinc-400">{translateSignal(commandCenter.approvalAdvisor.summary)}</p>
                </div>
                <button
                  onClick={() => sendAgentMessage(commandCenter.approvalAdvisor!.primaryPrompt)}
                  disabled={isLoading}
                  className="shrink-0 rounded bg-zinc-100 px-2 py-1 text-[10px] font-semibold text-zinc-950 active:bg-white disabled:opacity-50"
                >
                  승인 판단
                </button>
              </div>
              <div className="mb-2 grid grid-cols-3 gap-1.5">
                {([
                  ["거절", commandCenter.approvalAdvisor.counts.reject],
                  ["보류", commandCenter.approvalAdvisor.counts.defer],
                  ["승인", commandCenter.approvalAdvisor.counts.approve]
                ] as const).map(([label, value]) => (
                  <div key={label} className="rounded border border-zinc-800 bg-zinc-950/60 p-2">
                    <p className="text-[10px] font-semibold text-zinc-500">{label}</p>
                    <p className="mt-1 text-sm font-semibold text-zinc-100">{value}</p>
                  </div>
                ))}
              </div>
              <div className="grid gap-2 md:grid-cols-3">
                {commandCenter.approvalAdvisor.items.slice(0, 3).map((item) => (
                  <button
                    key={item.id}
                    onClick={() => stagePrompt(item.prompt)}
                    disabled={isLoading}
                    className="rounded-md border border-zinc-800 bg-zinc-950/70 p-2 text-left active:border-sky-500 disabled:opacity-50"
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="truncate text-[11px] font-semibold text-zinc-100">{translateSignal(item.title)}</p>
                      <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                        item.decision === "reject"
                          ? "bg-rose-500/10 text-rose-300"
                          : item.decision === "defer"
                            ? "bg-amber-500/10 text-amber-300"
                            : "bg-emerald-500/10 text-emerald-300"
                      }`}>
                        {translateStatus(item.decision)}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-[10px] leading-relaxed text-zinc-500">{translateSignal(item.reason)}</p>
                    <p className="mt-1 truncate text-[10px] text-zinc-400">
                      {translateSignal(item.actionType)} · {translateStatus(item.priority)} · {translateStatus(item.confidence)}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {commandCenter.missionControl && (
            <div className={`mt-2 rounded-md border p-2 ${
              commandCenter.missionControl.status === "urgent"
                ? "border-rose-500/20 bg-rose-500/5"
                : commandCenter.missionControl.status === "focus"
                  ? "border-sky-500/20 bg-sky-500/5"
                  : "border-emerald-500/20 bg-emerald-500/5"
            }`}>
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-zinc-100">실행 순서 정리</p>
                  <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-zinc-400">{translateSignal(commandCenter.missionControl.summary)}</p>
                </div>
                <button
                  onClick={() => sendAgentMessage(commandCenter.missionControl!.firstCommand)}
                  disabled={isLoading}
                  className="shrink-0 rounded bg-zinc-100 px-2 py-1 text-[10px] font-semibold text-zinc-950 active:bg-white disabled:opacity-50"
                >
                  첫 명령
                </button>
              </div>
              <div className="mb-2 grid grid-cols-5 gap-1">
                {(["stabilize", "decide", "delegate", "verify", "record"] as const).map((phase) => (
                  <div key={phase} className="rounded border border-zinc-800 bg-zinc-950/60 p-1.5">
                    <p className="truncate text-[9px] font-semibold text-zinc-500">{translatePhase(phase)}</p>
                    <p className="mt-0.5 text-xs font-semibold text-zinc-100">{commandCenter.missionControl!.phases[phase]}</p>
                  </div>
                ))}
              </div>
              <div className="grid gap-2 md:grid-cols-3">
                {commandCenter.missionControl.items.slice(0, 3).map((item) => (
                  <button
                    key={item.id}
                    onClick={() => stagePrompt(item.command)}
                    disabled={isLoading}
                    className="rounded-md border border-zinc-800 bg-zinc-950/70 p-2 text-left active:border-sky-500 disabled:opacity-50"
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="truncate text-[11px] font-semibold text-zinc-100">{translateSignal(item.title)}</p>
                      <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                        item.priority === "high"
                          ? "bg-rose-500/10 text-rose-300"
                          : item.priority === "medium"
                            ? "bg-sky-500/10 text-sky-300"
                            : "bg-emerald-500/10 text-emerald-300"
                      }`}>
                        {translatePhase(item.phase)}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-[10px] leading-relaxed text-zinc-500">{translateSignal(item.reason)}</p>
                    <p className="mt-1 truncate text-[10px] text-zinc-400">{translateSignal(item.owner)} · {translateSignal(item.source)}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {commandCenter.ownerInbox && (
            <div className={`mt-2 rounded-md border p-2 ${
              commandCenter.ownerInbox.status === "attention"
                ? "border-amber-500/20 bg-amber-500/5"
                : commandCenter.ownerInbox.status === "review"
                  ? "border-sky-500/20 bg-sky-500/5"
                  : "border-emerald-500/20 bg-emerald-500/5"
            }`}>
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-zinc-100">내가 볼 일 / 맡길 일</p>
                  <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-zinc-400">{translateSignal(commandCenter.ownerInbox.summary)}</p>
                </div>
                <button
                  onClick={() => sendAgentMessage(commandCenter.ownerInbox!.primaryAction)}
                  disabled={isLoading}
                  className="shrink-0 rounded bg-zinc-100 px-2 py-1 text-[10px] font-semibold text-zinc-950 active:bg-white disabled:opacity-50"
                >
                  1순위
                </button>
              </div>
              <div className="mb-2 grid grid-cols-4 gap-1.5">
                {(["decide", "approve", "delegate", "watch"] as const).map((lane) => (
                  <div key={lane} className="rounded border border-zinc-800 bg-zinc-950/60 p-2">
                    <p className="text-[10px] font-semibold text-zinc-500">{translatePhase(lane)}</p>
                    <p className="mt-1 text-sm font-semibold text-zinc-100">{commandCenter.ownerInbox!.counts[lane]}</p>
                  </div>
                ))}
              </div>
              <div className="grid gap-2 md:grid-cols-4">
                {(["decide", "approve", "delegate", "watch"] as const).map((lane) => {
                  const item = commandCenter.ownerInbox!.lanes[lane][0];
                  if (!item) {
                    return (
                      <div key={lane} className="rounded-md border border-zinc-800 bg-zinc-950/40 p-2">
                        <p className="text-[10px] font-semibold text-zinc-600">{translatePhase(lane)}</p>
                        <p className="mt-2 text-[10px] text-zinc-600">없음</p>
                      </div>
                    );
                  }
                  return (
                    <button
                      key={lane}
                      onClick={() => stagePrompt(item.action)}
                      disabled={isLoading}
                      className="rounded-md border border-zinc-800 bg-zinc-950/70 p-2 text-left active:border-sky-500 disabled:opacity-50"
                    >
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <p className="truncate text-[11px] font-semibold text-zinc-100">{translateSignal(item.title)}</p>
                        <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                          item.priority === "high"
                            ? "bg-rose-500/10 text-rose-300"
                            : item.priority === "medium"
                              ? "bg-sky-500/10 text-sky-300"
                              : "bg-emerald-500/10 text-emerald-300"
                        }`}>
                          {translatePhase(lane)}
                        </span>
                      </div>
                      <p className="line-clamp-2 text-[10px] leading-relaxed text-zinc-500">{translateSignal(item.reason)}</p>
                      <p className="mt-1 truncate text-[10px] text-zinc-400">{translateSignal(item.owner)} · {item.location}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {commandCenter.outcomeReview && (
            <div className={`mt-2 rounded-md border p-2 ${
              commandCenter.outcomeReview.status === "follow_up"
                ? "border-rose-500/20 bg-rose-500/5"
                : commandCenter.outcomeReview.status === "watch"
                  ? "border-amber-500/20 bg-amber-500/5"
                  : "border-emerald-500/20 bg-emerald-500/5"
            }`}>
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-zinc-100">조치 결과 확인</p>
                  <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-zinc-400">{translateSignal(commandCenter.outcomeReview.summary)}</p>
                </div>
                <button
                  onClick={() => sendAgentMessage(commandCenter.outcomeReview!.primaryPrompt)}
                  disabled={isLoading}
                  className="shrink-0 rounded bg-zinc-100 px-2 py-1 text-[10px] font-semibold text-zinc-950 active:bg-white disabled:opacity-50"
                >
                  후속 확인
                </button>
              </div>
              <div className="mb-2 flex items-center gap-2">
                <div className="rounded border border-zinc-800 bg-zinc-950/60 px-2 py-1">
                  <p className="text-[10px] font-semibold text-zinc-500">점수</p>
                  <p className="text-sm font-semibold text-zinc-100">{commandCenter.outcomeReview.score}/100</p>
                </div>
                <div className="rounded border border-zinc-800 bg-zinc-950/60 px-2 py-1">
                  <p className="text-[10px] font-semibold text-zinc-500">상태</p>
                  <p className="text-sm font-semibold text-zinc-100">{translateStatus(commandCenter.outcomeReview.status)}</p>
                </div>
              </div>
              <div className="grid gap-2 md:grid-cols-3">
                {commandCenter.outcomeReview.items.slice(0, 3).map((item) => (
                  <button
                    key={item.id}
                    onClick={() => stagePrompt(item.prompt)}
                    disabled={isLoading}
                    className="rounded-md border border-zinc-800 bg-zinc-950/70 p-2 text-left active:border-sky-500 disabled:opacity-50"
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="truncate text-[11px] font-semibold text-zinc-100">{translateSignal(item.title)}</p>
                      <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                        item.status === "unresolved"
                          ? "bg-rose-500/10 text-rose-300"
                          : item.status === "watch"
                            ? "bg-amber-500/10 text-amber-300"
                            : "bg-emerald-500/10 text-emerald-300"
                      }`}>
                        {translateStatus(item.status)}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-[10px] leading-relaxed text-zinc-500">{translateSignal(item.evidence)}</p>
                    <p className="mt-1 line-clamp-1 text-[10px] text-zinc-400">{translateSignal(item.nextCheck)}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {commandCenter.operatorCoach && (
            <div className={`mt-2 rounded-md border p-2 ${
              commandCenter.operatorCoach.mode === "recover"
                ? "border-rose-500/20 bg-rose-500/5"
                : commandCenter.operatorCoach.mode === "focus"
                  ? "border-sky-500/20 bg-sky-500/5"
                  : "border-emerald-500/20 bg-emerald-500/5"
            }`}>
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-zinc-100">다음 질문 추천</p>
                  <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-zinc-400">{translateSignal(commandCenter.operatorCoach.summary)}</p>
                </div>
                <button
                  onClick={() => sendAgentMessage(commandCenter.operatorCoach!.topPrompt)}
                  disabled={isLoading}
                  className="shrink-0 rounded bg-zinc-100 px-2 py-1 text-[10px] font-semibold text-zinc-950 active:bg-white disabled:opacity-50"
                >
                  추천 질문
                </button>
              </div>
              <div className="grid gap-2 md:grid-cols-3">
                {commandCenter.operatorCoach.items.slice(0, 3).map((item) => (
                  <button
                    key={item.id}
                    onClick={() => stagePrompt(item.prompt)}
                    disabled={isLoading}
                    className="rounded-md border border-zinc-800 bg-zinc-950/70 p-2 text-left active:border-sky-500 disabled:opacity-50"
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="truncate text-[11px] font-semibold text-zinc-100">{translateSignal(item.title)}</p>
                      <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                        item.priority === "high"
                          ? "bg-rose-500/10 text-rose-300"
                          : item.priority === "medium"
                            ? "bg-sky-500/10 text-sky-300"
                            : "bg-emerald-500/10 text-emerald-300"
                      }`}>
                        {translateStatus(item.priority)}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-[10px] leading-relaxed text-zinc-500">{translateSignal(item.reason)}</p>
                    <p className="mt-1 truncate text-[10px] text-zinc-400">{translateSignal(item.source)}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {commandCenter.launchKit && (
            <div className={`mt-2 rounded-md border p-2 ${
              commandCenter.launchKit.status === "blocked"
                ? "border-rose-500/20 bg-rose-500/5"
                : commandCenter.launchKit.status === "watch"
                  ? "border-amber-500/20 bg-amber-500/5"
                  : "border-emerald-500/20 bg-emerald-500/5"
            }`}>
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <ClipboardCheck className="h-3.5 w-3.5 text-zinc-400" />
                    <p className="truncate text-xs font-semibold text-zinc-100">AI 비서 사용 루틴</p>
                    <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                      commandCenter.launchKit.status === "blocked"
                        ? "bg-rose-500/10 text-rose-300"
                        : commandCenter.launchKit.status === "watch"
                          ? "bg-amber-500/10 text-amber-300"
                          : "bg-emerald-500/10 text-emerald-300"
                    }`}>
                      {translateStatus(commandCenter.launchKit.status)}
                    </span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-zinc-400">{translateSignal(commandCenter.launchKit.summary)}</p>
                </div>
                <button
                  onClick={() => sendAgentMessage(commandCenter.launchKit!.firstPrompt)}
                  disabled={isLoading}
                  className="shrink-0 rounded bg-zinc-100 px-2 py-1 text-[10px] font-semibold text-zinc-950 active:bg-white disabled:opacity-50"
                >
                  사용법
                </button>
              </div>
              <button
                onClick={() => stagePrompt(commandCenter.launchKit!.firstPrompt)}
                disabled={isLoading}
                className="mb-2 w-full rounded-md border border-zinc-800 bg-zinc-950/70 px-2 py-1.5 text-left text-[11px] text-zinc-300 active:border-sky-500 disabled:opacity-50"
              >
                첫 질문: {commandCenter.launchKit.firstPrompt}
              </button>
              <div className="grid gap-2 md:grid-cols-4">
                {commandCenter.launchKit.routines.slice(0, 4).map((routine) => {
                  const firstStep = routine.steps.find((step) => step.prompt) || routine.steps[0];
                  return (
                    <button
                      key={routine.id}
                      onClick={() => firstStep?.prompt ? stagePrompt(firstStep.prompt) : undefined}
                      disabled={isLoading || !firstStep?.prompt}
                      className="rounded-md border border-zinc-800 bg-zinc-950/70 p-2 text-left active:border-sky-500 disabled:opacity-50"
                    >
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <p className="truncate text-[11px] font-semibold text-zinc-100">{translateSignal(routine.title)}</p>
                        <span className="shrink-0 rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-300">
                          {translateSignal(routine.cadence)}
                        </span>
                      </div>
                      <p className="line-clamp-2 text-[10px] leading-relaxed text-zinc-500">{translateSignal(routine.why)}</p>
                      <p className="mt-1 truncate text-[10px] text-zinc-400">{translateSignal(routine.owner)} · {firstStep?.location || "/admin/bot"}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {commandCenter.finalReadiness && (
            <div className={`mt-2 rounded-md border p-2 ${
              commandCenter.finalReadiness.status === "blocked"
                ? "border-rose-500/20 bg-rose-500/5"
                : commandCenter.finalReadiness.status === "watch"
                  ? "border-amber-500/20 bg-amber-500/5"
                  : "border-emerald-500/20 bg-emerald-500/5"
            }`}>
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-zinc-400" />
                    <p className="truncate text-xs font-semibold text-zinc-100">최종 완성도 점검</p>
                    <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                      commandCenter.finalReadiness.status === "blocked"
                        ? "bg-rose-500/10 text-rose-300"
                        : commandCenter.finalReadiness.status === "watch"
                          ? "bg-amber-500/10 text-amber-300"
                          : "bg-emerald-500/10 text-emerald-300"
                    }`}>
                      {commandCenter.finalReadiness.score}/100
                    </span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-zinc-400">{translateSignal(commandCenter.finalReadiness.summary)}</p>
                </div>
                <button
                  onClick={() => sendAgentMessage("Final Readiness로 최종형 에이전트 완성도와 남은 일을 점검해줘")}
                  disabled={isLoading}
                  className="shrink-0 rounded bg-zinc-100 px-2 py-1 text-[10px] font-semibold text-zinc-950 active:bg-white disabled:opacity-50"
                >
                  점검
                </button>
              </div>
              {commandCenter.finalReadiness.remainingWork.length > 0 && (
                <div className="mb-2 rounded-md border border-zinc-800 bg-zinc-950/70 p-2">
                  <p className="mb-1 text-[10px] font-semibold text-zinc-500">남은 작업</p>
                  {commandCenter.finalReadiness.remainingWork.slice(0, 3).map((item) => (
                    <p key={item} className="line-clamp-1 text-[10px] text-zinc-400">- {translateSignal(item)}</p>
                  ))}
                </div>
              )}
              <div className="grid gap-2 md:grid-cols-4">
                {commandCenter.finalReadiness.items.slice(0, 8).map((item) => (
                  <button
                    key={item.id}
                    onClick={() => stagePrompt(item.prompt)}
                    disabled={isLoading}
                    className="rounded-md border border-zinc-800 bg-zinc-950/70 p-2 text-left active:border-sky-500 disabled:opacity-50"
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="truncate text-[11px] font-semibold text-zinc-100">{translateSignal(item.title)}</p>
                      <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                        item.status === "block"
                          ? "bg-rose-500/10 text-rose-300"
                          : item.status === "watch"
                            ? "bg-amber-500/10 text-amber-300"
                            : "bg-emerald-500/10 text-emerald-300"
                      }`}>
                        {item.score}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-[10px] leading-relaxed text-zinc-500">{translateSignal(item.gap)}</p>
                    <p className="mt-1 truncate text-[10px] text-zinc-400">{translateStatus(item.status)}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {commandCenter.operatorValue && (
            <div className={`mt-2 rounded-md border p-2 ${
              commandCenter.operatorValue.label === "excellent"
                ? "border-emerald-500/20 bg-emerald-500/5"
                : commandCenter.operatorValue.label === "useful"
                  ? "border-sky-500/20 bg-sky-500/5"
                  : commandCenter.operatorValue.label === "warming_up"
                    ? "border-amber-500/20 bg-amber-500/5"
                    : "border-rose-500/20 bg-rose-500/5"
            }`}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-zinc-100">운영 도움 점수표</p>
                  <p className="mt-0.5 line-clamp-2 text-[11px] text-zinc-400">{translateSignal(commandCenter.operatorValue.summary)}</p>
                </div>
                <span className="shrink-0 rounded-full bg-zinc-950/60 px-2 py-0.5 text-[10px] font-semibold text-zinc-200">
                  {commandCenter.operatorValue.score}/100
                </span>
              </div>
              <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-5">
                {commandCenter.operatorValue.metrics.map((metric) => (
                  <article key={metric.id} className="rounded-md border border-zinc-800 bg-zinc-950/70 p-2">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="truncate text-[11px] font-semibold text-zinc-100">{translateSignal(metric.label)}</p>
                      <span className="shrink-0 rounded-full bg-zinc-900 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-300">
                        {metric.score}
                      </span>
                    </div>
                    <p className="text-[12px] font-semibold text-sky-200">{translateSignal(String(metric.value))}</p>
                    <p className="mt-0.5 line-clamp-2 text-[10px] leading-relaxed text-zinc-500">{translateSignal(metric.detail)}</p>
                  </article>
                ))}
              </div>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <div className="rounded-md border border-zinc-800 bg-zinc-950/50 p-2">
                  <p className="mb-1 text-[11px] font-semibold text-zinc-200">최근 도움</p>
                  <ul className="space-y-1 text-[10px] leading-relaxed text-zinc-500">
                    {commandCenter.operatorValue.wins.slice(0, 3).map((win) => (
                      <li key={win} className="line-clamp-1">{translateSignal(win)}</li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-md border border-zinc-800 bg-zinc-950/50 p-2">
                  <p className="mb-1 text-[11px] font-semibold text-zinc-200">다음 레버리지</p>
                  {commandCenter.operatorValue.nextLeverage.slice(0, 2).map((item) => (
                    <button
                      key={item.title}
                      onClick={() => stagePrompt(item.prompt)}
                      className="mb-1 block w-full rounded border border-zinc-800 px-2 py-1 text-left text-[10px] text-zinc-400 active:border-sky-500 active:text-sky-300"
                    >
                      <span className="block truncate font-semibold text-zinc-200">{translateSignal(item.title)}</span>
                      <span className="block truncate">{translateSignal(item.reason)}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {commandCenter.growthRoadmap && (
            <div className={`mt-2 rounded-md border p-2 ${
              commandCenter.growthRoadmap.status === "on_track"
                ? "border-emerald-500/20 bg-emerald-500/5"
                : commandCenter.growthRoadmap.status === "needs_focus"
                  ? "border-amber-500/20 bg-amber-500/5"
                  : "border-rose-500/20 bg-rose-500/5"
            }`}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-zinc-100">AI 비서 성장 로드맵</p>
                  <p className="mt-0.5 line-clamp-2 text-[11px] text-zinc-400">{translateSignal(commandCenter.growthRoadmap.summary)}</p>
                </div>
                <button
                  onClick={() => stagePrompt(commandCenter.growthRoadmap?.primaryPrompt || "오늘 운영 브리핑 해줘")}
                  className="shrink-0 rounded bg-sky-500 px-2 py-1 text-[10px] font-semibold text-zinc-950 active:bg-sky-400"
                >
                  첫 로드맵 액션
                </button>
              </div>
              <div className="grid gap-2 md:grid-cols-3">
                {[
                  ["Now", commandCenter.growthRoadmap.lanes.now],
                  ["This Week", commandCenter.growthRoadmap.lanes.thisWeek],
                  ["Later", commandCenter.growthRoadmap.lanes.later]
                ].map(([label, items]) => (
                  <div key={label as string} className="rounded-md border border-zinc-800 bg-zinc-950/60 p-2">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="text-[11px] font-semibold text-zinc-200">{translatePhase(label as string)}</p>
                      <span className="rounded-full bg-zinc-900 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-500">
                        {(items as any[]).length}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {(items as any[]).slice(0, 2).map((item) => (
                        <button
                          key={item.id}
                          onClick={() => stagePrompt(item.prompt)}
                          className="block w-full rounded border border-zinc-800 px-2 py-1 text-left active:border-sky-500"
                        >
                          <div className="mb-0.5 flex items-center justify-between gap-2">
                            <span className="truncate text-[10px] font-semibold text-zinc-200">{translateSignal(item.title)}</span>
                            <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${
                              item.priority === "high"
                                ? "bg-rose-500/10 text-rose-300"
                                : item.priority === "medium"
                                  ? "bg-amber-500/10 text-amber-300"
                                  : "bg-emerald-500/10 text-emerald-300"
                            }`}>
                              {translateStatus(item.priority)}
                            </span>
                          </div>
                          <p className="line-clamp-2 text-[10px] leading-relaxed text-zinc-500">{translateSignal(item.expectedValue)}</p>
                        </button>
                      ))}
                      {!(items as any[]).length && (
                        <p className="rounded border border-zinc-800 px-2 py-1 text-[10px] text-zinc-600">대기 항목 없음</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {commandCenter.capabilityMatrix && (
            <div className={`mt-2 rounded-md border p-2 ${
              commandCenter.capabilityMatrix.label === "excellent"
                ? "border-emerald-500/20 bg-emerald-500/5"
                : commandCenter.capabilityMatrix.label === "stable"
                  ? "border-sky-500/20 bg-sky-500/5"
                  : commandCenter.capabilityMatrix.label === "needs_attention"
                    ? "border-amber-500/20 bg-amber-500/5"
                    : "border-rose-500/20 bg-rose-500/5"
            }`}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-zinc-100">AI 비서 기능 점검표</p>
                  <p className="mt-0.5 line-clamp-2 text-[11px] text-zinc-400">{translateSignal(commandCenter.capabilityMatrix.summary)}</p>
                </div>
                <span className="shrink-0 rounded-full bg-zinc-950/60 px-2 py-0.5 text-[10px] font-semibold text-zinc-200">
                  {commandCenter.capabilityMatrix.score}/100
                </span>
              </div>
              <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
                {commandCenter.capabilityMatrix.items.map((item) => (
                  <article key={item.id} className="rounded-md border border-zinc-800 bg-zinc-950/70 p-2">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="truncate text-[11px] font-semibold text-zinc-100">{translateSignal(item.label)}</p>
                      <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                        item.status === "ready"
                          ? "bg-emerald-500/10 text-emerald-300"
                          : item.status === "partial"
                            ? "bg-amber-500/10 text-amber-300"
                            : "bg-rose-500/10 text-rose-300"
                      }`}>
                        {item.score}
                      </span>
                    </div>
                    <p className="line-clamp-2 text-[10px] leading-relaxed text-zinc-500">{translateSignal(item.nextStep)}</p>
                  </article>
                ))}
              </div>
            </div>
          )}

          {commandCenter.rollout && (
            <div className={`mt-2 rounded-md border p-2 ${
              commandCenter.rollout.status === "pass"
                ? "border-emerald-500/20 bg-emerald-500/5"
                : commandCenter.rollout.status === "warn"
                  ? "border-amber-500/20 bg-amber-500/5"
                  : "border-rose-500/20 bg-rose-500/5"
            }`}>
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-zinc-100">배포 전 점검</p>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  commandCenter.rollout.status === "pass"
                    ? "bg-emerald-500/10 text-emerald-400"
                    : commandCenter.rollout.status === "warn"
                      ? "bg-amber-500/10 text-amber-400"
                      : "bg-rose-500/10 text-rose-400"
                }`}>
                  {translateStatus(commandCenter.rollout.status)}
                </span>
              </div>
              <div className="flex gap-1 overflow-x-auto pb-1">
                {commandCenter.rollout.checks
                  .filter((check) => check.status !== "pass")
                  .slice(0, 4)
                  .map((check) => (
                    <span key={check.id} className="shrink-0 rounded bg-zinc-950/60 px-2 py-1 text-[10px] text-zinc-300">
                      {translateSignal(check.label)}: {translateSignal(check.message)}
                    </span>
                  ))}
                {commandCenter.rollout.checks.every((check) => check.status === "pass") && (
                  <span className="rounded bg-zinc-950/60 px-2 py-1 text-[10px] text-emerald-300">
                    배포 전 핵심 안전문 통과
                  </span>
                )}
              </div>
            </div>
          )}

          {commandCenter.readiness && (
            <div className={`mt-2 rounded-md border p-2 ${
              commandCenter.readiness.status === "ok"
                ? "border-emerald-500/20 bg-emerald-500/5"
                : commandCenter.readiness.status === "warn"
                  ? "border-amber-500/20 bg-amber-500/5"
                  : "border-rose-500/20 bg-rose-500/5"
            }`}>
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-zinc-100">에이전트 준비 상태</p>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  commandCenter.readiness.status === "ok"
                    ? "bg-emerald-500/10 text-emerald-400"
                    : commandCenter.readiness.status === "warn"
                      ? "bg-amber-500/10 text-amber-400"
                      : "bg-rose-500/10 text-rose-400"
                }`}>
                  {translateStatus(commandCenter.readiness.status)} · 도구 {commandCenter.readiness.toolCount}개
                </span>
              </div>
              <div className="flex gap-1 overflow-x-auto pb-1">
                {commandCenter.readiness.checks
                  .filter((check) => check.status !== "ok")
                  .slice(0, 5)
                  .map((check) => (
                    <span key={check.id} className="shrink-0 rounded bg-zinc-950/60 px-2 py-1 text-[10px] text-zinc-300">
                      {translateSignal(check.label)}: {translateSignal(check.message)}
                    </span>
                  ))}
                {commandCenter.readiness.checks.every((check) => check.status === "ok") && (
                  <span className="rounded bg-zinc-950/60 px-2 py-1 text-[10px] text-emerald-300">
                    모든 핵심 연결 정상
                  </span>
                )}
              </div>
              {commandCenter.thresholds && (
                <p className="mt-1 text-[10px] text-zinc-500">
                  기준값: {commandCenter.thresholds.windowHours}시간 · AI 비용 ${commandCenter.thresholds.aiCostWarnUsd}/${commandCenter.thresholds.aiCostCriticalUsd} · API 에러 {commandCenter.thresholds.apiErrorsCritical}건 · PUBG 남은 호출 {commandCenter.thresholds.pubgQuotaWarnRemaining}/{commandCenter.thresholds.pubgQuotaCriticalRemaining} · 오래된 승인 {commandCenter.thresholds.approvalStaleHours}시간
                </p>
              )}
            </div>
          )}

          {commandCenter.toolCatalog && (
            <div className="mt-2 rounded-md border border-zinc-800 bg-zinc-900 p-2">
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-zinc-100">도구 안전 등급</p>
                <span className="rounded-full bg-zinc-950/60 px-2 py-0.5 text-[10px] font-semibold text-zinc-400">
                  도구 {commandCenter.toolCatalog.total}개
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 text-[10px]">
                <span className="rounded bg-emerald-500/10 px-2 py-1 text-emerald-300">조회 {commandCenter.toolCatalog.counts.read}</span>
                <span className="rounded bg-amber-500/10 px-2 py-1 text-amber-300">쓰기 {commandCenter.toolCatalog.counts.write}</span>
                <span className="rounded bg-rose-500/10 px-2 py-1 text-rose-300">위험 {commandCenter.toolCatalog.counts.dangerous}</span>
              </div>
              <p className="mt-1 line-clamp-2 text-[11px] text-zinc-500">
                승인 필요 도구: {commandCenter.toolCatalog.tools.filter((tool) => tool.approvalRequired).map((tool) => tool.name).join(", ") || "없음"}
              </p>
            </div>
          )}

          {commandCenter.latestReport?.item && (
            <div className="mt-2 rounded-md border border-sky-500/20 bg-sky-500/5 p-2">
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="truncate text-xs font-semibold text-sky-100">{commandCenter.latestReport.item.title}</p>
                <span className="shrink-0 rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-300">
                  최근 보고서
                </span>
              </div>
              <p className="line-clamp-2 text-[11px] leading-relaxed text-sky-100/70">{commandCenter.latestReport.item.body}</p>
            </div>
          )}

          {commandCenter.contentPerformance && (
            <div className="mt-2 rounded-md border border-violet-500/20 bg-violet-500/5 p-2">
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-violet-100">콘텐츠 성과</p>
                <span className="shrink-0 rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-semibold text-violet-300">
                  게시글 {commandCenter.contentPerformance.totalPosts}개 · {translateStatus(commandCenter.contentPerformance.momentum?.label || "no_data")}
                </span>
              </div>
              {commandCenter.contentPerformance.error ? (
                <p className="text-[11px] text-violet-100/70">{commandCenter.contentPerformance.error}</p>
              ) : (
                <>
                  <p className="truncate text-[11px] text-violet-100/80">
                    상위 게시글: {commandCenter.contentPerformance.topPost?.title || "최근 게시글 데이터 없음"} · 조회 {commandCenter.contentPerformance.topPost?.views || 0} · 반응률 {commandCenter.contentPerformance.averageEngagementRate}%
                  </p>
                  {commandCenter.contentPerformance.momentum && (
                    <p className="mt-1 line-clamp-1 text-[10px] text-violet-100/60">
                      흐름 {commandCenter.contentPerformance.momentum.score}: {translateSignal(commandCenter.contentPerformance.momentum.reason)}
                    </p>
                  )}
                  {(commandCenter.contentPerformance.lowEffortWins?.length || 0) > 0 && (
                    <div className="mt-2 flex gap-1 overflow-x-auto pb-1">
                      {commandCenter.contentPerformance.lowEffortWins?.slice(0, 3).map((win) => (
                        <span key={win} className="shrink-0 rounded bg-zinc-950/60 px-2 py-1 text-[10px] text-violet-100/70">
                          {win}
                        </span>
                      ))}
                    </div>
                  )}
                  {(commandCenter.contentPerformance.weeklyPlan?.length || 0) > 0 && (
                    <div className="mt-2 grid gap-1.5 sm:grid-cols-3">
                      {commandCenter.contentPerformance.weeklyPlan?.map((item) => (
                        <button
                          key={`${item.day}-${item.title}`}
                          onClick={() => stagePrompt(`${item.title} 주제로 ${item.angle} 방향의 게시글 초안을 만들어줘`)}
                          className="rounded border border-violet-500/20 bg-zinc-950/60 p-1.5 text-left active:border-violet-400"
                        >
                          <p className="text-[10px] font-semibold text-violet-300">{item.day} · {item.source}</p>
                          <p className="mt-0.5 truncate text-[11px] font-semibold text-violet-100">{item.title}</p>
                          <p className="mt-0.5 line-clamp-2 text-[10px] leading-relaxed text-violet-100/60">{item.angle}</p>
                        </button>
                      ))}
                    </div>
                  )}
                  {commandCenter.contentPerformance.recommendations[0] && (
                    <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-violet-100/70">
                      {commandCenter.contentPerformance.recommendations[0]}
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {((commandCenter.playbooks?.length || 0) > 0 || (commandCenter.relatedMemories?.items?.length || 0) > 0 || (commandCenter.memorySuggestions?.length || 0) > 0) && (
            <div className="mt-2 grid gap-2 lg:grid-cols-2">
              {(commandCenter.playbooks?.length || 0) > 0 && (
                <div className="rounded-md border border-zinc-800 bg-zinc-900 p-2">
                  <p className="mb-2 text-[10px] font-semibold text-zinc-500">추천 처리 절차</p>
                  <div className="space-y-1.5">
                    {commandCenter.playbooks?.slice(0, 2).map((playbook) => (
                      <div key={playbook.id} className="rounded border border-zinc-800 bg-zinc-950 p-2">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <p className="truncate text-xs font-semibold text-zinc-200">{translateSignal(playbook.title)}</p>
                          <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] ${
                            playbook.riskLevel === "approval_required"
                              ? "bg-amber-500/10 text-amber-400"
                              : playbook.riskLevel === "manual_check"
                                ? "bg-rose-500/10 text-rose-400"
                                : "bg-emerald-500/10 text-emerald-400"
                          }`}>
                            {translateStatus(playbook.riskLevel)}
                          </span>
                        </div>
                        <p className="line-clamp-2 text-[11px] leading-relaxed text-zinc-500">{translateSignal(playbook.nextAction)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(commandCenter.relatedMemories?.items?.length || 0) > 0 && (
                <div className="rounded-md border border-zinc-800 bg-zinc-900 p-2">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-[10px] font-semibold text-zinc-500">관련 운영 기억</p>
                    <button
                      onClick={() => openMemorySearch(commandCenter.relatedMemories?.query || "")}
                      className="rounded border border-zinc-800 px-2 py-0.5 text-[10px] font-semibold text-zinc-500 active:border-sky-500 active:text-sky-300"
                    >
                      검색
                    </button>
                  </div>
                  <p className="mb-2 line-clamp-2 text-[10px] leading-relaxed text-zinc-600">{translateSignal(commandCenter.relatedMemories?.reason)}</p>
                  <div className="space-y-1.5">
                    {commandCenter.relatedMemories?.items?.slice(0, 2).map((memory) => (
                      <button
                        key={memory.id}
                        onClick={() => openMemorySearch(memory.title)}
                        className="w-full rounded border border-zinc-800 bg-zinc-950 p-2 text-left active:border-sky-500/50"
                      >
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <p className="truncate text-xs font-semibold text-zinc-200">{translateSignal(memory.title)}</p>
                          <span className="shrink-0 rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
                            {translateSignal(memory.category)}
                          </span>
                        </div>
                        <p className="line-clamp-2 text-[11px] leading-relaxed text-zinc-500">{translateSignal(memory.body)}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {(commandCenter.memorySuggestions?.length || 0) > 0 && (
                <div className="rounded-md border border-fuchsia-500/20 bg-fuchsia-500/5 p-2">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-[10px] font-semibold text-fuchsia-300/70">기억으로 남길 후보</p>
                    <span className="rounded-full bg-fuchsia-500/10 px-2 py-0.5 text-[10px] font-semibold text-fuchsia-300">
                      후보 {commandCenter.memorySuggestions?.length}개
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {commandCenter.memorySuggestions?.slice(0, 2).map((suggestion) => (
                      <button
                        key={suggestion.id}
                        onClick={() => stagePrompt(suggestion.prompt)}
                        className="w-full rounded border border-fuchsia-500/20 bg-zinc-950 p-2 text-left active:border-fuchsia-400"
                      >
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <p className="truncate text-xs font-semibold text-fuchsia-100">{translateSignal(suggestion.title)}</p>
                          <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] ${
                            suggestion.priority === "high"
                              ? "bg-rose-500/10 text-rose-300"
                              : suggestion.priority === "medium"
                                ? "bg-amber-500/10 text-amber-300"
                                : "bg-emerald-500/10 text-emerald-300"
                          }`}>
                            {translateStatus(suggestion.priority)} · {translateSignal(suggestion.category)}
                          </span>
                        </div>
                        <p className="line-clamp-2 text-[11px] leading-relaxed text-fuchsia-100/70">{translateSignal(suggestion.reason)}</p>
                        <p className="mt-1 line-clamp-1 text-[10px] text-fuchsia-100/40">
                          {suggestion.evidence.slice(0, 2).map((item) => translateSignal(item)).join(" · ")}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {commandCenter.quickPrompts.map((prompt) => (
              <div key={prompt} className="flex shrink-0 items-center overflow-hidden rounded-full border border-zinc-800 bg-zinc-900">
                <button
                  onClick={() => sendAgentMessage(prompt)}
                  disabled={isLoading}
                  className="px-3 py-1.5 text-xs text-zinc-300 active:text-amber-400 disabled:opacity-50"
                >
                  {prompt}
                </button>
                <button
                  onClick={() => stagePrompt(prompt)}
                  disabled={isLoading}
                  className="border-l border-zinc-800 px-2 py-1.5 text-[10px] font-semibold text-zinc-500 active:text-amber-400 disabled:opacity-50"
                >
                  수정
                </button>
              </div>
            ))}
          </div>
          </>
          ) : (
            <div className="grid gap-3 lg:grid-cols-[1fr_1.2fr]">
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                <p className="text-sm font-bold text-amber-100">처음 쓰는 방법</p>
                <p className="mt-1 text-xs leading-relaxed text-amber-100/70">
                  아래 질문을 누르거나, 맨 아래 채팅창에 하고 싶은 일을 그대로 적으면 됩니다. 조회는 바로 실행하고, 삭제/발행/저장처럼 위험한 일은 먼저 승인 요청만 만듭니다.
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {[
                    "30초 운영자 브리핑으로 지금 할 일만 알려줘",
                    "오늘 운영에서 뭐부터 처리해야 하는지 액션 보드로 정리해줘",
                    "승인 대기 요청을 승인/거절/보류 권고로 나눠줘",
                    "최근 PUBG API 에러와 AI 비용을 같이 점검해줘"
                  ].map((prompt) => (
                    <button
                      key={prompt}
                      onClick={() => sendAgentMessage(prompt)}
                      disabled={isLoading}
                      className="rounded-md border border-amber-500/20 bg-zinc-950/70 px-3 py-2 text-left text-xs font-semibold leading-relaxed text-zinc-100 active:border-amber-400 disabled:opacity-50"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-4">
                <button
                  onClick={handleToggleApprovals}
                  className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-left active:border-emerald-500"
                >
                  <p className="text-[11px] font-semibold text-zinc-500">승인 대기</p>
                  <p className="mt-1 text-2xl font-bold text-zinc-100">{commandCenter.pendingApprovals.count}</p>
                  <p className="mt-1 text-[11px] text-zinc-500">삭제/발행 전 확인</p>
                </button>
                <button
                  onClick={runManualMonitor}
                  disabled={monitorLoading}
                  className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-left active:border-sky-500 disabled:opacity-50"
                >
                  <p className="text-[11px] font-semibold text-zinc-500">운영 점검</p>
                  <p className="mt-1 text-lg font-bold text-zinc-100">
                    {monitorLoading ? "점검 중" : commandCenter.severity === "ok" ? "정상" : commandCenter.severity === "warn" ? "주의" : "위험"}
                  </p>
                  <p className="mt-1 text-[11px] text-zinc-500">수동 점검 실행</p>
                </button>
                <button
                  onClick={() => sendAgentMessage("Final Readiness로 최종형 에이전트 완성도와 남은 일을 점검해줘")}
                  disabled={isLoading}
                  className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-left active:border-emerald-500 disabled:opacity-50"
                >
                  <p className="text-[11px] font-semibold text-zinc-500">완성도</p>
                  <p className="mt-1 text-lg font-bold text-zinc-100">{commandCenter.finalReadiness?.score ?? "-"}/100</p>
                  <p className="mt-1 text-[11px] text-zinc-500">최종 점검</p>
                </button>
                <button
                  onClick={() => setShowCommandCenter(true)}
                  className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-left active:border-amber-500"
                >
                  <p className="text-[11px] font-semibold text-zinc-500">상세 운영판</p>
                  <p className="mt-1 text-lg font-bold text-zinc-100">열기</p>
                  <p className="mt-1 text-[11px] text-zinc-500">전체 지표 보기</p>
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* ⚙️ 2. 봇 페르소나 설정 드로워 (모바일 특화 아코디언) */}
      {showSettings && (
        <div className="border-b border-zinc-800 bg-zinc-900/90 p-4 transition-all duration-300">
          <h2 className="text-xs font-semibold text-amber-500 mb-2">에이전트 페르소나 지침</h2>
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

      {showApprovals && (
        <div className="border-b border-zinc-800 bg-zinc-900/90 p-4">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-emerald-400">승인 대기 작업</h2>
              {approvalSummary && (
                <p className="mt-1 text-[11px] text-zinc-500">
                  전체 {approvalSummary.count} · 고위험 {approvalSummary.highRiskCount} · 오래됨 {approvalSummary.staleCount} · 최장 대기 {approvalSummary.oldestAgeHours}시간
                </p>
              )}
            </div>
            <button
              onClick={() => Promise.all([loadApprovals(), loadAgentRuns()])}
              className="text-xs text-zinc-400 active:text-zinc-100"
            >
              새로고침
            </button>
          </div>

          <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
            {([
              ["pending", `대기 ${pendingApprovalCount}`],
              ["high", `고위험 ${approvalSummary?.highRiskCount || 0}`],
              ["stale", `오래됨 ${approvalSummary?.staleCount || 0}`],
              ["done", "처리됨"],
              ["all", "전체"]
            ] as Array<[ApprovalFilter, string]>).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setApprovalFilter(value)}
                className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                  approvalFilter === value
                    ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
                    : "border-zinc-800 bg-zinc-950 text-zinc-500 active:border-zinc-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {approvalActionNotice && (
            <div className="mb-3 flex items-start justify-between gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-100">
              <div>
                <p className="font-semibold text-emerald-300">최근 승인 처리 결과</p>
                <p className="mt-1 whitespace-pre-wrap leading-relaxed">{approvalActionNotice}</p>
              </div>
              <button
                onClick={() => setApprovalActionNotice(null)}
                className="shrink-0 rounded border border-emerald-500/20 px-2 py-1 text-[10px] font-semibold text-emerald-300 active:border-emerald-400"
              >
                닫기
              </button>
            </div>
          )}

          <div className="grid gap-3 lg:grid-cols-[minmax(220px,0.9fr)_minmax(320px,1.1fr)]">
            <div className="max-h-72 space-y-2 overflow-y-auto">
              {filteredApprovals.length === 0 ? (
                <p className="text-xs text-zinc-500">현재 필터에 해당하는 승인 요청이 없습니다.</p>
              ) : (
                filteredApprovals.map((approval) => {
                  const isSelected = approval.id === selectedApprovalId;
                  return (
                    <button
                      key={approval.id}
                      onClick={() => setSelectedApprovalId(approval.id)}
                      className={`w-full rounded-lg border p-3 text-left transition-colors ${
                        isSelected
                          ? "border-emerald-500/50 bg-emerald-500/5"
                          : "border-zinc-800 bg-zinc-950 active:border-zinc-700"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-zinc-100">{getApprovalTitle(approval)}</p>
                          <p className="mt-1 text-[11px] text-zinc-500">
                            {approval.tool_name} · {translateStatus(approval.status)}
                            {approval.queue ? ` · ${translateStatus(approval.queue.priority)} · ${approval.queue.ageHours}시간` : ""}
                          </p>
                        </div>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          approval.queue?.isStale
                            ? "bg-rose-500/10 text-rose-400"
                            : approval.queue?.priority === "high"
                              ? "bg-amber-500/10 text-amber-400"
                              : approval.status === "pending"
                            ? "bg-emerald-500/10 text-emerald-400"
                            : approval.status === "failed"
                              ? "bg-rose-500/10 text-rose-400"
                              : "bg-zinc-800 text-zinc-400"
                        }`}>
                          {approval.queue?.isStale ? "오래됨" : translateStatus(approval.queue?.priority || approval.status)}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            <div className="min-h-52 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
              {selectedApproval ? (
                <div className="flex h-full flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Eye className="h-4 w-4 shrink-0 text-emerald-400" />
                        <p className="truncate text-sm font-semibold text-zinc-100">{getApprovalTitle(selectedApproval)}</p>
                      </div>
                      <p className="mt-1 text-xs text-zinc-500">{getApprovalRisk(selectedApproval)} · {formatDateTime(selectedApproval.created_at)}</p>
                    </div>
                    <span className="shrink-0 rounded-full border border-zinc-700 px-2 py-1 text-[10px] font-semibold text-zinc-400">
                      {translateStatus(selectedApproval.status)}
                    </span>
                  </div>

                  <div className="grid gap-2 text-xs text-zinc-300 sm:grid-cols-2">
                    <div className="rounded-md bg-zinc-900 p-2">
                      <p className="mb-1 text-[10px] font-semibold text-zinc-500">작업 종류</p>
                      <p className="break-words">{selectedApproval.action_type}</p>
                    </div>
                    <div className="rounded-md bg-zinc-900 p-2">
                      <p className="mb-1 text-[10px] font-semibold text-zinc-500">승인 ID</p>
                      <p className="break-all">{selectedApproval.id}</p>
                    </div>
                  </div>

                  {selectedApproval.payload?.reason && (
                    <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-2 text-xs text-amber-100">
                      <p className="mb-1 text-[10px] font-semibold text-amber-400">요청 사유</p>
                      <p>{selectedApproval.payload.reason}</p>
                    </div>
                  )}

                  {selectedApproval.queue && (
                    <div className={`rounded-md border p-2 text-xs ${
                      selectedApproval.queue.isStale
                        ? "border-rose-500/30 bg-rose-500/5 text-rose-100"
                        : selectedApproval.queue.priority === "high"
                          ? "border-amber-500/30 bg-amber-500/5 text-amber-100"
                          : "border-zinc-800 bg-zinc-900 text-zinc-300"
                    }`}>
                      <p className="mb-1 text-[10px] font-semibold opacity-80">대기 우선순위</p>
                      <p>
                        {translateStatus(selectedApproval.queue.priority)} 우선순위 · 생성 후 {selectedApproval.queue.ageHours}시간 경과
                        {selectedApproval.queue.isStale ? ` · ${approvalStaleHours}시간 이상 방치` : ""}
                      </p>
                    </div>
                  )}

                  {selectedApproval.impact && (
                    <div className={`rounded-md border p-2 text-xs ${
                      selectedApproval.impact.risk === "high"
                        ? "border-rose-500/30 bg-rose-500/5 text-rose-100"
                        : selectedApproval.impact.risk === "medium"
                          ? "border-amber-500/30 bg-amber-500/5 text-amber-100"
                          : "border-emerald-500/30 bg-emerald-500/5 text-emerald-100"
                    }`}>
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <p className="text-[10px] font-semibold opacity-80">예상 영향</p>
                        <span className="rounded-full bg-zinc-950/60 px-2 py-0.5 text-[10px] font-semibold">
                          {translateStatus(selectedApproval.impact.risk)}
                        </span>
                      </div>
                      <p>{translateSignal(selectedApproval.impact.summary)}</p>
                      {typeof selectedApproval.impact.estimatedRows === "number" && (
                        <p className="mt-1 opacity-80">예상 영향 행: {selectedApproval.impact.estimatedRows.toLocaleString("ko-KR")}개</p>
                      )}
                      {selectedApproval.impact.checklist && selectedApproval.impact.checklist.length > 0 && (
                        <div className="mt-2 space-y-1.5">
                          {selectedApproval.impact.checklist.map((item, index) => (
                            <div key={`${item.label}-${index}`} className="rounded bg-zinc-950/50 p-1.5">
                              <div className="mb-0.5 flex items-center justify-between gap-2">
                                <p className="font-semibold">{translateSignal(item.label)}</p>
                                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                                  item.status === "pass"
                                    ? "bg-emerald-500/10 text-emerald-300"
                                    : item.status === "warning"
                                      ? "bg-rose-500/10 text-rose-300"
                                      : "bg-amber-500/10 text-amber-300"
                                }`}>
                                  {translateStatus(item.status)}
                                </span>
                              </div>
                              <p className="opacity-80">{translateSignal(item.message)}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {selectedApproval.impact?.executionGate && (
                    <div className={`rounded-md border p-2 text-xs ${
                      selectedApproval.impact.executionGate.status === "block"
                        ? "border-rose-500/30 bg-rose-500/5 text-rose-100"
                        : selectedApproval.impact.executionGate.status === "review"
                          ? "border-amber-500/30 bg-amber-500/5 text-amber-100"
                          : "border-emerald-500/30 bg-emerald-500/5 text-emerald-100"
                    }`}>
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <p className="text-[10px] font-semibold opacity-80">실행 전 안전문</p>
                        <span className="rounded-full bg-zinc-950/60 px-2 py-0.5 text-[10px] font-semibold">
                          {translateStatus(selectedApproval.impact.executionGate.status)}
                        </span>
                      </div>
                      <p className="font-semibold">{translateSignal(selectedApproval.impact.executionGate.label)}</p>
                      <div className="mt-1 space-y-1">
                        {selectedApproval.impact.executionGate.reasons.map((reason, index) => (
                          <p key={`${reason}-${index}`} className="rounded bg-zinc-950/50 px-2 py-1 opacity-85">
                            {translateSignal(reason)}
                          </p>
                        ))}
                      </div>
                      {selectedApproval.impact.executionGate.requiredBeforeApproval.length > 0 && (
                        <div className="mt-2 rounded bg-zinc-950/50 p-2">
                          <p className="mb-1 text-[10px] font-semibold opacity-70">승인 전 필요 조치</p>
                          <ul className="space-y-1">
                            {selectedApproval.impact.executionGate.requiredBeforeApproval.map((item, index) => (
                              <li key={`${item}-${index}`}>{translateSignal(item)}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {selectedApproval.impact?.preview && (
                    <div className="rounded-md border border-sky-500/20 bg-sky-500/5 p-2 text-xs text-sky-100">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-[10px] font-semibold text-sky-300">승인 전 미리보기</p>
                        <span className="rounded-full bg-zinc-950/60 px-2 py-0.5 text-[10px] font-semibold text-sky-200">
                          변경 비교
                        </span>
                      </div>
                      <p className="mb-2 font-semibold">{translateSignal(selectedApproval.impact.preview.headline)}</p>
                      <div className="grid gap-1.5 sm:grid-cols-2">
                        {selectedApproval.impact.preview.items.map((item, index) => (
                          <div key={`${item.label}-${index}`} className="rounded bg-zinc-950/60 p-1.5">
                            <p className="text-[10px] font-semibold text-sky-300/70">{translateSignal(item.label)}</p>
                            <p className="mt-0.5 break-words text-zinc-100">{translateSignal(String(item.value))}</p>
                          </div>
                        ))}
                      </div>
                      {selectedApproval.impact.preview.bodyPreview && (
                        <div className="mt-2 rounded bg-zinc-950/60 p-2">
                          <p className="mb-1 text-[10px] uppercase tracking-wide text-sky-300/70">본문/내용 요약</p>
                          <p className="max-h-24 overflow-y-auto whitespace-pre-wrap leading-relaxed text-sky-100/80">
                            {selectedApproval.impact.preview.bodyPreview}
                          </p>
                        </div>
                      )}
                      {selectedApproval.impact.preview.diff && (
                        <div className="mt-2 rounded border border-amber-500/20 bg-amber-500/5 p-2">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <p className="text-[10px] font-semibold text-amber-300">초안 대비 변경</p>
                            <span className="rounded-full bg-zinc-950/60 px-2 py-0.5 text-[10px] font-semibold text-amber-200">
                              {selectedApproval.impact.preview.diff.contentChanged || selectedApproval.impact.preview.diff.titleChanged ? "변경됨" : "동일"}
                            </span>
                          </div>
                          <div className="grid gap-1.5 sm:grid-cols-3">
                            <div className="rounded bg-zinc-950/60 p-1.5">
                              <p className="text-[10px] text-amber-300/70">제목</p>
                              <p className="mt-0.5 text-zinc-100">{selectedApproval.impact.preview.diff.titleChanged ? "변경됨" : "동일"}</p>
                            </div>
                            <div className="rounded bg-zinc-950/60 p-1.5">
                              <p className="text-[10px] text-amber-300/70">본문</p>
                              <p className="mt-0.5 text-zinc-100">{selectedApproval.impact.preview.diff.contentChanged ? "변경됨" : "동일"}</p>
                            </div>
                            <div className="rounded bg-zinc-950/60 p-1.5">
                              <p className="text-[10px] text-amber-300/70">길이 변화</p>
                              <p className="mt-0.5 text-zinc-100">{selectedApproval.impact.preview.diff.lengthDelta >= 0 ? "+" : ""}{selectedApproval.impact.preview.diff.lengthDelta.toLocaleString("ko-KR")}자</p>
                            </div>
                          </div>
                          {(selectedApproval.impact.preview.diff.beforePreview || selectedApproval.impact.preview.diff.afterPreview) && (
                            <div className="mt-2 grid gap-1.5 md:grid-cols-2">
                              <div className="rounded bg-zinc-950/60 p-1.5">
                                <p className="mb-1 text-[10px] text-amber-300/70">원본 초안</p>
                                <p className="max-h-20 overflow-y-auto whitespace-pre-wrap text-[11px] leading-relaxed text-amber-100/70">
                                  {selectedApproval.impact.preview.diff.beforePreview || "-"}
                                </p>
                              </div>
                              <div className="rounded bg-zinc-950/60 p-1.5">
                                <p className="mb-1 text-[10px] text-amber-300/70">최종 발행안</p>
                                <p className="max-h-20 overflow-y-auto whitespace-pre-wrap text-[11px] leading-relaxed text-amber-100/70">
                                  {selectedApproval.impact.preview.diff.afterPreview || "-"}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      {(selectedApproval.impact.preview.warnings?.length || 0) > 0 && (
                        <div className="mt-2 space-y-1">
                          {selectedApproval.impact.preview.warnings?.map((warning, index) => (
                            <p key={`${warning}-${index}`} className="rounded border border-amber-500/20 bg-amber-500/5 px-2 py-1 text-[11px] text-amber-100">
                              {translateSignal(warning)}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {selectedApproval.action_type === "create_board_post" ? (
                    <div className="min-h-0 rounded-md border border-zinc-800 bg-zinc-900 p-2">
                      <p className="mb-1 text-[10px] font-semibold text-zinc-500">게시글 미리보기</p>
                      <p className="mb-2 text-xs font-semibold text-zinc-100">{selectedApproval.payload?.title}</p>
                      <div
                        className="max-h-32 overflow-y-auto rounded bg-zinc-950 p-2 text-xs leading-relaxed text-zinc-300"
                        dangerouslySetInnerHTML={{ __html: selectedApproval.payload?.content || "" }}
                      />
                    </div>
                  ) : (
                    <pre className="max-h-32 overflow-y-auto rounded-md border border-zinc-800 bg-zinc-900 p-2 text-[11px] leading-relaxed text-zinc-300">
                      {JSON.stringify(selectedApproval.payload, null, 2)}
                    </pre>
                  )}

                  {(selectedApproval.result || selectedApproval.error) && (
                    <div className={`rounded-md border p-2 text-xs ${
                      selectedApproval.error
                        ? "border-rose-500/20 bg-rose-500/5 text-rose-200"
                        : "border-emerald-500/20 bg-emerald-500/5 text-emerald-200"
                    }`}>
                      <p className="mb-1 text-[10px] uppercase tracking-wide opacity-80">
                        {selectedApproval.error ? "오류" : "실행 결과"}
                      </p>
                      <p className="break-words whitespace-pre-wrap">{selectedApproval.error || formatApprovalResult(selectedApproval.result)}</p>
                    </div>
                  )}

                  {selectedApproval.status === "pending" && (
                    <div className="mt-auto flex justify-end gap-2">
                      <button
                        onClick={() => handleApprovalAction(selectedApproval.id, "reject")}
                        disabled={approvalLoadingId === selectedApproval.id}
                        className="rounded-md bg-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-300 disabled:opacity-50"
                      >
                        거절
                      </button>
                      <button
                        onClick={() => handleApprovalAction(selectedApproval.id, "approve")}
                        disabled={approvalLoadingId === selectedApproval.id || selectedApproval.impact?.executionGate?.status === "block"}
                        className={`rounded-md px-3 py-2 text-xs font-semibold disabled:opacity-50 ${
                          selectedApprovalRisk === "high"
                            ? "bg-rose-500 text-white"
                            : "bg-emerald-500 text-zinc-950"
                        }`}
                      >
                        {selectedApproval.impact?.executionGate?.status === "block"
                          ? "승인 차단됨"
                          : selectedApprovalRisk === "high" ? "위험 작업 승인 실행" : "승인 후 실행"}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex h-full min-h-40 items-center justify-center text-xs text-zinc-500">
                  검토할 승인 요청을 선택해 주세요.
                </div>
              )}
            </div>
          </div>

          {agentRuns.length > 0 && (
            <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">최근 실행 기록</p>
                <p className="text-[11px] text-zinc-600">{agentRuns.length}개 실행</p>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {agentRuns.slice(0, 8).map((run) => (
                  <button
                    key={run.id}
                    onClick={() => loadRunDetail(run.id)}
                    className={`w-56 shrink-0 rounded-md border p-2 text-left transition-colors ${
                      selectedRunId === run.id
                        ? "border-sky-500/50 bg-sky-500/5"
                        : "border-zinc-800 bg-zinc-900 active:border-zinc-700"
                    }`}
                  >
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="truncate text-xs font-medium text-zinc-200">{translateSignal(run.message)}</p>
                      <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] ${
                        run.status === "completed"
                          ? "bg-emerald-500/10 text-emerald-400"
                          : run.status === "failed"
                            ? "bg-rose-500/10 text-rose-400"
                            : "bg-amber-500/10 text-amber-400"
                      }`}>
                        {translateStatus(run.status)}
                      </span>
                    </div>
                    <p className="text-[10px] text-zinc-500">{formatDateTime(run.started_at)}</p>
                  </button>
                ))}
              </div>
              {selectedRunId && (
                <div className="mt-3 rounded-md border border-zinc-800 bg-zinc-900 p-2">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-semibold text-zinc-300">실행 단계 상세</p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => loadRunTimeline(selectedRunId)}
                        disabled={timelineLoadingId === selectedRunId}
                        className="rounded border border-zinc-700 px-2 py-1 text-[10px] font-semibold text-zinc-400 active:border-sky-500 active:text-sky-300 disabled:opacity-50"
                      >
                        {timelineLoadingId === selectedRunId ? "생성 중" : "타임라인 내보내기"}
                      </button>
                      <p className="text-[10px] text-zinc-600">{selectedRunSteps.length}단계</p>
                    </div>
                  </div>
                  {selectedRunSteps.length === 0 ? (
                    <p className="text-xs text-zinc-500">이 실행에는 기록된 도구 단계가 없습니다.</p>
                  ) : (
                    <div className="space-y-2">
                      {selectedRunSteps.map((step) => (
                        <div key={step.id} className="rounded border border-zinc-800 bg-zinc-950 p-2">
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <p className="truncate text-xs font-semibold text-zinc-200">{step.tool_name}</p>
                            <div className="flex shrink-0 items-center gap-1">
                              <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                                step.safety_level === "dangerous"
                                  ? "bg-rose-500/10 text-rose-400"
                                  : step.safety_level === "write"
                                    ? "bg-amber-500/10 text-amber-400"
                                    : "bg-emerald-500/10 text-emerald-400"
                              }`}>
                                {translateStatus(step.safety_level)}
                              </span>
                              <span className="rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
                                {translateStatus(step.status)}
                              </span>
                            </div>
                          </div>
                          <pre className="max-h-24 overflow-y-auto rounded bg-zinc-900 p-2 text-[10px] leading-relaxed text-zinc-400">
                            {JSON.stringify(step.params || {}, null, 2)}
                          </pre>
                          {(step.result || step.error) && (
                            <p className={`mt-2 whitespace-pre-wrap text-[11px] leading-relaxed ${
                              step.error ? "text-rose-300" : "text-zinc-400"
                            }`}>
                              {step.error || formatStepResult(step.result)}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {selectedRunTimeline && (
                    <div className="mt-3 rounded-md border border-sky-500/20 bg-sky-500/5 p-2">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-sky-100">타임라인 마크다운</p>
                        <button
                          onClick={copyRunTimeline}
                          className="rounded bg-sky-500 px-2 py-1 text-[10px] font-semibold text-zinc-950 active:bg-sky-400"
                        >
                          복사
                        </button>
                      </div>
                      <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded bg-zinc-950 p-2 text-[10px] leading-relaxed text-sky-100/80">
                        {selectedRunTimeline}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {showMemories && (
        <div className="border-b border-zinc-800 bg-zinc-900/90 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-sky-400">운영 기억 / 리포트</h2>
            <button
              onClick={() => loadMemories()}
              className="text-xs text-zinc-400 active:text-zinc-100"
            >
              새로고침
            </button>
          </div>

          {memorySummary && (
            <div className="mb-3 grid gap-2 sm:grid-cols-4">
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                <p className="text-[10px] font-semibold text-zinc-500">전체</p>
                <p className="mt-1 text-lg font-semibold text-zinc-100">{memorySummary.total.toLocaleString("ko-KR")}</p>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                <p className="text-[10px] font-semibold text-zinc-500">활성</p>
                <p className="mt-1 text-lg font-semibold text-emerald-300">{memorySummary.active.toLocaleString("ko-KR")}</p>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                <p className="text-[10px] font-semibold text-zinc-500">비활성</p>
                <p className="mt-1 text-lg font-semibold text-rose-300">{memorySummary.inactive.toLocaleString("ko-KR")}</p>
              </div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                <p className="text-[10px] font-semibold text-zinc-500">최근 갱신</p>
                <p className="mt-1 truncate text-xs font-semibold text-zinc-200">
                  {memorySummary.latestUpdatedAt ? formatDateTime(memorySummary.latestUpdatedAt) : "기록 없음"}
                </p>
              </div>
            </div>
          )}

          <div className="mb-3 space-y-2 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
            <div className="flex gap-2">
              <input
                type="search"
                value={memoryQuery}
                onChange={(event) => setMemoryQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") loadMemories();
                }}
                placeholder="장애, 정책, 태그 검색"
                className="min-w-0 flex-1 rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-sky-500 focus:outline-none"
              />
              <button
                onClick={() => loadMemories()}
                className="shrink-0 rounded-md bg-sky-500 px-3 py-2 text-xs font-semibold text-zinc-950 active:bg-sky-400"
              >
                검색
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {memoryCategories.map((category) => (
                <button
                  key={category}
                  onClick={() => {
                    setMemoryCategory(category);
                    loadMemories({ category });
                  }}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                    memoryCategory === category
                      ? "border-sky-500/50 bg-sky-500/10 text-sky-300"
                      : "border-zinc-800 bg-zinc-900 text-zinc-500 active:border-zinc-700"
                  }`}
                >
                  {category === "all" ? "전체" : category}
                  <span className="ml-1 text-[10px] opacity-70">
                    {getMemoryCategoryCount(category)}
                  </span>
                </button>
              ))}
              <label className="ml-auto flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-[11px] text-zinc-500">
                <input
                  type="checkbox"
                  checked={memoryIncludeInactive}
                  onChange={(event) => {
                    setMemoryIncludeInactive(event.target.checked);
                    loadMemories({ includeInactive: event.target.checked });
                  }}
                  className="h-3 w-3 accent-sky-500"
                />
                비활성 포함
              </label>
            </div>
          </div>

          {memories.length === 0 ? (
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 text-xs text-zinc-500">
              조건에 맞는 운영 기억이 없습니다. 대화에서 “이번 대응 내용을 memory로 저장해줘” 또는 “오늘 브리핑을 리포트로 저장 요청해줘”라고 요청하면 승인 대기열을 통해 저장됩니다.
            </div>
          ) : (
            <div className="grid max-h-96 gap-2 overflow-y-auto md:grid-cols-2 xl:grid-cols-3">
              {memories.map((memory) => (
                <article key={memory.id} className="flex min-h-40 flex-col rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-zinc-100">{memory.title}</p>
                      <p className="mt-1 text-[11px] text-zinc-500">{memory.category} · {formatDateTime(memory.updated_at)}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        memory.category === "report"
                          ? "bg-sky-500/10 text-sky-400"
                          : memory.category === "policy"
                            ? "bg-amber-500/10 text-amber-400"
                            : "bg-zinc-800 text-zinc-400"
                      }`}>
                        {memory.category}
                      </span>
                      {memory.metadata?.active === false && (
                        <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold text-rose-400">
                          inactive
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="line-clamp-5 flex-1 whitespace-pre-wrap text-xs leading-relaxed text-zinc-400">{memory.body}</p>
                  {Array.isArray(memory.metadata?.tags) && memory.metadata.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {memory.metadata.tags.slice(0, 4).map((tag: string) => (
                        <span key={tag} className="rounded bg-zinc-900 px-1.5 py-0.5 text-[10px] text-zinc-500">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="mt-3 flex justify-end">
                    {memory.metadata?.active === false ? (
                      <span className="rounded-md border border-zinc-800 px-2 py-1 text-xs text-zinc-600">
                        비활성 상태
                      </span>
                    ) : (
                      <button
                        onClick={() => handleDeactivateMemory(memory.id)}
                        disabled={memoryLoadingId === memory.id}
                        className="rounded-md border border-zinc-800 px-2 py-1 text-xs text-zinc-500 active:border-rose-500 active:text-rose-400 disabled:opacity-50"
                      >
                        비활성화
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 💬 3. 채팅 메시지 영역 */}
      <main
        ref={messageContainerRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 pb-6"
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
                      const isApprovalRequired = tool.status === "approval_required";
                      return (
                        <button
                          type="button"
                          key={idx}
                          onClick={() => openApprovalFromTool(tool.approvalId)}
                          disabled={!tool.approvalId}
                          title={tool.approvalId ? "승인 패널에서 이 요청 보기" : undefined}
                          className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium tracking-wide transition-all disabled:cursor-default ${
                            isRunning 
                              ? "border-amber-500/30 bg-amber-500/5 text-amber-400 animate-pulse" 
                              : isSuccess 
                                ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-400" 
                                : isApprovalRequired
                                  ? "border-sky-500/30 bg-sky-500/5 text-sky-400"
                                  : "border-rose-500/30 bg-rose-500/5 text-rose-400"
                          }`}
                        >
                          {tool.toolName === "get_db_statistics" ? (
                            <Database className="h-3 w-3 shrink-0" />
                          ) : tool.toolName === "take_map_screenshot" ? (
                            <Link2 className="h-3 w-3 shrink-0" />
                          ) : tool.toolName === "tavily_search" ? (
                            <Search className="h-3 w-3 shrink-0" />
                          ) : tool.toolName === "get_vercel_deployments" ? (
                            <Cloud className="h-3 w-3 shrink-0" />
                          ) : tool.toolName === "get_vercel_build_logs" ? (
                            <Terminal className="h-3 w-3 shrink-0" />
                          ) : tool.toolName === "inspect_operations" ? (
                            <AlertCircle className="h-3 w-3 shrink-0" />
                          ) : tool.toolName === "inspect_agent_readiness" ? (
                            <Activity className="h-3 w-3 shrink-0" />
                          ) : tool.toolName === "inspect_approval_queue" ? (
                            <ClipboardCheck className="h-3 w-3 shrink-0" />
                          ) : tool.toolName === "inspect_incident_timeline" ? (
                            <AlertCircle className="h-3 w-3 shrink-0" />
                          ) : tool.toolName === "inspect_handoff_packet" ? (
                            <Clipboard className="h-3 w-3 shrink-0" />
                          ) : tool.toolName === "inspect_operator_value" ? (
                            <Activity className="h-3 w-3 shrink-0" />
                          ) : tool.toolName === "inspect_owner_brief" ? (
                            <Activity className="h-3 w-3 shrink-0" />
                          ) : tool.toolName === "inspect_monitor_trend" ? (
                            <Activity className="h-3 w-3 shrink-0" />
                          ) : tool.toolName === "inspect_automation_contract" ? (
                            <ClipboardCheck className="h-3 w-3 shrink-0" />
                          ) : tool.toolName === "inspect_capability_matrix" ? (
                            <Activity className="h-3 w-3 shrink-0" />
                          ) : tool.toolName === "inspect_growth_roadmap" ? (
                            <Activity className="h-3 w-3 shrink-0" />
                          ) : tool.toolName === "inspect_today_action_board" ? (
                            <ClipboardCheck className="h-3 w-3 shrink-0" />
                          ) : tool.toolName === "inspect_daily_checkout" ? (
                            <ClipboardCheck className="h-3 w-3 shrink-0" />
                          ) : tool.toolName === "inspect_operating_sop" ? (
                            <ClipboardCheck className="h-3 w-3 shrink-0" />
                          ) : tool.toolName === "inspect_risk_radar" ? (
                            <Activity className="h-3 w-3 shrink-0" />
                          ) : tool.toolName === "inspect_decision_trace" ? (
                            <Activity className="h-3 w-3 shrink-0" />
                          ) : tool.toolName === "inspect_safety_audit" ? (
                            <ClipboardCheck className="h-3 w-3 shrink-0" />
                          ) : tool.toolName === "inspect_approval_advisor" ? (
                            <ClipboardCheck className="h-3 w-3 shrink-0" />
                          ) : tool.toolName === "inspect_mission_control" ? (
                            <Terminal className="h-3 w-3 shrink-0" />
                          ) : tool.toolName === "inspect_owner_inbox" ? (
                            <Clipboard className="h-3 w-3 shrink-0" />
                          ) : tool.toolName === "inspect_outcome_review" ? (
                            <Activity className="h-3 w-3 shrink-0" />
                          ) : tool.toolName === "inspect_operator_coach" ? (
                            <Activity className="h-3 w-3 shrink-0" />
                          ) : tool.toolName === "inspect_launch_kit" ? (
                            <ClipboardCheck className="h-3 w-3 shrink-0" />
                          ) : tool.toolName === "inspect_final_readiness" ? (
                            <CheckCircle2 className="h-3 w-3 shrink-0" />
                          ) : tool.toolName === "request_cache_cleanup" ? (
                            <XCircle className="h-3 w-3 shrink-0" />
                          ) : tool.toolName === "search_agent_memories" || tool.toolName === "request_agent_memory" ? (
                            <ClipboardCheck className="h-3 w-3 shrink-0" />
                          ) : tool.toolName === "generate_operations_briefing" || tool.toolName === "request_operations_report" ? (
                            <Terminal className="h-3 w-3 shrink-0" />
                          ) : tool.toolName === "generate_content_draft" || tool.toolName === "request_content_post" ? (
                            <FileText className="h-3 w-3 shrink-0" />
                          ) : tool.toolName === "analyze_content_performance" ? (
                            <FileText className="h-3 w-3 shrink-0" />
                          ) : (
                            <FileText className="h-3 w-3 shrink-0" />
                          )}
                          <span>
                            {tool.toolName === "get_db_statistics" 
                              ? "DB 집계" 
                              : tool.toolName === "take_map_screenshot" 
                                ? "지도 캡처" 
                                : tool.toolName === "tavily_search"
                                  ? "웹 검색"
                                  : tool.toolName === "get_vercel_deployments"
                                    ? "배포 조회"
                                    : tool.toolName === "get_vercel_build_logs"
                                      ? "빌드 분석"
                                      : tool.toolName === "inspect_operations"
                                        ? "운영 진단"
                                        : tool.toolName === "inspect_agent_readiness"
                                          ? "준비 점검"
                                          : tool.toolName === "inspect_approval_queue"
                                            ? "승인 분석"
                                            : tool.toolName === "inspect_incident_timeline"
                                              ? "사고 타임라인"
                                            : tool.toolName === "inspect_handoff_packet"
                                              ? "인수인계"
                                              : tool.toolName === "inspect_operator_value"
                                                ? "가치 점검"
                                                : tool.toolName === "inspect_owner_brief"
                                                  ? "운영자 브리핑"
                                                : tool.toolName === "inspect_monitor_trend"
                                                  ? "추세 점검"
                                                : tool.toolName === "inspect_automation_contract"
                                                  ? "자동화 계약"
                                                : tool.toolName === "inspect_capability_matrix"
                                                  ? "능력 점검"
                                                : tool.toolName === "inspect_growth_roadmap"
                                                  ? "성장 로드맵"
                                                : tool.toolName === "inspect_today_action_board"
                                                  ? "오늘 액션"
                                                : tool.toolName === "inspect_daily_checkout"
                                                  ? "마감 점검"
                                                : tool.toolName === "inspect_operating_sop"
                                                  ? "운영 SOP"
                                                : tool.toolName === "inspect_risk_radar"
                                                  ? "위험 예측"
                                                : tool.toolName === "inspect_decision_trace"
                                                  ? "판단 근거"
                                                : tool.toolName === "inspect_safety_audit"
                                                  ? "안전 감사"
                                                : tool.toolName === "inspect_approval_advisor"
                                                  ? "승인 권고"
                                                : tool.toolName === "inspect_mission_control"
                                                  ? "미션 컨트롤"
                                                : tool.toolName === "inspect_owner_inbox"
                                                  ? "오너 인박스"
                                                : tool.toolName === "inspect_outcome_review"
                                                  ? "결과 검토"
                                                : tool.toolName === "inspect_operator_coach"
                                                  ? "운영 코치"
                                                : tool.toolName === "inspect_launch_kit"
                                                  ? "런치 키트"
                                                : tool.toolName === "inspect_final_readiness"
                                                  ? "최종 점검"
                                                : tool.toolName === "request_cache_cleanup"
                                                  ? "캐시 정리"
                                                  : tool.toolName === "search_agent_memories"
                                                    ? "기억 검색"
                                                    : tool.toolName === "request_agent_memory"
                                                      ? "기억 저장"
                                                      : tool.toolName === "generate_operations_briefing"
                                                        ? "브리핑 생성"
                                                        : tool.toolName === "request_operations_report"
                                                          ? "리포트 저장"
                                                          : tool.toolName === "generate_content_draft"
                                                            ? "초안 생성"
                                                            : tool.toolName === "analyze_content_performance"
                                                              ? "성과 분석"
                                                              : tool.toolName === "request_content_post"
                                                                ? "콘텐츠 발행"
                                                                : "포스팅 발행"}
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
                              열기
                            </span>
                          )}
                        </button>
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

      {/* ⌨️ 4. 모바일 터치 최적화 입력창 영역 (Flex 흐름 배치로 모바일 가상 키보드 대응) */}
      <footer className="w-full border-t border-zinc-800 bg-zinc-900/90 p-3 pb-[env(safe-area-inset-bottom)] backdrop-blur-md z-10">
        <form onSubmit={handleSendMessage} className="flex gap-2 items-center">
          <input
            ref={inputRef}
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

"use client";

/* eslint-disable react-hooks/exhaustive-deps, react-hooks/immutability */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  Bot,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  FileText,
  Loader2,
  MessageSquare,
  RefreshCw,
  Search,
  ShieldCheck
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import type {
  AgentApproval,
  AgentApprovalSummary,
  AgentCommandCenter,
  AgentMemory,
  AgentMemorySummary,
  AgentMonitorSnapshot
} from "@/types/admin-bot";

type DashboardSection = "today" | "approvals" | "status" | "memories" | "guide";

const HIGH_RISK_ACTIONS = new Set(["flush_old_cache", "flush_player_cache", "flush_match_cache", "reset_benchmarks"]);
const MEMORY_CATEGORIES = ["all", "incident", "policy", "report", "content", "operations"];

export default function AdminDashboardPage() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [activeSection, setActiveSection] = useState<DashboardSection>("today");
  const [commandCenter, setCommandCenter] = useState<AgentCommandCenter | null>(null);
  const [approvals, setApprovals] = useState<AgentApproval[]>([]);
  const [approvalSummary, setApprovalSummary] = useState<AgentApprovalSummary | null>(null);
  const [selectedApprovalId, setSelectedApprovalId] = useState<string | null>(null);
  const [showProcessedApprovals, setShowProcessedApprovals] = useState(false);
  const [showDeveloperInfo, setShowDeveloperInfo] = useState(false);
  const [approvalLoadingId, setApprovalLoadingId] = useState<string | null>(null);
  const [approvalNotice, setApprovalNotice] = useState<string | null>(null);
  const [memories, setMemories] = useState<AgentMemory[]>([]);
  const [memorySummary, setMemorySummary] = useState<AgentMemorySummary | null>(null);
  const [memoryQuery, setMemoryQuery] = useState("");
  const [memoryCategory, setMemoryCategory] = useState("all");
  const [memoryIncludeInactive, setMemoryIncludeInactive] = useState(false);
  const [memoryLoadingId, setMemoryLoadingId] = useState<string | null>(null);
  const [monitorSnapshot, setMonitorSnapshot] = useState<AgentMonitorSnapshot | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [monitorLoading, setMonitorLoading] = useState(false);

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
    const params = new URLSearchParams(window.location.search);
    const section = normalizeSection(params.get("section"));
    const approvalId = params.get("approval");
    setActiveSection(section);
    if (approvalId) {
      setActiveSection("approvals");
      setSelectedApprovalId(approvalId);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) refreshDashboard();
  }, [isAdmin]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const approvalId = params.get("approval");
    if (!approvalId || approvals.length === 0) return;
    const target = approvals.find((approval) => approval.id === approvalId);
    if (target && target.status !== "pending") setShowProcessedApprovals(true);
    if (target) setSelectedApprovalId(approvalId);
  }, [approvals]);

  const pendingApprovals = useMemo(
    () => approvals.filter((approval) => approval.status === "pending"),
    [approvals]
  );

  const processedApprovals = useMemo(
    () => approvals.filter((approval) => approval.status !== "pending"),
    [approvals]
  );

  const visibleApprovals = showProcessedApprovals ? processedApprovals : pendingApprovals;
  const selectedApproval = visibleApprovals.find((approval) => approval.id === selectedApprovalId)
    || visibleApprovals[0]
    || null;

  const todayItems = [
    ...(commandCenter?.todayActionBoard?.lanes.doNow || []),
    ...(commandCenter?.todayActionBoard?.lanes.review || [])
  ].slice(0, 4);

  const traffic = commandCenter?.trafficSummary;
  const memoryCount = memorySummary?.active ?? commandCenter?.memories?.items?.length ?? 0;

  const refreshDashboard = async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadCommandCenter(), loadApprovals(), loadMemories()]);
    } finally {
      setRefreshing(false);
    }
  };

  const loadCommandCenter = async () => {
    const response = await fetch("/api/admin/agent/command-center");
    if (!response.ok) return;
    const data = await response.json();
    setCommandCenter(data);
  };

  const loadApprovals = async () => {
    const response = await fetch("/api/admin/agent/approvals");
    if (!response.ok) return;
    const data = await response.json();
    const nextApprovals: AgentApproval[] = data.approvals || [];
    setApprovals(nextApprovals);
    setApprovalSummary(data.summary || null);
    setSelectedApprovalId((current) => {
      if (current && nextApprovals.some((approval) => approval.id === current)) return current;
      return nextApprovals.find((approval) => approval.status === "pending")?.id || nextApprovals[0]?.id || null;
    });
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
      await Promise.all([loadCommandCenter(), loadApprovals()]);
      setActiveSection("status");
      updateSectionUrl("status");
    } catch (error: any) {
      alert(error.message || "수동 운영 점검에 실패했습니다.");
    } finally {
      setMonitorLoading(false);
    }
  };

  const handleApprovalAction = async (approval: AgentApproval, action: "approve" | "reject") => {
    const fetchOptions: RequestInit = { method: "POST" };

    if (action === "reject") {
      const reason = window.prompt("거절 사유를 짧게 적어주세요.", "");
      if (reason === null) return;
      fetchOptions.headers = { "Content-Type": "application/json" };
      fetchOptions.body = JSON.stringify({ reason: reason.trim() || "관리자 거절" });
    } else {
      const highRisk = isHighRiskApproval(approval);
      if (highRisk) {
        const ok = window.confirm(`위험 작업입니다.\n${getApprovalOutcomeText(approval)}\n정말 실행할까요?`);
        if (!ok) return;
        fetchOptions.headers = { "Content-Type": "application/json" };
        fetchOptions.body = JSON.stringify({
          confirmedImpact: true,
          approvalNote: "운영 대시보드에서 위험 작업 재확인 후 승인"
        });
      }
    }

    setApprovalLoadingId(approval.id);
    try {
      const response = await fetch(`/api/admin/agent/approvals/${approval.id}/${action}`, fetchOptions);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "승인 요청 처리에 실패했습니다.");
      }
      const body = await response.json().catch(() => ({}));
      await Promise.all([loadApprovals(), loadCommandCenter(), loadMemories()]);
      setShowProcessedApprovals(true);
      setSelectedApprovalId(approval.id);
      setApprovalNotice(action === "approve"
        ? body.result?.execution?.message || "수락한 작업이 실행되었습니다."
        : body.result?.reason ? `거절됨: ${body.result.reason}` : "승인 요청을 거절했습니다.");
    } catch (error: any) {
      alert(error.message || "승인 요청 처리에 실패했습니다.");
    } finally {
      setApprovalLoadingId(null);
    }
  };

  const handleDeactivateMemory = async (id: string) => {
    if (!confirm("이 내부 기록을 숨길까요? 삭제가 아니라 기본 목록에서만 숨깁니다.")) return;
    setMemoryLoadingId(id);
    try {
      const response = await fetch(`/api/admin/agent/memories/${id}/deactivate`, { method: "POST" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || "내부 기록 숨기기에 실패했습니다.");
      }
      await Promise.all([loadMemories(), loadCommandCenter()]);
    } catch (error: any) {
      alert(error.message || "내부 기록 숨기기에 실패했습니다.");
    } finally {
      setMemoryLoadingId(null);
    }
  };

  const selectSection = (section: DashboardSection) => {
    setActiveSection(section);
    updateSectionUrl(section);
  };

  const updateSectionUrl = (section: DashboardSection) => {
    router.replace(`/admin/dashboard?section=${section}`, { scroll: false });
  };

  const selectApproval = (approval: AgentApproval) => {
    setSelectedApprovalId(approval.id);
    setShowDeveloperInfo(false);
    router.replace(`/admin/dashboard?section=approvals&approval=${approval.id}`, { scroll: false });
  };

  const openBotPrompt = (prompt: string) => {
    router.push(`/admin/bot?prompt=${encodeURIComponent(prompt)}`);
  };

  if (isAdmin === null) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-zinc-950 text-zinc-400">
        <Loader2 className="mr-2 h-6 w-6 animate-spin text-amber-500" />
        <span className="text-sm font-medium">관리자 권한 조회 중...</span>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-x-hidden overflow-y-auto bg-zinc-950 pb-8 text-zinc-50">
      <header className="sticky top-0 z-20 border-b border-zinc-800 bg-zinc-950/95 px-3 py-3 backdrop-blur sm:px-5">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <button
              onClick={() => router.push("/admin/bot")}
              className="rounded-full p-2 text-zinc-400 active:bg-zinc-800 active:text-zinc-100"
              title="AI 비서로 돌아가기"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-base font-bold text-zinc-100">운영 대시보드</h1>
              <p className="truncate text-xs text-zinc-500">승인, 점검, 내부 기록을 여기서 처리합니다.</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => router.push("/admin/bot")}
              className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-300 active:border-amber-400"
            >
              <MessageSquare className="h-4 w-4" />
              <span className="hidden sm:inline">AI 비서</span>
            </button>
            <button
              onClick={refreshDashboard}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 rounded-full border border-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-300 active:border-zinc-600 disabled:opacity-50"
            >
              {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="hidden sm:inline">새로고침</span>
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-4 px-3 py-4 sm:px-5">
        <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard
            label="승인 대기"
            value={pendingApprovals.length}
            detail={`위험 ${approvalSummary?.highRiskCount || 0} · 오래됨 ${approvalSummary?.staleCount || 0}`}
            tone={pendingApprovals.length > 0 ? "amber" : "emerald"}
            onClick={() => selectSection("approvals")}
          />
          <SummaryCard
            label="운영 상태"
            value={commandCenter ? severityLabel(commandCenter.severity) : "-"}
            detail={commandCenter?.operatingMode?.summary || "수동 점검으로 최신 상태 확인"}
            tone={commandCenter?.severity === "critical" ? "rose" : commandCenter?.severity === "warn" ? "amber" : "emerald"}
            onClick={() => selectSection("status")}
          />
          <SummaryCard
            label="내부 기록"
            value={memoryCount}
            detail={memorySummary?.latestUpdatedAt ? `마지막 저장 ${formatDateTime(memorySummary.latestUpdatedAt)}` : "비공개 운영일지"}
            tone="sky"
            onClick={() => selectSection("memories")}
          />
          <SummaryCard
            label="유저 활동"
            value={traffic?.status === "ready" ? traffic.current.uniqueSessions : "-"}
            detail={traffic?.status === "ready" ? `페이지뷰 ${traffic.current.pageViews} · 전적검색 ${traffic.current.statsSearches}` : "수집 데이터 확인"}
            tone={traffic?.status === "unavailable" ? "amber" : "zinc"}
            onClick={() => selectSection("status")}
          />
        </section>

        <nav className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {([
            ["today", "오늘 할 일", ClipboardCheck],
            ["approvals", "승인 대기", ShieldCheck],
            ["status", "운영 상태", Activity],
            ["memories", "내부 기록", FileText],
            ["guide", "사용 가이드", Bot]
          ] as Array<[DashboardSection, string, typeof ClipboardCheck]>).map(([section, label, Icon]) => (
            <button
              key={section}
              onClick={() => selectSection(section)}
              className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${
                activeSection === section
                  ? "border-amber-500/50 bg-amber-500/10 text-amber-200"
                  : "border-zinc-800 bg-zinc-900 text-zinc-400 active:border-zinc-600"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </nav>

        {activeSection === "today" && (
          <section className="space-y-3">
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-base font-bold text-zinc-100">오늘 할 일</h2>
                  <p className="mt-1 text-xs text-zinc-500">급한 승인과 운영 점검만 먼저 보면 됩니다.</p>
                </div>
                <button
                  onClick={runManualMonitor}
                  disabled={monitorLoading}
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs font-semibold text-sky-300 disabled:opacity-50"
                >
                  {monitorLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
                  수동 운영 점검
                </button>
              </div>
            </div>

            {pendingApprovals.length > 0 && (
              <section className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-amber-100">먼저 볼 승인</h3>
                    <p className="mt-1 text-xs text-amber-100/65">삭제, 발행, 저장 같은 실제 변경 전 확인입니다.</p>
                  </div>
                  <button
                    onClick={() => selectSection("approvals")}
                    className="shrink-0 rounded-md bg-amber-500 px-3 py-2 text-xs font-bold text-zinc-950"
                  >
                    보기
                  </button>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  {pendingApprovals.slice(0, 2).map((approval) => (
                    <ApprovalMiniCard key={approval.id} approval={approval} onClick={() => selectApproval(approval)} />
                  ))}
                </div>
              </section>
            )}

            <div className="grid gap-3 lg:grid-cols-2">
              <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
                <h3 className="text-sm font-bold text-zinc-100">AI에게 맡길 일</h3>
                <div className="mt-3 grid gap-2">
                  {(todayItems.length > 0 ? todayItems : fallbackActionItems()).map((item) => (
                    <button
                      key={item.prompt}
                      onClick={() => openBotPrompt(item.prompt)}
                      className="rounded-md border border-zinc-800 bg-zinc-950 p-3 text-left active:border-amber-500"
                    >
                      <p className="text-xs font-semibold text-zinc-100">{translateSignal(item.title)}</p>
                      <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">{translateSignal(item.reason)}</p>
                      <p className="mt-2 text-[11px] font-semibold text-amber-300">AI 비서에 입력하기</p>
                    </button>
                  ))}
                </div>
              </section>

              <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
                <h3 className="text-sm font-bold text-zinc-100">마감 전에 확인할 것</h3>
                <div className="mt-3 space-y-2 text-xs leading-relaxed text-zinc-300">
                  <ChecklistLine ok={pendingApprovals.length === 0} text={pendingApprovals.length === 0 ? "승인 대기 작업 없음" : `승인 대기 ${pendingApprovals.length}건 확인 필요`} />
                  <ChecklistLine ok={commandCenter?.severity === "ok"} text={`운영 상태 ${commandCenter ? severityLabel(commandCenter.severity) : "확인 전"}`} />
                  <ChecklistLine ok={(commandCenter?.failedRuns.count || 0) === 0} text={`실패한 Agent 실행 ${commandCenter?.failedRuns.count || 0}건`} />
                  <ChecklistLine ok={(commandCenter?.apiErrors.total || 0) === 0} text={`PUBG API 에러 ${commandCenter?.apiErrors.total || 0}건`} />
                </div>
              </section>
            </div>
          </section>
        )}

        {activeSection === "approvals" && (
          <section className="space-y-3">
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-base font-bold text-zinc-100">승인 대기</h2>
                  <p className="mt-1 text-xs text-zinc-500">
                    기본은 지금 수락할 작업만 보여줍니다. 완료된 기록은 필요할 때만 열어보세요.
                  </p>
                </div>
                <button
                  onClick={() => setShowProcessedApprovals((value) => !value)}
                  className={`rounded-md border px-3 py-2 text-xs font-semibold ${
                    showProcessedApprovals
                      ? "border-zinc-600 bg-zinc-800 text-zinc-100"
                      : "border-zinc-800 text-zinc-400"
                  }`}
                >
                  {showProcessedApprovals ? "대기만 보기" : "처리됨 보기"}
                </button>
              </div>
            </div>

            {approvalNotice && (
              <div className="flex items-start justify-between gap-3 rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-3 text-xs text-emerald-100">
                <p className="whitespace-pre-wrap leading-relaxed">{approvalNotice}</p>
                <button onClick={() => setApprovalNotice(null)} className="shrink-0 text-emerald-300">닫기</button>
              </div>
            )}

            <div className="grid gap-3 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
              <div className="grid gap-2">
                {visibleApprovals.length === 0 ? (
                  <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
                    {showProcessedApprovals ? "처리된 승인 기록이 없습니다." : "지금 수락할 작업이 없습니다."}
                  </div>
                ) : (
                  visibleApprovals.map((approval) => (
                    <button
                      key={approval.id}
                      onClick={() => selectApproval(approval)}
                      className={`rounded-lg border p-3 text-left ${
                        selectedApproval?.id === approval.id
                          ? "border-emerald-500/50 bg-emerald-500/5"
                          : "border-zinc-800 bg-zinc-900 active:border-zinc-600"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-zinc-100">{getApprovalTitle(approval)}</p>
                          <p className="mt-1 text-xs text-zinc-500">{getApprovalActionLabel(approval)} · {formatDateTime(approval.created_at)}</p>
                        </div>
                        <ApprovalDecisionBadge approval={approval} />
                      </div>
                      <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-zinc-400">{getApprovalOutcomeText(approval)}</p>
                    </button>
                  ))
                )}
              </div>

              <div className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
                {selectedApproval ? (
                  <ApprovalDetail
                    approval={selectedApproval}
                    loading={approvalLoadingId === selectedApproval.id}
                    showDeveloperInfo={showDeveloperInfo}
                    onToggleDeveloperInfo={() => setShowDeveloperInfo((value) => !value)}
                    onApprove={() => handleApprovalAction(selectedApproval, "approve")}
                    onReject={() => handleApprovalAction(selectedApproval, "reject")}
                  />
                ) : (
                  <div className="flex min-h-48 items-center justify-center text-center text-sm text-zinc-500">
                    확인할 승인 요청을 선택해 주세요.
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {activeSection === "status" && (
          <section className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="실패한 실행" value={commandCenter?.failedRuns.count ?? "-"} detail="최근 Agent 실행 기준" />
              <MetricCard label="PUBG API 에러" value={commandCenter?.apiErrors.total ?? "-"} detail="최근 운영 창 기준" />
              <MetricCard label="AI 비용" value={commandCenter ? `$${commandCenter.aiUsage.totalCostUsd.toFixed(4)}` : "-"} detail={`${commandCenter?.aiUsage.totalRequests || 0} requests`} />
              <MetricCard label="배포 상태" value={translateStatus(commandCenter?.deploymentHealth?.severity || commandCenter?.rollout?.status || "-")} detail="배포/준비 점검" />
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-bold text-zinc-100">수동 운영 점검</h2>
                    <p className="mt-1 text-xs text-zinc-500">Discord 알림은 위험 조건일 때만 전송됩니다.</p>
                  </div>
                  <button
                    onClick={runManualMonitor}
                    disabled={monitorLoading}
                    className="inline-flex shrink-0 items-center gap-2 rounded-md border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs font-semibold text-sky-300 disabled:opacity-50"
                  >
                    {monitorLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
                    실행
                  </button>
                </div>
                <StatusSnapshot snapshot={monitorSnapshot} commandCenter={commandCenter} />
              </section>

              <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
                <h2 className="text-sm font-bold text-zinc-100">유저 활동</h2>
                <TrafficSummary commandCenter={commandCenter} />
              </section>
            </div>

            {commandCenter?.latestReport?.item && (
              <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
                <p className="text-xs font-semibold text-zinc-500">최근 운영 일지</p>
                <h3 className="mt-1 text-sm font-bold text-zinc-100">{commandCenter.latestReport.item.title}</h3>
                <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-relaxed text-zinc-400">{commandCenter.latestReport.item.body}</p>
              </section>
            )}
          </section>
        )}

        {activeSection === "memories" && (
          <section className="space-y-3">
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
              <h2 className="text-base font-bold text-zinc-100">내부 기록</h2>
              <p className="mt-1 text-xs text-zinc-500">AI 비서가 참고하는 비공개 운영일지와 운영 기준입니다.</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-4">
                <MetricCard label="저장된 기록" value={memorySummary?.total ?? memories.length} detail="전체" />
                <MetricCard label="사용 중" value={memorySummary?.active ?? "-"} detail="AI가 참고" />
                <MetricCard label="숨김" value={memorySummary?.inactive ?? "-"} detail="기본 검색 제외" />
                <MetricCard label="마지막 저장" value={memorySummary?.latestUpdatedAt ? formatDateTime(memorySummary.latestUpdatedAt) : "-"} detail="최근 갱신" />
              </div>
            </div>

            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
              <div className="flex gap-2">
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-zinc-600" />
                  <input
                    type="search"
                    value={memoryQuery}
                    onChange={(event) => setMemoryQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") loadMemories();
                    }}
                    placeholder="장애, 정책, 태그 검색"
                    className="w-full rounded-md border border-zinc-800 bg-zinc-950 py-2 pl-9 pr-3 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-sky-500 focus:outline-none"
                  />
                </div>
                <button
                  onClick={() => loadMemories()}
                  className="shrink-0 rounded-md bg-sky-500 px-3 py-2 text-xs font-bold text-zinc-950"
                >
                  검색
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {MEMORY_CATEGORIES.map((category) => (
                  <button
                    key={category}
                    onClick={() => {
                      setMemoryCategory(category);
                      loadMemories({ category });
                    }}
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                      memoryCategory === category
                        ? "border-sky-500/50 bg-sky-500/10 text-sky-300"
                        : "border-zinc-800 bg-zinc-950 text-zinc-500"
                    }`}
                  >
                    {getMemoryCategoryLabel(category)}
                  </button>
                ))}
                <label className="flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-[11px] text-zinc-500">
                  <input
                    type="checkbox"
                    checked={memoryIncludeInactive}
                    onChange={(event) => {
                      setMemoryIncludeInactive(event.target.checked);
                      loadMemories({ includeInactive: event.target.checked });
                    }}
                    className="h-3 w-3 accent-sky-500"
                  />
                  숨긴 기록 포함
                </label>
              </div>
            </div>

            <div className="grid gap-2 lg:grid-cols-2">
              {memories.length === 0 ? (
                <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-500">
                  조건에 맞는 내부 기록이 없습니다.
                </div>
              ) : memories.map((memory) => (
                <article key={memory.id} className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-bold text-zinc-100">{memory.title}</p>
                      <p className="mt-1 text-xs text-zinc-500">{getMemoryCategoryLabel(memory.category)} · {formatDateTime(memory.updated_at)}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-zinc-800 px-2 py-1 text-[10px] font-semibold text-zinc-400">
                      {getMemoryCategoryLabel(memory.category)}
                    </span>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap break-words text-xs leading-relaxed text-zinc-400">{memory.body}</p>
                  {Array.isArray(memory.metadata?.tags) && memory.metadata.tags.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {memory.metadata.tags.slice(0, 5).map((tag: string) => (
                        <span key={tag} className="rounded bg-zinc-950 px-2 py-1 text-[10px] text-zinc-500">{tag}</span>
                      ))}
                    </div>
                  )}
                  <div className="mt-3 flex justify-end">
                    {memory.metadata?.active === false ? (
                      <span className="rounded-md border border-zinc-800 px-2 py-1 text-xs text-zinc-600">숨김 상태</span>
                    ) : (
                      <button
                        onClick={() => handleDeactivateMemory(memory.id)}
                        disabled={memoryLoadingId === memory.id}
                        className="rounded-md border border-zinc-800 px-2 py-1 text-xs text-zinc-500 active:border-rose-500 active:text-rose-400 disabled:opacity-50"
                      >
                        기록 숨기기
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {activeSection === "guide" && (
          <section className="grid gap-3 lg:grid-cols-2">
            {[
              {
                title: "하루 시작",
                body: "수동 운영 점검을 누르고, 이상이 있으면 30초 브리핑을 요청합니다.",
                prompt: "30초 운영자 브리핑으로 지금 할 일만 알려줘"
              },
              {
                title: "문제 발생",
                body: "PUBG API 에러, AI 비용, 배포 상태 중 무엇이 문제인지 AI에게 먼저 요약시킵니다.",
                prompt: "최근 PUBG API 에러와 AI 비용을 같이 점검해줘"
              },
              {
                title: "승인 판단",
                body: "모르면 수락하지 말고, 승인 요청을 쉽게 설명해달라고 물어봅니다.",
                prompt: "승인 대기 요청을 승인/거절/보류 권고로 나눠줘"
              },
              {
                title: "마감 점검",
                body: "운영 상태가 정상이라면 비공개 운영 일지 저장 요청만 만들어 둡니다.",
                prompt: "오늘 운영 브리핑을 리포트로 저장 요청해줘"
              }
            ].map((item) => (
              <article key={item.title} className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
                <h2 className="text-sm font-bold text-zinc-100">{item.title}</h2>
                <p className="mt-2 text-xs leading-relaxed text-zinc-400">{item.body}</p>
                <button
                  onClick={() => openBotPrompt(item.prompt)}
                  className="mt-4 inline-flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-300 active:border-amber-400"
                >
                  AI 비서에 입력
                  <ChevronRight className="h-4 w-4" />
                </button>
              </article>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  detail,
  tone = "zinc",
  onClick
}: {
  label: string;
  value: React.ReactNode;
  detail: string;
  tone?: "zinc" | "amber" | "emerald" | "rose" | "sky";
  onClick: () => void;
}) {
  const toneClass = {
    zinc: "border-zinc-800 bg-zinc-900 text-zinc-100",
    amber: "border-amber-500/25 bg-amber-500/5 text-amber-100",
    emerald: "border-emerald-500/25 bg-emerald-500/5 text-emerald-100",
    rose: "border-rose-500/25 bg-rose-500/5 text-rose-100",
    sky: "border-sky-500/25 bg-sky-500/5 text-sky-100"
  }[tone];

  return (
    <button onClick={onClick} className={`min-w-0 rounded-lg border p-4 text-left ${toneClass}`}>
      <p className="text-[11px] font-semibold text-zinc-500">{label}</p>
      <p className="mt-2 truncate text-2xl font-bold">{value}</p>
      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-zinc-500">{detail}</p>
    </button>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: React.ReactNode; detail: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-900 p-4">
      <p className="text-[11px] font-semibold text-zinc-500">{label}</p>
      <p className="mt-2 break-words text-xl font-bold text-zinc-100">{value}</p>
      <p className="mt-1 text-xs text-zinc-500">{detail}</p>
    </div>
  );
}

function ApprovalMiniCard({ approval, onClick }: { approval: AgentApproval; onClick: () => void }) {
  return (
    <button onClick={onClick} className="rounded-md border border-amber-500/20 bg-zinc-950/70 p-3 text-left active:border-amber-400">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-zinc-100">{getApprovalTitle(approval)}</p>
          <p className="mt-1 text-[11px] text-zinc-500">{getApprovalActionLabel(approval)}</p>
        </div>
        <ApprovalDecisionBadge approval={approval} />
      </div>
      <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-amber-100/70">{getApprovalOutcomeText(approval)}</p>
    </button>
  );
}

function ApprovalDetail({
  approval,
  loading,
  showDeveloperInfo,
  onToggleDeveloperInfo,
  onApprove,
  onReject
}: {
  approval: AgentApproval;
  loading: boolean;
  showDeveloperInfo: boolean;
  onToggleDeveloperInfo: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const gateBlocked = approval.impact?.executionGate?.status === "block";
  const pending = approval.status === "pending";

  return (
    <div className="space-y-3">
      <div className={`rounded-lg border p-3 ${decisionTone(approval)}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold">{getApprovalDecisionLabel(approval)}</p>
            <p className="mt-1 break-words text-xs leading-relaxed opacity-85">{getApprovalOutcomeText(approval)}</p>
          </div>
          <ApprovalDecisionBadge approval={approval} />
        </div>
      </div>

      <div>
        <p className="text-base font-bold text-zinc-100">{getApprovalTitle(approval)}</p>
        <p className="mt-1 text-xs text-zinc-500">{getApprovalActionLabel(approval)} · {formatDateTime(approval.created_at)}</p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <InfoBox label="위험도" value={approval.impact ? translateStatus(approval.impact.risk) : "확인 필요"} />
        <InfoBox label="수락 가능 여부" value={approval.impact?.executionGate ? translateStatus(approval.impact.executionGate.status) : "확인 필요"} />
      </div>

      {approval.payload?.reason && (
        <div className="rounded-md border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-100">
          <p className="mb-1 font-semibold text-amber-300">요청 사유</p>
          <p className="break-words leading-relaxed">{approval.payload.reason}</p>
        </div>
      )}

      {approval.impact?.summary && (
        <div className="rounded-md border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-300">
          <p className="mb-1 font-semibold text-zinc-100">수락하면 바뀌는 것</p>
          <p className="break-words leading-relaxed">{translateSignal(approval.impact.summary)}</p>
          {typeof approval.impact.estimatedRows === "number" && (
            <p className="mt-2 text-zinc-500">예상 영향: {approval.impact.estimatedRows.toLocaleString("ko-KR")}개 행</p>
          )}
        </div>
      )}

      {approval.impact?.preview && (
        <div className="rounded-md border border-sky-500/20 bg-sky-500/5 p-3 text-xs text-sky-100">
          <p className="mb-2 font-semibold text-sky-300">수락 전 미리보기</p>
          <p className="break-words font-semibold">{translateSignal(approval.impact.preview.headline)}</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {approval.impact.preview.items.map((item, index) => (
              <InfoBox key={`${item.label}-${index}`} label={translateSignal(item.label)} value={translateSignal(String(item.value))} />
            ))}
          </div>
          {approval.impact.preview.bodyPreview && (
            <p className="mt-2 max-h-32 overflow-y-auto whitespace-pre-wrap break-words rounded bg-zinc-950/70 p-2 leading-relaxed">
              {approval.impact.preview.bodyPreview}
            </p>
          )}
        </div>
      )}

      {(approval.result || approval.error) && (
        <div className={`rounded-md border p-3 text-xs ${
          approval.error ? "border-rose-500/25 bg-rose-500/5 text-rose-100" : "border-emerald-500/25 bg-emerald-500/5 text-emerald-100"
        }`}>
          <p className="mb-1 font-semibold">{approval.error ? "오류" : "실행 결과"}</p>
          <p className="whitespace-pre-wrap break-words leading-relaxed">{approval.error || formatApprovalResult(approval.result)}</p>
        </div>
      )}

      <div className="rounded-md border border-zinc-800 bg-zinc-950 p-3">
        <button onClick={onToggleDeveloperInfo} className="flex w-full items-center justify-between gap-2 text-left text-xs font-semibold text-zinc-300">
          <span>개발자 정보 보기</span>
          <span className="text-[10px] text-zinc-500">{showDeveloperInfo ? "접기" : "펼치기"}</span>
        </button>
        {showDeveloperInfo && (
          <pre className="mt-3 max-h-56 overflow-y-auto whitespace-pre-wrap break-words rounded border border-zinc-800 bg-zinc-900 p-2 text-[11px] leading-relaxed text-zinc-400">
            {JSON.stringify({ payload: approval.payload, impact: approval.impact, result: safeJsonParseText(approval.result), error: approval.error }, null, 2)}
          </pre>
        )}
      </div>

      {pending && (
        <div className="sticky bottom-3 grid gap-2 rounded-lg border border-zinc-800 bg-zinc-950/95 p-2 shadow-lg shadow-black/30 backdrop-blur sm:grid-cols-2">
          <button
            onClick={onReject}
            disabled={loading}
            className="rounded-md bg-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-300 disabled:opacity-50"
          >
            거절
          </button>
          <button
            onClick={onApprove}
            disabled={loading || gateBlocked}
            className={`rounded-md px-3 py-2 text-xs font-bold disabled:opacity-50 ${
              isHighRiskApproval(approval) ? "bg-rose-500 text-white" : "bg-emerald-500 text-zinc-950"
            }`}
          >
            {loading ? "처리 중..." : gateBlocked ? "수락 불가" : isHighRiskApproval(approval) ? "위험 작업 수락" : "수락하고 실행"}
          </button>
        </div>
      )}
    </div>
  );
}

function InfoBox({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-md bg-zinc-950/70 p-2">
      <p className="text-[10px] font-semibold text-zinc-500">{label}</p>
      <p className="mt-1 break-words text-xs text-zinc-100">{value}</p>
    </div>
  );
}

function ApprovalDecisionBadge({ approval }: { approval: AgentApproval }) {
  const label = getApprovalDecisionLabel(approval);
  const className = approval.status !== "pending"
    ? "bg-zinc-800 text-zinc-400"
    : approval.impact?.executionGate?.status === "block"
      ? "bg-rose-500/10 text-rose-300"
      : isHighRiskApproval(approval) || approval.impact?.executionGate?.status === "review"
        ? "bg-amber-500/10 text-amber-300"
        : "bg-emerald-500/10 text-emerald-300";
  return <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${className}`}>{label}</span>;
}

function ChecklistLine({ ok, text }: { ok: boolean; text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md bg-zinc-950 p-2">
      {ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />}
      <span>{text}</span>
    </div>
  );
}

function StatusSnapshot({ snapshot, commandCenter }: { snapshot: AgentMonitorSnapshot | null; commandCenter: AgentCommandCenter | null }) {
  const severity = snapshot?.severity || commandCenter?.severity;
  const alerts = snapshot?.alerts || [];

  return (
    <div className="mt-4 space-y-2 text-xs text-zinc-300">
      <InfoBox label="현재 상태" value={severity ? severityLabel(severity) : "점검 전"} />
      {alerts.length > 0 ? alerts.slice(0, 4).map((alert, index) => (
        <div key={`${alert.type}-${index}`} className="rounded-md border border-amber-500/20 bg-amber-500/5 p-2 text-amber-100">
          <p className="font-semibold">{translateSignal(alert.message)}</p>
          {alert.value !== undefined && <p className="mt-1 opacity-75">값: {String(alert.value)}</p>}
        </div>
      )) : (
        <p className="rounded-md bg-zinc-950 p-2 text-zinc-500">위험 알림이 없으면 Discord 알림은 보내지 않습니다.</p>
      )}
      {(snapshot?.recommendations || []).slice(0, 3).map((item) => (
        <p key={item} className="rounded-md bg-zinc-950 p-2 text-zinc-400">{translateSignal(item)}</p>
      ))}
    </div>
  );
}

function TrafficSummary({ commandCenter }: { commandCenter: AgentCommandCenter | null }) {
  const traffic = commandCenter?.trafficSummary;
  if (!traffic || traffic.status !== "ready") {
    return (
      <p className="mt-3 rounded-md bg-zinc-950 p-3 text-xs leading-relaxed text-zinc-500">
        {traffic?.status === "empty" ? "아직 수집된 활동 데이터가 없습니다." : "유저 활동 집계를 확인할 수 없습니다."}
      </p>
    );
  }

  return (
    <div className="mt-3 space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <InfoBox label="방문 세션" value={traffic.current.uniqueSessions} />
        <InfoBox label="페이지뷰" value={traffic.current.pageViews} />
        <InfoBox label="회원/비회원" value={`${traffic.current.memberSessions}/${traffic.current.guestSessions}`} />
        <InfoBox label="전적 검색" value={traffic.current.statsSearches} />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <TopList title="인기 페이지" items={traffic.current.topPages.slice(0, 3)} />
        <TopList title="인기 기능" items={traffic.current.topFeatures.slice(0, 3)} />
      </div>
      {traffic.current.topUsers.length > 0 && (
        <TopList
          title="활동 많은 로그인 유저"
          items={traffic.current.topUsers.slice(0, 3).map((user) => ({
            label: user.nickname || user.pubgNickname || user.label || user.userId,
            count: user.eventCount
          }))}
        />
      )}
    </div>
  );
}

function TopList({ title, items }: { title: string; items: Array<{ label: string; count: number }> }) {
  return (
    <div className="rounded-md bg-zinc-950 p-3">
      <p className="mb-2 text-[10px] font-semibold text-zinc-500">{title}</p>
      {items.length === 0 ? (
        <p className="text-xs text-zinc-600">데이터 없음</p>
      ) : items.map((item) => (
        <div key={item.label} className="flex items-center justify-between gap-2 py-1 text-xs">
          <span className="min-w-0 truncate text-zinc-300">{item.label}</span>
          <span className="shrink-0 text-zinc-500">{item.count}</span>
        </div>
      ))}
    </div>
  );
}

function normalizeSection(value: string | null): DashboardSection {
  if (value === "approvals" || value === "status" || value === "memories" || value === "guide" || value === "today") return value;
  return "today";
}

function fallbackActionItems() {
  return [
    {
      title: "30초 운영자 브리핑",
      reason: "오늘 먼저 봐야 할 일만 짧게 정리합니다.",
      prompt: "30초 운영자 브리핑으로 지금 할 일만 알려줘"
    },
    {
      title: "PUBG API와 AI 비용 점검",
      reason: "호출 한도와 비용 이상 여부를 같이 확인합니다.",
      prompt: "최근 PUBG API 에러와 AI 비용을 같이 점검해줘"
    }
  ];
}

function isHighRiskApproval(approval: AgentApproval) {
  return approval.impact?.risk === "high" || HIGH_RISK_ACTIONS.has(approval.action_type);
}

function getApprovalDecisionLabel(approval: AgentApproval) {
  if (approval.status !== "pending") return approval.status === "failed" ? "실패 기록" : approval.status === "rejected" ? "거절됨" : "처리 완료";
  if (approval.impact?.executionGate?.status === "block") return "수락 불가";
  if (isHighRiskApproval(approval) || approval.impact?.executionGate?.status === "review") return "검토 필요";
  return "수락 가능";
}

function decisionTone(approval: AgentApproval) {
  if (approval.status !== "pending") return "border-zinc-800 bg-zinc-950 text-zinc-300";
  if (approval.impact?.executionGate?.status === "block") return "border-rose-500/25 bg-rose-500/5 text-rose-100";
  if (isHighRiskApproval(approval) || approval.impact?.executionGate?.status === "review") return "border-amber-500/25 bg-amber-500/5 text-amber-100";
  return "border-emerald-500/25 bg-emerald-500/5 text-emerald-100";
}

function getApprovalTitle(approval: AgentApproval) {
  return approval.payload?.title || approval.payload?.cleanupType || approval.action_type;
}

function getApprovalActionLabel(approval: AgentApproval) {
  const map: Record<string, string> = {
    save_agent_memory: "내부 기록 저장",
    save_agent_report: "운영 일지 저장",
    create_board_post: "게시글 발행",
    flush_old_cache: "오래된 캐시 정리",
    flush_player_cache: "플레이어 캐시 정리",
    flush_match_cache: "매치 캐시 정리",
    reset_benchmarks: "벤치마크 초기화"
  };
  return map[approval.action_type] || translateSignal(approval.action_type);
}

function getApprovalOutcomeText(approval: AgentApproval) {
  if (approval.impact?.executionGate?.status === "block") {
    return approval.impact.executionGate.label || "필수 조건을 통과하지 못해 지금은 수락할 수 없습니다.";
  }
  if (approval.action_type === "create_board_post") return "수락하면 게시판에 글이 공개됩니다.";
  if (approval.action_type === "save_agent_memory") return "수락하면 AI 비서가 참고하는 비공개 운영 기준이 저장됩니다.";
  if (approval.action_type === "save_agent_report") return "수락하면 오늘 운영 상태가 비공개 운영 일지로 저장됩니다.";
  if (approval.action_type === "flush_old_cache") return "수락하면 오래된 분석 캐시가 삭제됩니다.";
  if (approval.action_type === "flush_player_cache") return "수락하면 특정 플레이어의 분석 캐시가 삭제됩니다.";
  if (approval.action_type === "flush_match_cache") return "수락하면 특정 매치 분석 캐시와 저장 파일이 정리됩니다.";
  if (approval.action_type === "reset_benchmarks") return "수락하면 벤치마크 데이터가 초기화됩니다.";
  return approval.impact?.summary || "수락하면 요청된 관리자 작업이 실행됩니다.";
}

function formatApprovalResult(value?: string | null) {
  if (!value) return "";
  try {
    const parsed = JSON.parse(value);
    if (parsed?.rejected) return `거절됨: ${parsed.reason || "사유 미입력"}`;
    const lines = [];
    if (parsed?.execution?.message) lines.push(parsed.execution.message);
    else if (parsed?.execution?.success) lines.push("승인 작업이 실행되었습니다.");
    if (parsed?.postExecution?.outcome) lines.push(`결과 요약: ${parsed.postExecution.outcome}`);
    if (parsed?.postExecution?.metrics?.length) {
      lines.push(`핵심 수치: ${parsed.postExecution.metrics.map((item: any) => `${item.label} ${item.value}`).join(" · ")}`);
    }
    if (parsed?.postExecution?.followUp?.length) {
      lines.push(`후속 점검: ${parsed.postExecution.followUp.join(" / ")}`);
    }
    if (lines.length) return lines.join("\n");
    return JSON.stringify(parsed, null, 2);
  } catch {
    return value;
  }
}

function safeJsonParseText(value?: string | null) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function getMemoryCategoryLabel(category?: string | null) {
  const map: Record<string, string> = {
    all: "전체",
    incident: "장애 대응",
    policy: "운영 기준",
    report: "운영 일지",
    content: "콘텐츠",
    operations: "운영"
  };
  return map[category || ""] || category || "-";
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function severityLabel(value?: string | null) {
  if (value === "ok") return "정상";
  if (value === "warn") return "주의";
  if (value === "critical") return "위험";
  return "-";
}

function translateStatus(value?: string | null) {
  if (!value) return "-";
  const map: Record<string, string> = {
    completed: "완료",
    executed: "완료",
    failed: "실패",
    running: "실행 중",
    pending: "대기",
    approved: "승인됨",
    rejected: "거절됨",
    ok: "정상",
    warn: "주의",
    critical: "위험",
    pass: "통과",
    review: "검토",
    block: "차단",
    high: "높음",
    medium: "중간",
    low: "낮음",
    ready: "준비됨",
    fail: "실패"
  };
  return map[value] || value;
}

function translateSignal(value?: string | null) {
  if (!value) return "";
  return value
    .replaceAll("Agent readiness", "에이전트 준비 상태")
    .replaceAll("agent readiness", "에이전트 준비 상태")
    .replaceAll("Rollout Readiness", "배포 전 점검")
    .replaceAll("rollout readiness", "배포 전 점검")
    .replaceAll("approval queue", "승인 대기열")
    .replaceAll("Approval Queue", "승인 대기열")
    .replaceAll("approval", "승인")
    .replaceAll("monitor", "점검")
    .replaceAll("checkout", "마감 점검")
    .replaceAll("critical", "위험")
    .replaceAll("high", "높음")
    .replaceAll("medium", "중간")
    .replaceAll("low", "낮음")
    .replaceAll("ready", "준비됨")
    .replaceAll("failed", "실패")
    .replaceAll("completed", "완료")
    .replaceAll("review", "검토")
    .replaceAll("block", "차단")
    .replaceAll("pass", "통과");
}

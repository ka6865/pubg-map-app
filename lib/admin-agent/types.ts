import type { FunctionDeclaration } from "@google/generative-ai";

export type AgentSafetyLevel = "read" | "write" | "dangerous";
export type AgentToolStatus = "success" | "failed" | "approval_required";

export type AdminAgentContext = {
  supabase: any;
  userId: string;
  runId?: string | null;
  stepId?: string | null;
};

export type AgentToolResult = {
  status: AgentToolStatus;
  result: string;
  approvalId?: string;
};

export type AdminAgentTool = {
  declaration: FunctionDeclaration;
  safetyLevel: AgentSafetyLevel;
  run: (args: any, context: AdminAgentContext) => Promise<AgentToolResult>;
};

export type AgentApprovalPayload = {
  toolName: string;
  actionType: string;
  payload: Record<string, unknown>;
};

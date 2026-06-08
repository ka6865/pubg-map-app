export interface ToolExecution {
  toolName: string;
  status: "running" | "success" | "failed";
  params?: any;
  error?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "model" | "system";
  content: string;
  timestamp: string;
  toolsUsed?: ToolExecution[];
}

export interface BotSettings {
  botName: string;
  systemPrompt: string;
}

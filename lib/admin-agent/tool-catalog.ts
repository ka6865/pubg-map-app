import { adminAgentTools } from "./tools";
import type { AgentSafetyLevel } from "./types";

export type AgentToolCatalogItem = {
  name: string;
  safetyLevel: AgentSafetyLevel;
  description: string;
  parameters: string[];
  approvalRequired: boolean;
};

export type AgentToolCatalog = {
  generatedAt: string;
  total: number;
  counts: Record<AgentSafetyLevel, number>;
  tools: AgentToolCatalogItem[];
};

export function buildAgentToolCatalog(): AgentToolCatalog {
  const tools = Object.entries(adminAgentTools)
    .map(([name, tool]) => {
      const properties = (tool.declaration.parameters as any)?.properties || {};
      return {
        name,
        safetyLevel: tool.safetyLevel,
        description: tool.declaration.description || "",
        parameters: Object.keys(properties),
        approvalRequired: tool.safetyLevel === "dangerous"
      };
    })
    .sort((a, b) => safetyRank(a.safetyLevel) - safetyRank(b.safetyLevel) || a.name.localeCompare(b.name));

  return {
    generatedAt: new Date().toISOString(),
    total: tools.length,
    counts: {
      read: tools.filter((tool) => tool.safetyLevel === "read").length,
      write: tools.filter((tool) => tool.safetyLevel === "write").length,
      dangerous: tools.filter((tool) => tool.safetyLevel === "dangerous").length
    },
    tools
  };
}

function safetyRank(level: AgentSafetyLevel) {
  if (level === "read") return 0;
  if (level === "write") return 1;
  return 2;
}

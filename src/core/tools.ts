import { z } from 'zod';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
}

export type ToolResult = {
  success: boolean;
  output?: any;
  error?: string;
};

export type Permission = string;

export interface ToolPermissions {
  fs?: Permission[];
  net?: Permission[];
  network?: Permission[]; // Alias for net
  inference?: Permission[];
  other?: Record<string, Permission[]>;
}

export const ToolPermissionsSchema = z.object({
  fs: z.array(z.string()).optional(),
  net: z.array(z.string()).optional(),
  network: z.array(z.string()).optional(),
  inference: z.array(z.string()).optional(),
  other: z.record(z.string(), z.array(z.string())).optional(),
});

// Interface for tools with registry context (includes key for permission lookups)
export interface ToolWithContext extends ToolDefinition {
  registryKey: string;
}
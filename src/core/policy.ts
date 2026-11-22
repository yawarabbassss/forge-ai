import { ToolPermissions } from './tools.js';

export class PolicyEngine {
  private permissions: Map<string, ToolPermissions> = new Map();

  registerToolPermissions(toolId: string, permissions: ToolPermissions): void {
    this.permissions.set(toolId, permissions);
  }

  checkPermissions(toolId: string, requestedPermissions: string[]): { allowed: boolean; reason?: string } {
    const toolProfile = this.permissions.get(toolId);

    if (!toolProfile) {
      return {
        allowed: false,
        reason: `Tool '${toolId}' not registered`,
      };
    }

    for (const perm of requestedPermissions) {
      if (!this.hasPermission(toolId, perm, toolProfile)) {
        return {
          allowed: false,
          reason: `Tool '${toolId}' does not have permission: ${perm}`,
        };
      }
    }

    return { allowed: true };
  }

  private hasPermission(toolId: string, requestedPerm: string, toolProfile: ToolPermissions): boolean {
    const allPermissions = [
      ...(toolProfile.fs || []),
      ...(toolProfile.net || []),
      ...(toolProfile.network || []), // Alias support
      ...(toolProfile.inference || []),
      ...(Object.values(toolProfile.other || {}).flat() || []),
    ];

    return allPermissions.includes(requestedPerm);
  }

  unregisterToolPermissions(toolId: string): void {
    this.permissions.delete(toolId);
  }
}
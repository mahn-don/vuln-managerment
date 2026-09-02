import { prisma } from "@/lib/db/prisma";
import { auditService } from "./audit.service";
import { NotFoundError, ValidationError } from "@/lib/api/errors";
import type { Prisma } from "@/generated/prisma";

interface WorkflowStatusDef {
  name: string;
  label: string;
  category: "open" | "in_progress" | "resolved" | "terminal";
  color?: string;
  sortOrder?: number;
  isInitial?: boolean;
  isTerminal?: boolean;
  jiraStatusMapping?: string;
}

interface WorkflowTransitionDef {
  fromStatus: string; // Status name
  toStatus: string;   // Status name
  name?: string;
  requiresComment?: boolean;
  requiredRole?: string;
}

class WorkflowService {
  /**
   * Get the active workflow configuration for an entity type.
   */
  async getWorkflow(entityType: string) {
    const workflow = await prisma.workflowConfig.findFirst({
      where: { entityType, isActive: true, isDefault: true },
      include: {
        statuses: { orderBy: { sortOrder: "asc" } },
        transitions: {
          include: {
            fromStatus: { select: { name: true, label: true } },
            toStatus: { select: { name: true, label: true } },
          },
        },
      },
    });

    return workflow;
  }

  /**
   * Get allowed transitions from a given status.
   */
  async getAllowedTransitions(entityType: string, currentStatus: string, userRole?: string) {
    const workflow = await this.getWorkflow(entityType);

    if (!workflow) {
      // Fallback to hardcoded transitions if no workflow configured
      return this.getHardcodedTransitions(entityType, currentStatus);
    }

    const currentStatusRecord = workflow.statuses.find((s) => s.name === currentStatus);
    if (!currentStatusRecord) return [];

    const transitions = workflow.transitions.filter((t) => t.fromStatusId === currentStatusRecord.id);

    // Filter by role if specified
    return transitions
      .filter((t) => !t.requiredRole || t.requiredRole === userRole)
      .map((t) => ({
        toStatus: t.toStatus.name,
        label: t.name || t.toStatus.label,
        requiresComment: t.requiresComment,
      }));
  }

  /**
   * Validate a status transition.
   */
  async validateTransition(entityType: string, fromStatus: string, toStatus: string, userRole?: string): Promise<boolean> {
    const allowed = await this.getAllowedTransitions(entityType, fromStatus, userRole);
    return allowed.some((t) => t.toStatus === toStatus);
  }

  /**
   * Get the initial status for a workflow.
   */
  async getInitialStatus(entityType: string): Promise<string> {
    const workflow = await this.getWorkflow(entityType);
    if (!workflow) {
      return entityType === "assessment" ? "REQUESTED" : "NEW";
    }

    const initial = workflow.statuses.find((s) => s.isInitial);
    return initial?.name || workflow.statuses[0]?.name || "NEW";
  }

  /**
   * Get Jira status mapping for an internal status.
   */
  async getJiraStatusMapping(entityType: string): Promise<Map<string, string>> {
    const workflow = await this.getWorkflow(entityType);
    if (!workflow) return new Map();

    const mapping = new Map<string, string>();
    for (const status of workflow.statuses) {
      if (status.jiraStatusMapping) {
        mapping.set(status.jiraStatusMapping, status.name); // Jira → internal
      }
    }
    return mapping;
  }

  /**
   * Map a Jira status to internal status.
   */
  async mapJiraStatus(entityType: string, jiraStatus: string): Promise<string | null> {
    const mapping = await this.getJiraStatusMapping(entityType);
    return mapping.get(jiraStatus) || null;
  }

  /**
   * Create or update a workflow configuration.
   */
  async upsertWorkflow(
    entityType: string,
    name: string,
    statuses: WorkflowStatusDef[],
    transitions: WorkflowTransitionDef[],
    userId: string
  ) {
    // Deactivate existing default workflow
    await prisma.workflowConfig.updateMany({
      where: { entityType, isDefault: true },
      data: { isDefault: false },
    });

    const workflow = await prisma.workflowConfig.create({
      data: {
        entityType,
        name,
        isDefault: true,
        isActive: true,
        statuses: {
          create: statuses.map((s, i) => ({
            name: s.name,
            label: s.label,
            category: s.category,
            color: s.color,
            sortOrder: s.sortOrder ?? i * 10,
            isInitial: s.isInitial ?? false,
            isTerminal: s.isTerminal ?? false,
            jiraStatusMapping: s.jiraStatusMapping,
          })),
        },
      },
      include: { statuses: true },
    });

    // Create transitions using the created status IDs
    const statusMap = new Map(workflow.statuses.map((s) => [s.name, s.id]));

    for (const t of transitions) {
      const fromId = statusMap.get(t.fromStatus);
      const toId = statusMap.get(t.toStatus);
      if (fromId && toId) {
        await prisma.workflowTransition.create({
          data: {
            workflowId: workflow.id,
            fromStatusId: fromId,
            toStatusId: toId,
            name: t.name,
            requiresComment: t.requiresComment ?? false,
            requiredRole: t.requiredRole,
          },
        });
      }
    }

    await auditService.log({
      userId,
      action: "workflow.create",
      entityType: "workflow",
      entityId: workflow.id,
      details: { entityType: workflow.entityType, name: workflow.name, statusCount: statuses.length, transitionCount: transitions.length },
    });

    return this.getWorkflow(entityType);
  }

  /**
   * Seed default workflows if none exist.
   */
  async seedDefaults() {
    const existing = await prisma.workflowConfig.count();
    if (existing > 0) return;

    // Assessment workflow
    await this.upsertWorkflow(
      "assessment",
      "Default Assessment Workflow",
      [
        { name: "REQUESTED", label: "Requested", category: "open", isInitial: true, sortOrder: 10, jiraStatusMapping: "To Do" },
        { name: "TRIAGE", label: "Triage", category: "open", sortOrder: 20, jiraStatusMapping: "Triage" },
        { name: "QUEUED", label: "Queued", category: "open", sortOrder: 30 },
        { name: "ASSIGNED", label: "Assigned", category: "in_progress", sortOrder: 40 },
        { name: "IN_PROGRESS", label: "In Progress", category: "in_progress", sortOrder: 50, jiraStatusMapping: "In Progress" },
        { name: "WAITING_INFO", label: "Waiting for Info", category: "in_progress", sortOrder: 60 },
        { name: "REVIEW_COMPLETE", label: "Review Complete", category: "resolved", sortOrder: 70 },
        { name: "FINDINGS_DOCUMENTED", label: "Findings Documented", category: "resolved", sortOrder: 80 },
        { name: "DONE", label: "Done", category: "terminal", isTerminal: true, sortOrder: 90, jiraStatusMapping: "Done" },
        { name: "CANCELLED", label: "Cancelled", category: "terminal", isTerminal: true, sortOrder: 100 },
      ],
      [
        { fromStatus: "REQUESTED", toStatus: "TRIAGE" },
        { fromStatus: "REQUESTED", toStatus: "CANCELLED" },
        { fromStatus: "TRIAGE", toStatus: "QUEUED" },
        { fromStatus: "TRIAGE", toStatus: "CANCELLED" },
        { fromStatus: "QUEUED", toStatus: "ASSIGNED" },
        { fromStatus: "QUEUED", toStatus: "CANCELLED" },
        { fromStatus: "ASSIGNED", toStatus: "IN_PROGRESS", name: "Start Work" },
        { fromStatus: "ASSIGNED", toStatus: "QUEUED" },
        { fromStatus: "ASSIGNED", toStatus: "CANCELLED" },
        { fromStatus: "IN_PROGRESS", toStatus: "WAITING_INFO" },
        { fromStatus: "IN_PROGRESS", toStatus: "REVIEW_COMPLETE", name: "Complete Review" },
        { fromStatus: "IN_PROGRESS", toStatus: "CANCELLED" },
        { fromStatus: "WAITING_INFO", toStatus: "IN_PROGRESS", name: "Resume" },
        { fromStatus: "WAITING_INFO", toStatus: "CANCELLED" },
        { fromStatus: "REVIEW_COMPLETE", toStatus: "FINDINGS_DOCUMENTED" },
        { fromStatus: "REVIEW_COMPLETE", toStatus: "DONE", name: "No Findings" },
        { fromStatus: "FINDINGS_DOCUMENTED", toStatus: "DONE", name: "Close Assessment" },
      ],
      "system"
    );

    // Vulnerability workflow
    await this.upsertWorkflow(
      "vulnerability",
      "Default Vulnerability Workflow",
      [
        { name: "NEW", label: "New", category: "open", isInitial: true, sortOrder: 10, jiraStatusMapping: "Open" },
        { name: "TRIAGED", label: "Triaged", category: "open", sortOrder: 20 },
        { name: "ASSIGNED", label: "Assigned", category: "in_progress", sortOrder: 30 },
        { name: "IN_PROGRESS", label: "In Progress", category: "in_progress", sortOrder: 40, jiraStatusMapping: "In Progress" },
        { name: "PENDING_FIX", label: "Pending Fix", category: "in_progress", sortOrder: 50 },
        { name: "READY_FOR_VERIFICATION", label: "Ready for Verification", category: "resolved", sortOrder: 60 },
        { name: "VERIFIED", label: "Verified", category: "resolved", sortOrder: 70 },
        { name: "CLOSED", label: "Closed", category: "terminal", isTerminal: true, sortOrder: 80, jiraStatusMapping: "Done" },
        { name: "FALSE_POSITIVE", label: "False Positive", category: "terminal", isTerminal: true, sortOrder: 90 },
        { name: "RISK_ACCEPTED", label: "Risk Accepted", category: "terminal", isTerminal: true, sortOrder: 100 },
        { name: "DUPLICATE", label: "Duplicate", category: "terminal", isTerminal: true, sortOrder: 110 },
        { name: "WONT_FIX", label: "Won't Fix", category: "terminal", isTerminal: true, sortOrder: 120 },
      ],
      [
        { fromStatus: "NEW", toStatus: "TRIAGED" },
        { fromStatus: "NEW", toStatus: "FALSE_POSITIVE", requiresComment: true },
        { fromStatus: "NEW", toStatus: "DUPLICATE", requiresComment: true },
        { fromStatus: "TRIAGED", toStatus: "ASSIGNED" },
        { fromStatus: "TRIAGED", toStatus: "RISK_ACCEPTED", requiresComment: true, requiredRole: "SECURITY_MANAGER" },
        { fromStatus: "TRIAGED", toStatus: "FALSE_POSITIVE", requiresComment: true },
        { fromStatus: "TRIAGED", toStatus: "WONT_FIX", requiresComment: true },
        { fromStatus: "ASSIGNED", toStatus: "IN_PROGRESS", name: "Start Work" },
        { fromStatus: "ASSIGNED", toStatus: "TRIAGED" },
        { fromStatus: "IN_PROGRESS", toStatus: "PENDING_FIX" },
        { fromStatus: "IN_PROGRESS", toStatus: "WONT_FIX", requiresComment: true },
        { fromStatus: "PENDING_FIX", toStatus: "READY_FOR_VERIFICATION", name: "Submit for Verification" },
        { fromStatus: "PENDING_FIX", toStatus: "IN_PROGRESS" },
        { fromStatus: "READY_FOR_VERIFICATION", toStatus: "VERIFIED", name: "Verify Fix" },
        { fromStatus: "READY_FOR_VERIFICATION", toStatus: "IN_PROGRESS", name: "Reopen", requiresComment: true },
        { fromStatus: "VERIFIED", toStatus: "CLOSED", name: "Close" },
        { fromStatus: "CLOSED", toStatus: "NEW", name: "Reopen", requiresComment: true },
        { fromStatus: "RISK_ACCEPTED", toStatus: "TRIAGED", name: "Re-evaluate" },
        { fromStatus: "WONT_FIX", toStatus: "TRIAGED", name: "Re-evaluate" },
      ],
      "system"
    );
  }

  /**
   * Hardcoded fallback transitions (used when no DB workflow exists).
   */
  private getHardcodedTransitions(entityType: string, currentStatus: string) {
    const assessmentMap: Record<string, string[]> = {
      REQUESTED: ["TRIAGE", "CANCELLED"],
      TRIAGE: ["QUEUED", "CANCELLED"],
      QUEUED: ["ASSIGNED", "CANCELLED"],
      ASSIGNED: ["IN_PROGRESS", "QUEUED", "CANCELLED"],
      IN_PROGRESS: ["WAITING_INFO", "REVIEW_COMPLETE", "CANCELLED"],
      WAITING_INFO: ["IN_PROGRESS", "CANCELLED"],
      REVIEW_COMPLETE: ["FINDINGS_DOCUMENTED", "DONE"],
      FINDINGS_DOCUMENTED: ["DONE"],
    };

    const vulnMap: Record<string, string[]> = {
      NEW: ["TRIAGED", "FALSE_POSITIVE", "DUPLICATE"],
      TRIAGED: ["ASSIGNED", "RISK_ACCEPTED", "FALSE_POSITIVE", "WONT_FIX"],
      ASSIGNED: ["IN_PROGRESS", "TRIAGED"],
      IN_PROGRESS: ["PENDING_FIX", "WONT_FIX"],
      PENDING_FIX: ["READY_FOR_VERIFICATION", "IN_PROGRESS"],
      READY_FOR_VERIFICATION: ["VERIFIED", "IN_PROGRESS"],
      VERIFIED: ["CLOSED"],
      CLOSED: ["NEW"],
      RISK_ACCEPTED: ["TRIAGED"],
      WONT_FIX: ["TRIAGED"],
    };

    const map = entityType === "assessment" ? assessmentMap : vulnMap;
    const allowed = map[currentStatus] || [];

    return allowed.map((s) => ({
      toStatus: s,
      label: s.replace(/_/g, " "),
      requiresComment: false,
    }));
  }
}

export const workflowService = new WorkflowService();

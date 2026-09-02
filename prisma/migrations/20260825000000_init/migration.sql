-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA "public";

-- CreateEnum
CREATE TYPE "Criticality" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFORMATIONAL');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('ACTIVE', 'DECOMMISSIONED', 'PLANNING', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AliasSource" AS ENUM ('MANUAL', 'IMPORT', 'AI_LEARNED', 'JIRA_COMPONENT');

-- CreateEnum
CREATE TYPE "OwnerType" AS ENUM ('APPLICATION_OWNER', 'TECHNICAL_OWNER', 'SECURITY_OWNER');

-- CreateEnum
CREATE TYPE "SLAStatus" AS ENUM ('ON_TRACK', 'AT_RISK', 'BREACHED', 'PAUSED', 'EXEMPT', 'MET', 'MISSED');

-- CreateEnum
CREATE TYPE "EntityType" AS ENUM ('ASSESSMENT', 'VULNERABILITY');

-- CreateEnum
CREATE TYPE "MappingStatus" AS ENUM ('AUTO_MATCHED', 'HUMAN_CONFIRMED', 'HUMAN_OVERRIDDEN', 'UNRESOLVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('UPLOADED', 'VALIDATING', 'PREVIEWING', 'CONFIRMED', 'IMPORTING', 'COMPLETED', 'FAILED', 'ROLLED_BACK');

-- CreateEnum
CREATE TYPE "ImportRowStatus" AS ENUM ('NEW', 'UPDATED', 'UNCHANGED', 'INVALID', 'DUPLICATE', 'REMOVED');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('SYNCED', 'ERROR', 'DELETED');

-- CreateEnum
CREATE TYPE "ExternalSource" AS ENUM ('JIRA', 'SERVICENOW', 'GITHUB', 'GITLAB', 'SCANNER');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SYSTEM_ADMIN', 'SECURITY_ADMIN', 'SECURITY_MANAGER', 'SECURITY_ENGINEER', 'APPLICATION_OWNER', 'DEVELOPER', 'AUDITOR', 'EXECUTIVE', 'READ_ONLY');

-- CreateEnum
CREATE TYPE "ChangeSource" AS ENUM ('MANUAL', 'JIRA_SYNC', 'SYSTEM', 'AI');

-- CreateEnum
CREATE TYPE "AuditSource" AS ENUM ('UI', 'API', 'SYSTEM', 'JIRA_SYNC', 'AI');

-- CreateEnum
CREATE TYPE "AIRecommendationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "RiskAcceptanceStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "SyncType" AS ENUM ('ASSESSMENT', 'VULNERABILITY', 'FULL');

-- CreateEnum
CREATE TYPE "SyncTrigger" AS ENUM ('SCHEDULED', 'MANUAL', 'WEBHOOK');

-- CreateEnum
CREATE TYPE "SyncJobStatus" AS ENUM ('STARTED', 'IN_PROGRESS', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "business_units" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "parent_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "display_name" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255),
    "sso_subject" VARCHAR(255),
    "role" "UserRole" NOT NULL DEFAULT 'READ_ONLY',
    "business_unit_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applications" (
    "id" UUID NOT NULL,
    "application_id" VARCHAR(50) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "normalized_name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "business_unit_id" UUID,
    "department" VARCHAR(100),
    "criticality" "Criticality" NOT NULL DEFAULT 'MEDIUM',
    "internet_facing" BOOLEAN NOT NULL DEFAULT false,
    "data_classification" VARCHAR(50),
    "compliance_scope" TEXT[],
    "technology_stack" TEXT[],
    "repository_url" VARCHAR(500),
    "service_url" VARCHAR(500),
    "production_url" VARCHAR(500),
    "status" "ApplicationStatus" NOT NULL DEFAULT 'ACTIVE',
    "risk_rating" VARCHAR(50),
    "go_live_date" DATE,
    "last_assessment_date" TIMESTAMP(3),
    "next_assessment_due" DATE,
    "open_vulnerability_count" INTEGER NOT NULL DEFAULT 0,
    "open_critical_count" INTEGER NOT NULL DEFAULT 0,
    "open_high_count" INTEGER NOT NULL DEFAULT 0,
    "last_import_id" UUID,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_aliases" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "alias" VARCHAR(255) NOT NULL,
    "normalized_alias" VARCHAR(255) NOT NULL,
    "source" "AliasSource" NOT NULL DEFAULT 'MANUAL',
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_owners" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "user_id" UUID,
    "owner_name" VARCHAR(255),
    "owner_email" VARCHAR(255),
    "ownerType" "OwnerType" NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "application_owners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_types" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "description" TEXT,
    "default_sla_days" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "requires_periodic" BOOLEAN NOT NULL DEFAULT false,
    "period_months" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assessment_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessments" (
    "id" UUID NOT NULL,
    "internal_key" VARCHAR(20) NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "description" TEXT,
    "assessment_type_id" UUID NOT NULL,
    "status" VARCHAR(50) NOT NULL,
    "priority" "Criticality",
    "requester_id" UUID,
    "assignee_id" UUID,
    "created_date" TIMESTAMP(3) NOT NULL,
    "due_date" DATE,
    "started_date" TIMESTAMP(3),
    "completed_date" TIMESTAMP(3),
    "finding_count" INTEGER NOT NULL DEFAULT 0,
    "sla_status" "SLAStatus",
    "complexity" VARCHAR(50),
    "external_issue_id" UUID,
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessment_applications" (
    "assessment_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT true,
    "mapped_by" VARCHAR(50),
    "mapping_confidence" DECIMAL(5,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessment_applications_pkey" PRIMARY KEY ("assessment_id","application_id")
);

-- CreateTable
CREATE TABLE "vulnerabilities" (
    "id" UUID NOT NULL,
    "internal_key" VARCHAR(20) NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "description" TEXT,
    "vulnerability_type" VARCHAR(100),
    "cwe_id" VARCHAR(20),
    "cve_id" VARCHAR(20),
    "cvss_score" DECIMAL(3,1),
    "cvss_vector" VARCHAR(100),
    "severity" "Severity" NOT NULL,
    "status" VARCHAR(50) NOT NULL,
    "source" VARCHAR(50),
    "source_assessment_id" UUID,
    "assignee_id" UUID,
    "fix_owner_id" UUID,
    "created_date" TIMESTAMP(3) NOT NULL,
    "due_date" DATE,
    "fixed_date" TIMESTAMP(3),
    "verified_date" TIMESTAMP(3),
    "closed_date" TIMESTAMP(3),
    "sla_status" "SLAStatus",
    "overdue_days" INTEGER,
    "recommendation" TEXT,
    "evidence" TEXT,
    "root_cause" TEXT,
    "environment" VARCHAR(50),
    "affected_component" VARCHAR(255),
    "remediation_effort" VARCHAR(50),
    "is_false_positive" BOOLEAN NOT NULL DEFAULT false,
    "external_issue_id" UUID,
    "last_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vulnerabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vulnerability_applications" (
    "vulnerability_id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vulnerability_applications_pkey" PRIMARY KEY ("vulnerability_id","application_id")
);

-- CreateTable
CREATE TABLE "risk_acceptances" (
    "id" UUID NOT NULL,
    "vulnerability_id" UUID NOT NULL,
    "accepted_by" UUID NOT NULL,
    "approved_by" UUID,
    "justification" TEXT NOT NULL,
    "accepted_date" TIMESTAMP(3) NOT NULL,
    "expiration_date" DATE,
    "status" "RiskAcceptanceStatus" NOT NULL DEFAULT 'ACTIVE',
    "conditions" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "risk_acceptances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "status_history" (
    "id" UUID NOT NULL,
    "entity_type" "EntityType" NOT NULL,
    "entity_id" UUID NOT NULL,
    "from_status" VARCHAR(50),
    "to_status" VARCHAR(50) NOT NULL,
    "changed_by" UUID,
    "changed_at" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "source" "ChangeSource" NOT NULL DEFAULT 'MANUAL',

    CONSTRAINT "status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "external_issues" (
    "id" UUID NOT NULL,
    "source" "ExternalSource" NOT NULL,
    "source_id" VARCHAR(100) NOT NULL,
    "source_project" VARCHAR(100),
    "issue_type" VARCHAR(50),
    "title" VARCHAR(500),
    "description" TEXT,
    "status" VARCHAR(100),
    "priority" VARCHAR(50),
    "assignee_email" VARCHAR(255),
    "reporter_email" VARCHAR(255),
    "labels" TEXT[],
    "components" TEXT[],
    "custom_fields" JSONB,
    "created_date" TIMESTAMP(3),
    "updated_date" TIMESTAMP(3),
    "resolved_date" TIMESTAMP(3),
    "raw_data" JSONB,
    "sync_status" "SyncStatus" NOT NULL DEFAULT 'SYNCED',
    "last_synced_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "external_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_mappings" (
    "id" UUID NOT NULL,
    "external_issue_id" UUID NOT NULL,
    "application_id" UUID,
    "status" "MappingStatus" NOT NULL DEFAULT 'UNRESOLVED',
    "confidence_score" DECIMAL(5,2),
    "match_method" VARCHAR(50),
    "evidence" JSONB,
    "ai_explanation" TEXT,
    "candidates" JSONB,
    "resolved_by" UUID,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "application_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jira_sync_history" (
    "id" UUID NOT NULL,
    "sync_type" "SyncType" NOT NULL,
    "status" "SyncJobStatus" NOT NULL,
    "trigger" "SyncTrigger",
    "started_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "issues_fetched" INTEGER NOT NULL DEFAULT 0,
    "issues_created" INTEGER NOT NULL DEFAULT 0,
    "issues_updated" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,
    "jql_used" TEXT,
    "last_issue_updated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jira_sync_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sla_rules" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "entity_type" "EntityType" NOT NULL,
    "severity" "Severity",
    "app_criticality" "Criticality",
    "internet_facing" BOOLEAN,
    "business_unit_id" UUID,
    "environment" VARCHAR(50),
    "compliance_scope" VARCHAR(50),
    "sla_days" INTEGER NOT NULL,
    "warning_days_before" INTEGER NOT NULL DEFAULT 3,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sla_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_imports" (
    "id" UUID NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "file_size" INTEGER,
    "file_hash" VARCHAR(64),
    "status" "ImportStatus" NOT NULL DEFAULT 'UPLOADED',
    "total_rows" INTEGER,
    "new_count" INTEGER,
    "updated_count" INTEGER,
    "unchanged_count" INTEGER,
    "invalid_count" INTEGER,
    "duplicate_count" INTEGER,
    "removed_count" INTEGER,
    "column_mapping" JSONB,
    "validation_errors" JSONB,
    "imported_by" UUID NOT NULL,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "rolled_back_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "asset_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_import_rows" (
    "id" UUID NOT NULL,
    "import_id" UUID NOT NULL,
    "row_number" INTEGER NOT NULL,
    "raw_data" JSONB NOT NULL,
    "status" "ImportRowStatus" NOT NULL,
    "application_id" UUID,
    "changes" JSONB,
    "validation_errors" JSONB,
    "is_included" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_import_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "message" TEXT NOT NULL,
    "entity_type" VARCHAR(50),
    "entity_id" UUID,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMP(3),
    "channels_sent" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" UUID,
    "action" VARCHAR(100) NOT NULL,
    "entity_type" VARCHAR(50),
    "entity_id" UUID,
    "details" JSONB,
    "ip_address" VARCHAR(45),
    "user_agent" VARCHAR(500),
    "source" "AuditSource" NOT NULL DEFAULT 'UI',
    "ai_metadata" JSONB,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_recommendations" (
    "id" UUID NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "input_summary" TEXT,
    "input_hash" VARCHAR(64),
    "model_provider" VARCHAR(50),
    "model_id" VARCHAR(100),
    "prompt_template" VARCHAR(100),
    "output" JSONB NOT NULL,
    "confidence" DECIMAL(5,2),
    "evidence" JSONB,
    "status" "AIRecommendationStatus" NOT NULL DEFAULT 'PENDING',
    "decision_by" UUID,
    "decision_at" TIMESTAMP(3),
    "decision_reason" TEXT,
    "tokens_used" INTEGER,
    "latency_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_snapshots" (
    "id" UUID NOT NULL,
    "snapshot_date" DATE NOT NULL,
    "metric_type" VARCHAR(100) NOT NULL,
    "dimension" VARCHAR(255),
    "value" DECIMAL(15,2) NOT NULL,
    "details" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_configs" (
    "id" UUID NOT NULL,
    "entity_type" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_statuses" (
    "id" UUID NOT NULL,
    "workflow_id" UUID NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "label" VARCHAR(100) NOT NULL,
    "category" VARCHAR(30) NOT NULL,
    "color" VARCHAR(7),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_initial" BOOLEAN NOT NULL DEFAULT false,
    "is_terminal" BOOLEAN NOT NULL DEFAULT false,
    "jira_status_mapping" VARCHAR(100),

    CONSTRAINT "workflow_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_transitions" (
    "id" UUID NOT NULL,
    "workflow_id" UUID NOT NULL,
    "from_status_id" UUID NOT NULL,
    "to_status_id" UUID NOT NULL,
    "name" VARCHAR(100),
    "requires_comment" BOOLEAN NOT NULL DEFAULT false,
    "required_role" VARCHAR(50),

    CONSTRAINT "workflow_transitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jira_writeback_queue" (
    "id" UUID NOT NULL,
    "external_issue_id" UUID NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "requested_by" UUID NOT NULL,
    "approved_by" UUID,
    "approved_at" TIMESTAMP(3),
    "executed_at" TIMESTAMP(3),
    "error" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jira_writeback_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "event_type" VARCHAR(50) NOT NULL,
    "in_app" BOOLEAN NOT NULL DEFAULT true,
    "email" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "business_units_name_key" ON "business_units"("name");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_sso_subject_key" ON "users"("sso_subject");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE UNIQUE INDEX "applications_application_id_key" ON "applications"("application_id");

-- CreateIndex
CREATE INDEX "applications_normalized_name_idx" ON "applications"("normalized_name");

-- CreateIndex
CREATE INDEX "applications_business_unit_id_idx" ON "applications"("business_unit_id");

-- CreateIndex
CREATE INDEX "applications_criticality_idx" ON "applications"("criticality");

-- CreateIndex
CREATE INDEX "applications_status_idx" ON "applications"("status");

-- CreateIndex
CREATE INDEX "applications_internet_facing_idx" ON "applications"("internet_facing");

-- CreateIndex
CREATE INDEX "applications_next_assessment_due_idx" ON "applications"("next_assessment_due");

-- CreateIndex
CREATE INDEX "application_aliases_normalized_alias_idx" ON "application_aliases"("normalized_alias");

-- CreateIndex
CREATE UNIQUE INDEX "application_aliases_application_id_normalized_alias_key" ON "application_aliases"("application_id", "normalized_alias");

-- CreateIndex
CREATE INDEX "application_owners_application_id_idx" ON "application_owners"("application_id");

-- CreateIndex
CREATE INDEX "application_owners_user_id_idx" ON "application_owners"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_types_name_key" ON "assessment_types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "assessment_types_code_key" ON "assessment_types"("code");

-- CreateIndex
CREATE UNIQUE INDEX "assessments_internal_key_key" ON "assessments"("internal_key");

-- CreateIndex
CREATE INDEX "assessments_status_idx" ON "assessments"("status");

-- CreateIndex
CREATE INDEX "assessments_assignee_id_idx" ON "assessments"("assignee_id");

-- CreateIndex
CREATE INDEX "assessments_assessment_type_id_idx" ON "assessments"("assessment_type_id");

-- CreateIndex
CREATE INDEX "assessments_due_date_idx" ON "assessments"("due_date");

-- CreateIndex
CREATE INDEX "assessments_external_issue_id_idx" ON "assessments"("external_issue_id");

-- CreateIndex
CREATE INDEX "assessments_sla_status_idx" ON "assessments"("sla_status");

-- CreateIndex
CREATE UNIQUE INDEX "vulnerabilities_internal_key_key" ON "vulnerabilities"("internal_key");

-- CreateIndex
CREATE INDEX "vulnerabilities_severity_idx" ON "vulnerabilities"("severity");

-- CreateIndex
CREATE INDEX "vulnerabilities_status_idx" ON "vulnerabilities"("status");

-- CreateIndex
CREATE INDEX "vulnerabilities_sla_status_idx" ON "vulnerabilities"("sla_status");

-- CreateIndex
CREATE INDEX "vulnerabilities_due_date_idx" ON "vulnerabilities"("due_date");

-- CreateIndex
CREATE INDEX "vulnerabilities_assignee_id_idx" ON "vulnerabilities"("assignee_id");

-- CreateIndex
CREATE INDEX "vulnerabilities_fix_owner_id_idx" ON "vulnerabilities"("fix_owner_id");

-- CreateIndex
CREATE INDEX "vulnerabilities_external_issue_id_idx" ON "vulnerabilities"("external_issue_id");

-- CreateIndex
CREATE INDEX "vulnerabilities_cve_id_idx" ON "vulnerabilities"("cve_id");

-- CreateIndex
CREATE INDEX "vulnerabilities_cwe_id_idx" ON "vulnerabilities"("cwe_id");

-- CreateIndex
CREATE INDEX "risk_acceptances_vulnerability_id_idx" ON "risk_acceptances"("vulnerability_id");

-- CreateIndex
CREATE INDEX "risk_acceptances_status_idx" ON "risk_acceptances"("status");

-- CreateIndex
CREATE INDEX "risk_acceptances_expiration_date_idx" ON "risk_acceptances"("expiration_date");

-- CreateIndex
CREATE INDEX "status_history_entity_type_entity_id_changed_at_idx" ON "status_history"("entity_type", "entity_id", "changed_at");

-- CreateIndex
CREATE INDEX "status_history_entity_type_entity_id_idx" ON "status_history"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "external_issues_source_id_idx" ON "external_issues"("source_id");

-- CreateIndex
CREATE INDEX "external_issues_source_idx" ON "external_issues"("source");

-- CreateIndex
CREATE INDEX "external_issues_status_idx" ON "external_issues"("status");

-- CreateIndex
CREATE INDEX "external_issues_last_synced_at_idx" ON "external_issues"("last_synced_at");

-- CreateIndex
CREATE UNIQUE INDEX "external_issues_source_source_id_key" ON "external_issues"("source", "source_id");

-- CreateIndex
CREATE UNIQUE INDEX "application_mappings_external_issue_id_key" ON "application_mappings"("external_issue_id");

-- CreateIndex
CREATE INDEX "application_mappings_status_idx" ON "application_mappings"("status");

-- CreateIndex
CREATE INDEX "application_mappings_application_id_idx" ON "application_mappings"("application_id");

-- CreateIndex
CREATE INDEX "jira_sync_history_sync_type_started_at_idx" ON "jira_sync_history"("sync_type", "started_at");

-- CreateIndex
CREATE INDEX "sla_rules_entity_type_is_active_idx" ON "sla_rules"("entity_type", "is_active");

-- CreateIndex
CREATE INDEX "sla_rules_severity_idx" ON "sla_rules"("severity");

-- CreateIndex
CREATE INDEX "asset_imports_status_idx" ON "asset_imports"("status");

-- CreateIndex
CREATE INDEX "asset_imports_imported_by_idx" ON "asset_imports"("imported_by");

-- CreateIndex
CREATE INDEX "asset_import_rows_import_id_idx" ON "asset_import_rows"("import_id");

-- CreateIndex
CREATE INDEX "asset_import_rows_status_idx" ON "asset_import_rows"("status");

-- CreateIndex
CREATE INDEX "notifications_user_id_is_read_idx" ON "notifications"("user_id", "is_read");

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_timestamp_idx" ON "audit_logs"("timestamp");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "ai_recommendations_type_idx" ON "ai_recommendations"("type");

-- CreateIndex
CREATE INDEX "ai_recommendations_status_idx" ON "ai_recommendations"("status");

-- CreateIndex
CREATE INDEX "ai_recommendations_created_at_idx" ON "ai_recommendations"("created_at");

-- CreateIndex
CREATE INDEX "daily_snapshots_snapshot_date_idx" ON "daily_snapshots"("snapshot_date");

-- CreateIndex
CREATE INDEX "daily_snapshots_metric_type_idx" ON "daily_snapshots"("metric_type");

-- CreateIndex
CREATE UNIQUE INDEX "daily_snapshots_snapshot_date_metric_type_dimension_key" ON "daily_snapshots"("snapshot_date", "metric_type", "dimension");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_configs_entity_type_is_default_key" ON "workflow_configs"("entity_type", "is_default");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_statuses_workflow_id_name_key" ON "workflow_statuses"("workflow_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "workflow_transitions_workflow_id_from_status_id_to_status_i_key" ON "workflow_transitions"("workflow_id", "from_status_id", "to_status_id");

-- CreateIndex
CREATE INDEX "jira_writeback_queue_status_idx" ON "jira_writeback_queue"("status");

-- CreateIndex
CREATE INDEX "jira_writeback_queue_external_issue_id_idx" ON "jira_writeback_queue"("external_issue_id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_user_id_event_type_key" ON "notification_preferences"("user_id", "event_type");

-- AddForeignKey
ALTER TABLE "business_units" ADD CONSTRAINT "business_units_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "business_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_business_unit_id_fkey" FOREIGN KEY ("business_unit_id") REFERENCES "business_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_business_unit_id_fkey" FOREIGN KEY ("business_unit_id") REFERENCES "business_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_aliases" ADD CONSTRAINT "application_aliases_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_owners" ADD CONSTRAINT "application_owners_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_owners" ADD CONSTRAINT "application_owners_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_assessment_type_id_fkey" FOREIGN KEY ("assessment_type_id") REFERENCES "assessment_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_external_issue_id_fkey" FOREIGN KEY ("external_issue_id") REFERENCES "external_issues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_applications" ADD CONSTRAINT "assessment_applications_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessment_applications" ADD CONSTRAINT "assessment_applications_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vulnerabilities" ADD CONSTRAINT "vulnerabilities_source_assessment_id_fkey" FOREIGN KEY ("source_assessment_id") REFERENCES "assessments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vulnerabilities" ADD CONSTRAINT "vulnerabilities_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vulnerabilities" ADD CONSTRAINT "vulnerabilities_fix_owner_id_fkey" FOREIGN KEY ("fix_owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vulnerabilities" ADD CONSTRAINT "vulnerabilities_external_issue_id_fkey" FOREIGN KEY ("external_issue_id") REFERENCES "external_issues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vulnerability_applications" ADD CONSTRAINT "vulnerability_applications_vulnerability_id_fkey" FOREIGN KEY ("vulnerability_id") REFERENCES "vulnerabilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vulnerability_applications" ADD CONSTRAINT "vulnerability_applications_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_acceptances" ADD CONSTRAINT "risk_acceptances_vulnerability_id_fkey" FOREIGN KEY ("vulnerability_id") REFERENCES "vulnerabilities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_acceptances" ADD CONSTRAINT "risk_acceptances_accepted_by_fkey" FOREIGN KEY ("accepted_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_acceptances" ADD CONSTRAINT "risk_acceptances_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_history" ADD CONSTRAINT "status_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_mappings" ADD CONSTRAINT "application_mappings_external_issue_id_fkey" FOREIGN KEY ("external_issue_id") REFERENCES "external_issues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_mappings" ADD CONSTRAINT "application_mappings_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_mappings" ADD CONSTRAINT "application_mappings_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sla_rules" ADD CONSTRAINT "sla_rules_business_unit_id_fkey" FOREIGN KEY ("business_unit_id") REFERENCES "business_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_imports" ADD CONSTRAINT "asset_imports_imported_by_fkey" FOREIGN KEY ("imported_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_import_rows" ADD CONSTRAINT "asset_import_rows_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "asset_imports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_import_rows" ADD CONSTRAINT "asset_import_rows_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_recommendations" ADD CONSTRAINT "ai_recommendations_decision_by_fkey" FOREIGN KEY ("decision_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_statuses" ADD CONSTRAINT "workflow_statuses_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflow_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_transitions" ADD CONSTRAINT "workflow_transitions_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "workflow_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_transitions" ADD CONSTRAINT "workflow_transitions_from_status_id_fkey" FOREIGN KEY ("from_status_id") REFERENCES "workflow_statuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_transitions" ADD CONSTRAINT "workflow_transitions_to_status_id_fkey" FOREIGN KEY ("to_status_id") REFERENCES "workflow_statuses"("id") ON DELETE CASCADE ON UPDATE CASCADE;


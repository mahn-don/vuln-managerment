import { PrismaClient, UserRole, EntityType, Severity, Criticality } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashSync } from "bcryptjs";

/** Work factor for password hashing. 12 is the current sensible floor. */
const BCRYPT_COST = 12;
import { randomUUID } from "crypto";

const isProd = process.env.NODE_ENV === "production";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding database...");

  // 1. Business Units
  const buTech = await prisma.businessUnit.upsert({
    where: { name: "Technology" },
    update: {},
    create: { name: "Technology" },
  });

  await prisma.businessUnit.upsert({
    where: { name: "Finance" },
    update: {},
    create: { name: "Finance" },
  });

  await prisma.businessUnit.upsert({
    where: { name: "Operations" },
    update: {},
    create: { name: "Operations" },
  });

  await prisma.businessUnit.upsert({
    where: { name: "Digital Banking" },
    update: {},
    create: { name: "Digital Banking" },
  });

  await prisma.businessUnit.upsert({
    where: { name: "Risk Management" },
    update: {},
    create: { name: "Risk Management" },
  });

  console.log("  Business units created");

  // 2. Assessment Types
  const assessmentTypes = [
    {
      name: "Go-Live Security Assessment",
      code: "GOLIVE",
      description: "Security review required before an application goes live in production",
      defaultSlaDays: 14,
      requiresPeriodic: false,
    },
    {
      name: "Periodic Security Assessment",
      code: "PERIODIC",
      description: "Regular security review performed on a scheduled basis",
      defaultSlaDays: 30,
      requiresPeriodic: true,
      periodMonths: 12,
    },
    {
      name: "Architecture Review",
      code: "ARCHREVIEW",
      description: "Security review of application architecture and design",
      defaultSlaDays: 21,
      requiresPeriodic: false,
    },
    {
      name: "Penetration Test",
      code: "PENTEST",
      description: "Active security testing to identify exploitable vulnerabilities",
      defaultSlaDays: 30,
      requiresPeriodic: true,
      periodMonths: 12,
    },
    {
      name: "Source Code Review",
      code: "CODEREVIEW",
      description: "Manual or automated review of application source code for security issues",
      defaultSlaDays: 21,
      requiresPeriodic: false,
    },
    {
      name: "API Security Review",
      code: "APIREVIEW",
      description: "Security assessment focused on API endpoints and data flows",
      defaultSlaDays: 14,
      requiresPeriodic: false,
    },
    {
      name: "Cloud Security Review",
      code: "CLOUDREVIEW",
      description: "Review of cloud infrastructure and configuration security",
      defaultSlaDays: 21,
      requiresPeriodic: true,
      periodMonths: 6,
    },
    {
      name: "Configuration Review",
      code: "CONFIGREVIEW",
      description: "Review of system and application configuration settings",
      defaultSlaDays: 14,
      requiresPeriodic: false,
    },
    {
      name: "Threat Modeling",
      code: "THREATMODEL",
      description: "Systematic identification and evaluation of potential threats",
      defaultSlaDays: 21,
      requiresPeriodic: false,
    },
    {
      name: "Risk / Exception Review",
      code: "RISKREVIEW",
      description: "Review of risk acceptance requests and security exceptions",
      defaultSlaDays: 7,
      requiresPeriodic: false,
    },
  ];

  for (const at of assessmentTypes) {
    await prisma.assessmentType.upsert({
      where: { code: at.code },
      update: at,
      create: at,
    });
  }
  console.log("  Assessment types created");

  // 3. Default SLA Rules
  const slaRules = [
    { name: "Default Critical Vulnerability", severity: Severity.CRITICAL, slaDays: 7, priority: 10 },
    { name: "Default High Vulnerability", severity: Severity.HIGH, slaDays: 30, priority: 10 },
    { name: "Default Medium Vulnerability", severity: Severity.MEDIUM, slaDays: 60, priority: 10 },
    { name: "Default Low Vulnerability", severity: Severity.LOW, slaDays: 90, priority: 10 },
    { name: "Default Informational Vulnerability", severity: Severity.INFORMATIONAL, slaDays: 180, priority: 5 },
    {
      name: "Critical + Internet-Facing",
      severity: Severity.CRITICAL,
      internetFacing: true,
      slaDays: 3,
      priority: 20,
    },
    {
      name: "Critical + Critical App",
      severity: Severity.CRITICAL,
      appLevel: 1,
      slaDays: 5,
      priority: 20,
    },
    {
      name: "Critical + Critical App + Internet-Facing",
      severity: Severity.CRITICAL,
      appLevel: 1,
      internetFacing: true,
      slaDays: 1,
      priority: 30,
    },
  ];

  for (const rule of slaRules) {
    const existing = await prisma.sLARule.findFirst({
      where: { name: rule.name },
    });
    if (!existing) {
      await prisma.sLARule.create({
        data: {
          ...rule,
          entityType: EntityType.VULNERABILITY,
          effectiveFrom: new Date("2024-01-01"),
          warningDaysBefore: rule.slaDays <= 7 ? 1 : 3,
        },
      });
    }
  }
  console.log("  SLA rules created");

  // 4. Dev Users (only with weak passwords in development)
  const adminPassword = isProd
    ? (process.env.SEED_ADMIN_PASSWORD || randomUUID())
    : "admin123";
  const managerPassword = isProd
    ? (process.env.SEED_MANAGER_PASSWORD || randomUUID())
    : "manager123";
  const engineerPassword = isProd
    ? (process.env.SEED_ENGINEER_PASSWORD || randomUUID())
    : "engineer123";

  if (isProd && !process.env.SEED_ADMIN_PASSWORD) {
    console.warn("WARNING: No SEED_ADMIN_PASSWORD set — generated random password for admin user");
  }

  await prisma.user.upsert({
    where: { email: "admin@secplatform.local" },
    update: {},
    create: {
      email: "admin@secplatform.local",
      displayName: "System Administrator",
      passwordHash: hashSync(adminPassword, BCRYPT_COST),
      role: UserRole.SYSTEM_ADMIN,
      isActive: true,
    },
  });

  await prisma.user.upsert({
    where: { email: "manager@secplatform.local" },
    update: { businessUnitId: buTech.id },
    create: {
      email: "manager@secplatform.local",
      displayName: "Security Manager",
      passwordHash: hashSync(managerPassword, BCRYPT_COST),
      role: UserRole.SECURITY_MANAGER,
      businessUnitId: buTech.id,
      isActive: true,
    },
  });

  await prisma.user.upsert({
    where: { email: "engineer@secplatform.local" },
    update: {},
    create: {
      email: "engineer@secplatform.local",
      displayName: "Security Engineer",
      passwordHash: hashSync(engineerPassword, BCRYPT_COST),
      role: UserRole.SECURITY_ENGINEER,
      isActive: true,
    },
  });

  console.log("  Dev users created");
  console.log("Seeding complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

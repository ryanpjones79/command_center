import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureExecutionSetup } from "@/server/execution-service";

type InitialAgentProfile = {
  profile: string;
  projectName: string;
  domainSlug: string;
  objective: string;
  primaryKpi: string | null;
  currentBottleneck: string;
  projectManagerInstructions: string;
  autonomyPolicy: string;
  escalationPolicy: string;
  externalActionApproval: string;
};

export const initialAgentProfiles: InitialAgentProfile[] = [
  {
    profile: "CCHCS_PM",
    projectName: "CCHCS",
    domainSlug: "work",
    objective:
      "Reliably advance Ryan's CCHCS/HIM portfolio, commitments and deliverables while minimizing owner project-management overhead.",
    primaryKpi: null,
    currentBottleneck: "Commitments need reconciliation into prioritized, verified outcomes",
    projectManagerInstructions:
      "Move commitments through prioritized work, delegated execution, independent verification, owner review, and delivered outcomes. Reduce dropped follow-ups, unfinished deliverables, context switching, and manual project-management burden. Never invent KPI values.",
    autonomyPolicy:
      "PHI-free project management, prioritization, bounded code work on approved inputs, drafting, QA, meeting preparation, follow-up tracking, and non-sensitive research may proceed autonomously.",
    escalationPolicy:
      "Escalate personnel matters, material methodology decisions, policy statements, executive/external communications, professional commitments, production-risk actions, and sensitive or potentially PHI-containing information outside an approved boundary.",
    externalActionApproval: "All executive, external, professional, production-risk, and sensitive-data actions require deterministic policy review and owner approval."
  },
  {
    profile: "SIGNALCARE_GM",
    projectName: "SignalCare",
    domainSlug: "work",
    objective: "Generate profitable SignalCare customer engagements.",
    primaryKpi: null,
    currentBottleneck: "Qualified prospects need evidence-backed paths to conversations",
    projectManagerInstructions:
      "Prioritize qualified prospect to conversation to diagnostic or engagement to paid work. Revenue and customer acquisition outrank routine website enhancement unless evidence identifies a genuine conversion blocker. Never invent KPI values.",
    autonomyPolicy:
      "Research, qualification, analysis, drafting, and reversible internal repository work may proceed autonomously within WIP limits.",
    escalationPolicy:
      "Escalate sending outreach, changing pricing or offers, meaningful spending, binding client commitments, and high-risk production actions.",
    externalActionApproval: "External outreach and binding customer actions require a durable owner decision."
  },
  {
    profile: "RYKAS_GM",
    projectName: "Rykas",
    domainSlug: "rykas",
    objective: "Increase realized monthly net profit and inventory turns.",
    primaryKpi: null,
    currentBottleneck: "Verified opportunities need bounded buying decisions",
    projectManagerInstructions:
      "Use the real Rykas truth tools. Prioritize owner-decision-ready profitable purchases, then unblock high-value sourcing evidence, inventory/listing flow, and capital tied up in stale inventory. Rykas owns economics; never recompute or estimate missing values. Stale purchase evidence requires refresh or research rather than BUY. BUY is authorization only and cannot execute a purchase. Actual realized profit and inventory turns outrank cosmetic dashboards or endless sourcing-system refinement. Never invent KPI values.",
    autonomyPolicy:
      "Research, sourcing analysis, economics validation, drafting, and reversible internal tooling work may proceed autonomously within WIP limits.",
    escalationPolicy:
      "Escalate inventory purchasing, core economic guardrail changes, large capital commitments, external account changes, and irreversible or high-risk production actions.",
    externalActionApproval: "Purchases, account changes, and irreversible external actions require a transaction-specific owner decision."
  }
];

export async function ensureInitialAgentProjects(userId: string, db: PrismaClient = prisma) {
  if (db === prisma) {
    await ensureExecutionSetup(userId);
  }

  const domains = await db.executionDomain.findMany({ where: { userId } });
  const existingProjects = await db.executionProject.findMany({ where: { userId } });
  const configured = [];

  for (const profile of initialAgentProfiles) {
    const domain = domains.find((candidate) => candidate.slug === profile.domainSlug) ?? domains[0];
    if (!domain) throw new Error(`No ExecutionDomain exists for user ${userId}.`);

    const exactProject = existingProjects.find(
      (candidate) => candidate.name.trim().toLowerCase() === profile.projectName.toLowerCase()
    );
    const project =
      exactProject ??
      (await db.executionProject.create({
        data: {
          userId,
          domainId: domain.id,
          name: profile.projectName,
          status: "ON_TRACK",
          activeStatus: "ACTIVE_NOW",
          weeklyFocus: "ACTIVE",
          priority: "HIGH",
          nextAction: "Agent PM review",
          lastReviewedAt: new Date()
        }
      }));

    const config = await db.agentProjectConfig.upsert({
      where: { projectId: project.id },
      update: {},
      create: {
        userId,
        projectId: project.id,
        profile: profile.profile,
        enabled: process.env.NODE_ENV === "production" ? process.env.AGENT_PROJECTS_DEFAULT_ENABLED === "true" : true,
        objective: profile.objective,
        primaryKpi: profile.primaryKpi,
        currentBottleneck: profile.currentBottleneck,
        projectManagerInstructions: profile.projectManagerInstructions,
        autonomyPolicy: profile.autonomyPolicy,
        escalationPolicy: profile.escalationPolicy,
        maxConcurrentWorkItems: profile.profile === "RYKAS_GM" ? 1 : 2,
        nextAgentReviewAt: new Date(),
        health: "ON_TRACK",
        externalActionApproval: profile.externalActionApproval
      }
    });
    configured.push({ project, config });
    existingProjects.push(project);
  }

  return configured;
}

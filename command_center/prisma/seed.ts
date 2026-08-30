import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { ensureInitialAgentProjects } from "../server/agent/setup-service";

if (!process.env.DATABASE_URL && process.env.NETLIFY_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.NETLIFY_DATABASE_URL;
}

const prisma = new PrismaClient();

async function main() {
  const email = process.env.DEFAULT_USER_EMAIL ?? "admin@example.com";
  const password = process.env.DEFAULT_USER_PASSWORD ?? "changeme123";
  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      passwordHash,
      settings: {
        create: {}
      }
    }
  });

  const defaultDomains = [
    ["Work", "work", "Leadership, analytics, dev workflows. No PHI."],
    ["Rykas", "rykas", "Amazon FBA, reorders, vendor coordination."],
    ["Casino/AP", "casino-ap", "Legal and compliant AP tracking only."],
    ["Betting Models", "betting-models", "Research queue, model maintenance, data pulls."],
    ["Poker", "poker", "Study plans and live execution prep."],
    ["Health", "health", "Protein, calories, training, recovery."],
    ["Family", "family", "Family planning and commitments."],
    ["Golf", "golf", "Practice, play, and scheduling."],
    ["Travel", "travel", "Trips, logistics, preparation."],
    ["Admin", "admin", "Paperwork, errands, misc operations."]
  ] as const;

  for (const [name, slug, description] of defaultDomains) {
    await prisma.executionDomain.upsert({
      where: { userId_slug: { userId: user.id, slug } },
      update: { description, name, isDefault: true },
      create: {
        userId: user.id,
        name,
        slug,
        description,
        isDefault: true
      }
    });
  }

  await ensureInitialAgentProjects(user.id, prisma);

  console.log(`Seeded user, execution domains, and Agent HQ projects: ${user.email}`);
}

async function run() {
  let exitCode = 0;

  try {
    await main();
  } catch (error) {
    console.error(error);
    exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }

  process.exit(exitCode);
}

void run();

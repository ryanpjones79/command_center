import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.DEFAULT_USER_EMAIL ?? "admin@example.com";
  const password = process.env.DEFAULT_USER_PASSWORD ?? "changeme123";
  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash },
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

  console.log(`Seeded user: ${user.email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

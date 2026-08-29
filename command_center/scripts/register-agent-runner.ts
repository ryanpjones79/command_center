import { prisma } from "../lib/prisma";
const email = process.env.RYANOS_RUNNER_OWNER_EMAIL; const keyId = process.env.RYANOS_RUNNER_KEY_ID; const name = process.env.RYANOS_RUNNER_NAME ?? "RyanOS Windows Runner";
if (!email || !keyId) throw new Error("Set RYANOS_RUNNER_OWNER_EMAIL and RYANOS_RUNNER_KEY_ID.");
const user = await prisma.user.findUnique({ where: { email } }); if (!user) throw new Error(`No RyanOS user found for ${email}.`);
await prisma.agentRunner.upsert({ where: { keyId }, update: { userId: user.id, name, enabled: true }, create: { userId: user.id, keyId, name } });
console.log(`Registered ${keyId} for ${email}. The HMAC secret remains environment-only.`); await prisma.$disconnect();

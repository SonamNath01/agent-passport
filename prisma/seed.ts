import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { generateKeyPair } from "@agent-passport/shared";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main(): Promise<void> {
  const user = await prisma.user.upsert({
    where: { email: "demo.user@agent-passport.dev" },
    update: {},
    create: {
      id: "user_demo",
      name: "Demo User",
      email: "demo.user@agent-passport.dev",
    },
  });

  const agentKeyPair = generateKeyPair();

  const agent = await prisma.agent.upsert({
    where: { id: "agent_demo" },
    update: { publicKey: agentKeyPair.publicKey },
    create: {
      id: "agent_demo",
      userId: user.id,
      name: "Demo Shopping Agent",
      publicKey: agentKeyPair.publicKey,
    },
  });

  // Two merchant identifiers used by scripts/demo.ts's mandate allowlist.
  // There is no dedicated Merchant table (see prisma/schema.prisma) — merchants
  // are plain string ids referenced from Mandate.merchantAllowlist.
  const merchants = ["merchant_nike", "merchant_zara"];

  console.log("Seeded:");
  console.log(`  user:      ${user.id} (${user.email})`);
  console.log(`  agent:     ${agent.id} (publicKey ${agent.publicKey.slice(0, 16)}...)`);
  console.log(`  merchants: ${merchants.join(", ")}`);
  console.log();
  console.log("Agent private key (demo-only, would never leave the agent in a real deployment):");
  console.log(`  ${agentKeyPair.privateKey}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

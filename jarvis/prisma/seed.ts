import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import path from "path";
import { randomBytes } from "crypto";

const dbPath = path.resolve(__dirname, "dev.db");
const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` });
const prisma = new PrismaClient({ adapter } as ConstructorParameters<typeof PrismaClient>[0]);

async function main() {
  const apiToken = randomBytes(32).toString("hex");

  await prisma.userProfile.upsert({
    where: { id: 1 },
    create: { id: 1, apiToken },
    update: { apiToken },
  });

  console.log(`✅ Database ready:`);
  console.log(`   - UserProfile initialised with API token`);
  console.log(`   - API token: ${apiToken.slice(0, 8)}...${apiToken.slice(-4)}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });

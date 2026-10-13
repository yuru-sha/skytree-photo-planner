import process from "node:process";
import { URL } from "node:url";
import { execFileSync } from "node:child_process";

const testAccounts = [
  { username: "e2e-browser-admin", email: "e2e-browser-admin@invalid.test", passwordKey: "E2E_ADMIN_PASSWORD" },
  { username: "e2e-password-admin", email: "e2e-password-admin@invalid.test", passwordKey: "E2E_PASSWORD_ADMIN_PASSWORD" },
];

function requireTestDatabase() {
  if (process.env.E2E_TEST_DATABASE !== "1") {
    throw new Error("Set E2E_TEST_DATABASE=1 to authorize mutations to the disposable E2E database.");
  }
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) throw new Error("Dedicated E2E requires DATABASE_URL.");
  const url = new URL(rawUrl);
  const databaseName = decodeURIComponent(url.pathname.slice(1));
  if (databaseName !== "skytree_e2e_test") {
    throw new Error("Dedicated E2E requires the skytree_e2e_test database.");
  }
  if (url.hostname !== "127.0.0.1") {
    throw new Error("Dedicated E2E accepts only PostgreSQL on 127.0.0.1.");
  }
  if (url.search || url.hash) {
    throw new Error("Dedicated E2E refuses PostgreSQL URL overrides.");
  }
}

async function getClient() {
  const [{ PrismaClient }, { PrismaPg }] = await Promise.all([
    import("../../apps/server/dist/generated/prisma/client.js"),
    import("@prisma/adapter-pg"),
  ]);
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

async function setup() {
  requireTestDatabase();
  for (const account of testAccounts) {
    const password = process.env[account.passwordKey];
    if (!password || password.length < 12) {
      throw new Error(`${account.passwordKey} must be set to a test-only password of at least 12 characters.`);
    }
  }

  execFileSync("npm", ["run", "build:server"], { stdio: "inherit" });
  execFileSync("npx", ["prisma", "migrate", "deploy", "--config", "prisma.config.ts"], { stdio: "inherit" });

  const [{ default: bcrypt }, prisma] = await Promise.all([
    import("bcrypt"),
    getClient(),
  ]);
  try {
    for (const account of testAccounts) {
      const passwordHash = await bcrypt.hash(process.env[account.passwordKey], 12);
      await prisma.admin.upsert({
        where: { username: account.username },
        create: { username: account.username, email: account.email, passwordHash, role: "admin" },
        update: { email: account.email, passwordHash, isActive: true, failedLoginCount: 0, lockedUntil: null },
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}

async function teardown() {
  requireTestDatabase();
  const prisma = await getClient();
  try {
    await prisma.admin.deleteMany({ where: { username: { in: testAccounts.map(({ username }) => username) } } });
  } finally {
    await prisma.$disconnect();
  }
}

const action = process.argv[2];
if (action === "setup") await setup();
else if (action === "teardown") await teardown();
else throw new Error(`Unknown E2E database action: ${action ?? ""}`);

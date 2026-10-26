const { PrismaClient } = require("@prisma/client");
const { randomBytes, scryptSync } = require("node:crypto");
const prisma = new PrismaClient();
function passwordHash(password) { const salt = randomBytes(16); return `${salt.toString("hex")}:${scryptSync(password, salt, 64).toString("hex")}`; }
async function seedRole(role, prefix) {
 const name = process.env[`${prefix}_NAME`]; const email = process.env[`${prefix}_EMAIL`]?.trim().toLowerCase(); const password = process.env[`${prefix}_PASSWORD`];
 if (!email && !password && !name) return;
 if (!email || !password || !name || password.length < 12) throw new Error(`${prefix}_NAME, ${prefix}_EMAIL, and ${prefix}_PASSWORD (12+ chars) must all be set.`);
 await prisma.user.upsert({ where: { email }, create: { name, email, role, passwordHash: passwordHash(password) }, update: { name, role, passwordHash: passwordHash(password) } });
 console.log(`Seeded ${role} account: ${email}`);
}
async function main() { await seedRole("ADMIN", "ADMIN"); await seedRole("VERIFIER", "VERIFIER"); if (!process.env.ADMIN_EMAIL && !process.env.VERIFIER_EMAIL) throw new Error("Set admin and/or verifier seed credentials in the ignored local .env file."); }
main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());

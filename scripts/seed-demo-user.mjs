import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const passwordHash = await bcrypt.hash("demo", 10);
const existing = await prisma.user.findUnique({ where: { username: "demo" } });
if (existing) {
  await prisma.user.update({ where: { id: existing.id }, data: { passwordHash } });
  console.log("updated demo user:", existing.id);
} else {
  const u = await prisma.user.create({ data: { username: "demo", passwordHash } });
  console.log("created demo user:", u.id);
}

await prisma.$disconnect();

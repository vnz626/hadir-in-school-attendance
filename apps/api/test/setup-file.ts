import { afterAll } from "vitest";
import { prisma } from "./helpers/db";

afterAll(async () => {
  await prisma.$disconnect();
});

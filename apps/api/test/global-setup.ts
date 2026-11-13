import { resetDatabase } from "../scripts/db-reset";

// AGENTS.md §7: hadirin_test dikosongkan dan dimigrasi ulang sebelum rangkaian tes.
export default async function setup(): Promise<void> {
  await resetDatabase("test");
}

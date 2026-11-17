import fs from "node:fs";
import path from "node:path";
import { buildTokensCss } from "./css";

const out = path.resolve(__dirname, "../dist/tokens.css");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, buildTokensCss());

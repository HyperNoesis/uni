// Test-only: lets plain Node resolve the extensionless relative imports the bundler accepts (e.g. "./world-flora" -> .ts).
import { register } from "node:module";
register("./ts-resolve-hooks.mjs", import.meta.url);

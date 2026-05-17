/**
 * Load .env before any other server module reads process.env.
 * Must be the first import in index.ts (ESM evaluates imports before module body).
 */
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
if (!process.env.OPENAI_API_KEY) {
  dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
}

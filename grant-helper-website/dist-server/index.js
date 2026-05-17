import path from 'path';
import { fileURLToPath } from 'url';
// import { createRequire } from 'module';
import dotenv from 'dotenv';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// const require = createRequire(import.meta.url);
// Load .env from project root (cwd when run via "npm run dev:server"), then try next to server/
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
if (!process.env.OPENAI_API_KEY) {
    dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
}
import app from './app.js';
const PORT = Number(process.env.PORT) || 3001;
if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`Grant chat API listening on http://localhost:${PORT}`);
    });
}
export default app;

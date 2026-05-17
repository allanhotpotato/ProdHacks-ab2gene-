import './loadEnv.js';
import app from './app.js';

const PORT = Number(process.env.PORT) || 3001;
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Grant chat API listening on http://localhost:${PORT}`);
  });
}

export default app;

import { createApp } from './src/app.js';
import { createSearcher } from './src/search.js';

try {
  process.loadEnvFile();
} catch {
  // No .env file: use the environment as it is.
}

const port = Number(process.env.PORT) || 3000;
const searcher = createSearcher();
const { demo, sources } = searcher.status();
const live = sources.filter((s) => s.configured).map((s) => s.name);

createApp({ searcher }).listen(port, () => {
  console.log(`Hisham's Tool is running at http://localhost:${port}`);
  console.log(demo
    ? 'Demo mode: no API keys found, so searches return sample data. See .env.example.'
    : `Live prices from: ${live.join(', ')}`);
});

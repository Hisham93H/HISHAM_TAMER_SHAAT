import { createApp } from './src/app.js';
import { createSearcher } from './src/search.js';

try {
  process.loadEnvFile();
} catch {
  // No .env file: use the environment as it is.
}

const port = Number(process.env.PORT) || 3000;
const searcher = createSearcher();
const live = searcher.status().sources.filter((s) => s.configured);

createApp({ searcher }).listen(port, () => {
  console.log(`Hisham's Tool is running at http://localhost:${port}`);
  for (const source of live) console.log(`  ${source.name}: ${source.countries.join(', ')}`);
  console.log('Countries without a live source show sample data. Add keys in .env to add sources (see .env.example).');
});

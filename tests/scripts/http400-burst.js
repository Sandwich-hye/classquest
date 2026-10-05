#!/usr/bin/env node
/**
 * HTTP-400 burst driver (report §2.2.8 / §7.6; AC-4).
 *
 * Fires N POSTs at the Web Tier's /api/demo/bad-request endpoint, each of which
 * returns 400. The Web Tier records status_code=400 in its CloudWatch access
 * logs, the metric filter counts them, and the alarm trips when the count
 * exceeds the threshold (default 50) within a minute.
 *
 * Usage: node tests/scripts/http400-burst.js [count] [baseUrl]
 *   count    default 60
 *   baseUrl  default http://localhost:8080
 */
const count = Number(process.argv[2] ?? 60);
const baseUrl = process.argv[3] ?? 'http://localhost:8080';
const url = `${baseUrl}/api/demo/bad-request`;

async function main() {
  console.log(`Firing ${count} intentional HTTP 400s at ${url} ...`);
  let ok = 0;
  let got400 = 0;
  await Promise.all(
    Array.from({ length: count }, async () => {
      try {
        const res = await fetch(url, { method: 'POST' });
        ok += 1;
        if (res.status === 400) got400 += 1;
      } catch (err) {
        console.error('request failed:', err.message);
      }
    }),
  );
  console.log(`Done. ${ok}/${count} completed, ${got400} returned 400.`);
  console.log('Watch the dashboard alarm flip to ALARM within ~1 minute.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

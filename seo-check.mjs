import { readFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';

const root = new URL('.', import.meta.url);
const pages = {
  'index.html': { canonical: 'https://chatz.cc.cd/', robots: 'index,follow' },
  'privacy.html': { canonical: 'https://chatz.cc.cd/privacy.html', robots: 'index,follow' },
  'terms.html': { canonical: 'https://chatz.cc.cd/terms.html', robots: 'index,follow' },
  'cookies.html': { canonical: 'https://chatz.cc.cd/cookies.html', robots: 'index,follow' },
  '404.html': { canonical: 'https://chatz.cc.cd/404.html', robots: 'noindex,follow' },
};

for (const [file, expected] of Object.entries(pages)) {
  const html = await readFile(new URL(file, root), 'utf8');
  for (const pattern of [
    /<title>[^<]+<\/title>/i,
    /<meta name="description" content="[^"]+">/i,
    new RegExp(`<link rel="canonical" href="${expected.canonical.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}">`),
    new RegExp(`<meta name="robots" content="${expected.robots}">`),
  ]) {
    if (!pattern.test(html)) throw new Error(`${file}: missing SEO element ${pattern}`);
  }
  if (!/<meta property="og:title" content="[^"]+">/i.test(html) && file !== '404.html') {
    throw new Error(`${file}: missing Open Graph title`);
  }
}

const sitemap = await readFile(new URL('sitemap.xml', root), 'utf8');
if (!sitemap.includes('https://chatz.cc.cd/')) throw new Error('sitemap: production homepage missing');
if (sitemap.includes('pages.dev') || /<loc>[^<]*[?&][^<]*<\/loc>/.test(sitemap)) throw new Error('sitemap: staging or query URL found');
if (sitemap.includes('/404')) throw new Error('sitemap: error page must not be indexed');

const robots = await readFile(new URL('robots.txt', root), 'utf8');
if (!robots.includes('Sitemap: https://chatz.cc.cd/sitemap.xml')) throw new Error('robots: production sitemap missing');
if (!robots.includes('Disallow: /api/')) throw new Error('robots: API disallow missing');
if (robots.includes('pages.dev')) throw new Error('robots: staging hostname found');

await access(new URL('og-image.png', root), constants.R_OK);
console.log('SEO checks passed.');

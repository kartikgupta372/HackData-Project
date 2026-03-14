// src/tools/scraper.tool.js
// Headless Puppeteer scraper — scrapes DOM, CSS, screenshot per page

// dotenv MUST be first — before any process.env access
require('dotenv').config();

const puppeteer = require('puppeteer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
const { HumanMessage, SystemMessage } = require('@langchain/core/messages');

// Lazy LLM — created on first use so GEMINI_API_KEY is always loaded
let _llm = null;
function getLLM() {
  if (!_llm) {
    _llm = new ChatGoogleGenerativeAI({
      model: 'gemini-2.5-flash',
      apiKey: process.env.GEMINI_API_KEY,
      temperature: 0,
      maxOutputTokens: 1500,
    });
  }
  return _llm;
}

// Uploads directory for screenshots
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// ── Helpers ────────────────────────────────────────────────────────────────────

function classifyPage(url) {
  const p = new URL(url).pathname.toLowerCase();
  if (p === '/' || p === '' || p === '/home') return 'homepage';
  if (p.includes('/product') || p.includes('/item')) return 'product';
  if (p.includes('/category') || p.includes('/collection')) return 'category';
  if (p.includes('/cart') || p.includes('/basket')) return 'cart';
  if (p.includes('/checkout')) return 'checkout';
  if (p.includes('/pricing')) return 'pricing';
  if (p.includes('/about')) return 'about';
  if (p.includes('/contact')) return 'contact';
  if (p.includes('/blog')) return 'blog';
  return 'other';
}

function normalizePageKey(url) {
  const p = new URL(url).pathname;
  return p
    .replace(/\/\d+/g, '/[id]')
    .replace(/\/[a-f0-9-]{32,}/g, '/[hash]')
    .replace(/\/$/, '') || '/';
}

async function extractCSS(page) {
  return page.evaluate(() => {
    const rules = [];
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        for (const rule of Array.from(sheet.cssRules ?? []).slice(0, 60)) {
          rules.push(rule.cssText);
        }
      } catch (_) { /* cross-origin */ }
    }
    return rules.slice(0, 120).join('\n');
  });
}

async function compressDom(html, url) {
  if (!html || html.length < 300) return html ?? '';
  try {
    const result = await getLLM().invoke([
      new SystemMessage(
        'Extract a compact DOM summary for design analysis. Include: ' +
        'page title, H1-H3 headings, CTA buttons (text + classes), nav links, ' +
        'main section classes, color-related classes, form elements, image count. ' +
        'Return as a structured plain-text summary under 400 words.'
      ),
      new HumanMessage(`URL: ${url}\n\nHTML (first 8000 chars):\n${html.substring(0, 8000)}`),
    ]);
    return result.content;
  } catch {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 2000);
  }
}

// ── Core scraper ───────────────────────────────────────────────────────────────

async function scrapeSinglePage(browser, url, options = {}) {
  const { fullPage = false } = options;
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const rt = req.resourceType();
      // Block fonts, media, and tracking to speed up load
      if (['font', 'media', 'websocket'].includes(rt)) req.abort();
      else req.continue();
    });

    // Try load first, fall back to domcontentloaded — avoids hanging on networkidle2
    try {
      await page.goto(url, { waitUntil: 'load', timeout: 20000 });
    } catch {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    }

    // Short settle wait for lazy-rendered content
    await new Promise(r => setTimeout(r, 800));

    const html = await page.content();
    const css = await extractCSS(page);
    const pageTitle = await page.title();
    const elementCount = await page.$$eval('*', els => els.length).catch(() => 0);
    const hasCta = await page.$$eval(
      'button, a[class*="btn"], a[class*="cta"], [class*="button"]',
      els => els.length > 0
    ).catch(() => false);

    const ssId = uuidv4();
    const ssPath = path.join(UPLOADS_DIR, `${ssId}.png`);

    // For heatmap surveys use fullPage; for chat analysis use viewport only
    if (fullPage) {
      // Scroll to bottom to trigger lazy images, then screenshot full page
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await new Promise(r => setTimeout(r, 500));
      await page.evaluate(() => window.scrollTo(0, 0));
      await new Promise(r => setTimeout(r, 300));
      await page.screenshot({ path: ssPath, fullPage: true });
    } else {
      await page.screenshot({ path: ssPath, fullPage: false });
    }

    const domSummary = await compressDom(html, url);

    return {
      page_url: url,
      page_key: normalizePageKey(url),
      page_type: classifyPage(url),
      page_title: pageTitle,
      html: html.substring(0, 50000),
      css: css.substring(0, 5000),
      dom_summary: domSummary,
      screenshot_url: `/uploads/${ssId}.png`,
      element_count: elementCount,
      has_cta: hasCta,
    };
  } finally {
    await page.close().catch(() => { });
  }
}

async function discoverPages(browser, rootUrl, maxPages = 5) {
  const page = await browser.newPage();
  const urls = new Set([rootUrl]);

  try {
    await page.goto(rootUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const baseHost = new URL(rootUrl).host;

    const links = await page.$$eval('a[href]', (anchors, host) =>
      anchors
        .map(a => a.href)
        .filter(h => { try { return new URL(h).host === host; } catch { return false; } }),
      baseHost
    ).catch(() => []);

    const priority = links.filter(u => {
      const p = u.toLowerCase();
      return p.includes('/product') || p.includes('/pricing') ||
        p.includes('/about') || p.includes('/shop') ||
        p.includes('/contact') || p.includes('/category');
    });

    for (const u of [...priority, ...links]) {
      if (urls.size >= maxPages) break;
      urls.add(u.split('?')[0].split('#')[0]);
    }
  } catch (err) {
    console.warn('Page discovery warning:', err.message);
  } finally {
    await page.close().catch(() => { });
  }

  return Array.from(urls).slice(0, maxPages);
}

// ── Main export ────────────────────────────────────────────────────────────────

async function scrapeWebsite(rootUrl, options = {}) {
  const { maxPages = 5, fullPage = false } = options;

  // Overall hard timeout: 90s for multi-page, 45s for single page
  const TIMEOUT_MS = maxPages === 1 ? 45000 : 90000;

  const scrapePromise = (async () => {
    const browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--disable-extensions',
        '--disable-background-networking',
      ],
    });

    try {
      const pageUrls = maxPages === 1
        ? [rootUrl]
        : await discoverPages(browser, rootUrl, maxPages);
      console.log(`  Scraping ${pageUrls.length} pages:`, pageUrls);

      const results = {};

      for (let i = 0; i < pageUrls.length; i += 3) {
        const chunk = pageUrls.slice(i, i + 3);
        const settled = await Promise.allSettled(
          chunk.map(url => scrapeSinglePage(browser, url, { fullPage }))
        );
        for (const r of settled) {
          if (r.status === 'fulfilled') results[r.value.page_key] = r.value;
          else console.warn('  Page scrape failed:', r.reason?.message);
        }
      }

      return results;
    } finally {
      await browser.close().catch(() => { });
    }
  })();

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Scrape timed out after ${TIMEOUT_MS / 1000}s`)), TIMEOUT_MS)
  );

  return Promise.race([scrapePromise, timeoutPromise]);
}

module.exports = { scrapeWebsite, normalizePageKey, classifyPage };

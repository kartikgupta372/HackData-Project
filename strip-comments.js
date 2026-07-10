/**
 * strip-comments.js — Remove all comments from project source files.
 * Run: node strip-comments.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname);

const FILES = [
  'backend/src/app.js',
  'backend/src/db/pool.js',
  'backend/src/agents/nodes.js',
  'backend/src/graph/auraGraph.js',
  'backend/src/graph/state.js',
  'backend/src/memory/chatMemory.js',
  'backend/src/middleware/auth.middleware.js',
  'backend/src/middleware/upload.middleware.js',
  'backend/src/routes/auth.routes.js',
  'backend/src/routes/chat.routes.js',
  'backend/src/routes/heatmap.routes.js',
  'backend/src/routes/insights.routes.js',
  'backend/src/routes/onboarding.routes.js',
  'backend/src/routes/recommendation.routes.js',
  'backend/src/tools/heatmap.tool.js',
  'backend/src/tools/recommendation.tool.js',
  'backend/src/tools/scraper.tool.js',
  'backend/src/tools/vectorSearch.tool.js',
  'backend/src/utils/safeParseJSON.js',
  'backend/src/utils/sseRegistry.js',
  'backend/src/utils/validateUUID.js',
  'backend/src/utils/validateUrl.js',
  'backend/test-db.js',
  'backend/scripts/seed-pinecone.js',
  'backend/scripts/test-rec.js',
  'frontend/src/App.jsx',
  'frontend/src/main.jsx',
  'frontend/src/index.css',
  'frontend/src/api/auth.api.js',
  'frontend/src/api/axios.js',
  'frontend/src/api/chat.api.js',
  'frontend/src/api/heatmap.api.js',
  'frontend/src/api/insights.api.js',
  'frontend/src/api/onboarding.api.js',
  'frontend/src/api/recommendations.api.js',
  'frontend/src/components/auth/GoogleIdentityButton.jsx',
  'frontend/src/components/chat/ChatInput.jsx',
  'frontend/src/components/chat/ChatView.jsx',
  'frontend/src/components/chat/MessageBubble.jsx',
  'frontend/src/components/chat/MessageList.jsx',
  'frontend/src/components/chat/ProgressBar.jsx',
  'frontend/src/components/heatmap/HeatmapGrid.jsx',
  'frontend/src/components/heatmap/HeatmapStats.jsx',
  'frontend/src/components/heatmap/HeatmapView.jsx',
  'frontend/src/components/heatmap/SurveyPanel.jsx',
  'frontend/src/components/insights/InsightsView.jsx',
  'frontend/src/components/layout/AppShell.jsx',
  'frontend/src/components/layout/FeatureSwitcher.jsx',
  'frontend/src/components/layout/Sidebar.jsx',
  'frontend/src/components/onboarding/OnboardingForm.jsx',
  'frontend/src/components/recommendations/PageRankCard.jsx',
  'frontend/src/components/recommendations/PreferenceProfile.jsx',
  'frontend/src/components/recommendations/RecommendationsView.jsx',
  'frontend/src/components/ui/Badge.jsx',
  'frontend/src/components/ui/Button.jsx',
  'frontend/src/components/ui/Input.jsx',
  'frontend/src/components/ui/Spinner.jsx',
  'frontend/src/landing-components/Aboutsec.tsx',
  'frontend/src/landing-components/Abouttxt.tsx',
  'frontend/src/landing-components/FAQ.tsx',
  'frontend/src/landing-components/Featuresec.tsx',
  'frontend/src/landing-components/Footer.tsx',
  'frontend/src/landing-components/Hero.tsx',
  'frontend/src/landing-components/Inputbox.tsx',
  'frontend/src/landing-components/LogoLoop.tsx',
  'frontend/src/landing-components/Reviews.tsx',
  'frontend/src/landing-components/Robot.tsx',
  'frontend/src/landing-components/integrations.tsx',
  'frontend/src/landing-components/textreveal.tsx',
  'frontend/src/landing-components/ui/Preloader.tsx',
  'frontend/src/landing-components/ui/ReviewCrousel.tsx',
  'frontend/src/landing-components/ui/Textcrousel.tsx',
  'frontend/src/landing-components/ui/button.tsx',
  'frontend/src/landing-components/ui/canvas-reveal-effect.tsx',
  'frontend/src/landing-components/ui/card.tsx',
  'frontend/src/landing-components/ui/cardfeature.tsx',
  'frontend/src/landing-components/ui/dot-pattern.tsx',
  'frontend/src/landing-components/ui/footernoise.tsx',
  'frontend/src/landing-components/ui/grid-pattern.tsx',
  'frontend/src/landing-components/ui/sparkles-core.tsx',
  'frontend/src/landing-components/ui/sparkles-text.tsx',
  'frontend/src/landing-components/ui/splite.tsx',
  'frontend/src/landing-components/ui/spotlight.tsx',
  'frontend/src/pages/AppPage.jsx',
  'frontend/src/pages/LandingPage.jsx',
  'frontend/src/pages/LoginPage.jsx',
  'frontend/src/pages/RegisterPage.jsx',
  'frontend/src/pages/SurveyPage.jsx',
  'frontend/src/store/authStore.js',
  'frontend/src/store/chatStore.js',
  'frontend/src/store/uiStore.js',
  'frontend/vite.config.js',
  'frontend/tailwind.config.js',
  'frontend/postcss.config.js',
  'frontend/index.html',
  'frontend/.env',
  'frontend/.env.example',
  'backend/.env.example',
  'start.bat',
  'start.ps1',
  'backend/src/db/migrations/001_schema.sql',
  'backend/src/db/migrations/002_missing_tables.sql',
  'backend/src/db/migrations/003_exec_sql_functions.sql',
];

function stripJsComments(code) {
  let result = '';
  let i = 0;
  const len = code.length;

  while (i < len) {
    if (code[i] === "'") {
      let end = i + 1;
      while (end < len && code[end] !== "'") {
        if (code[end] === '\\') end++;
        end++;
      }
      result += code.substring(i, end + 1);
      i = end + 1;
    }
    else if (code[i] === '"') {
      let end = i + 1;
      while (end < len && code[end] !== '"') {
        if (code[end] === '\\') end++;
        end++;
      }
      result += code.substring(i, end + 1);
      i = end + 1;
    }
    else if (code[i] === '`') {
      let end = i + 1;
      let depth = 0;
      while (end < len) {
        if (code[end] === '\\') { end += 2; continue; }
        if (code[end] === '$' && end + 1 < len && code[end + 1] === '{') { depth++; end += 2; continue; }
        if (code[end] === '}' && depth > 0) { depth--; end++; continue; }
        if (code[end] === '`' && depth === 0) break;
        end++;
      }
      result += code.substring(i, end + 1);
      i = end + 1;
    }
    else if (code[i] === '/' && i + 1 < len && code[i + 1] === '*') {
      let end = code.indexOf('*/', i + 2);
      if (end === -1) end = len;
      else end += 2;
      const beforeComment = result.lastIndexOf('\n');
      const lineStart = result.substring(beforeComment + 1);
      if (lineStart.trim() === '') {
        result = result.substring(0, beforeComment + 1);
        if (end < len && code[end] === '\n') end++;
        else if (end < len && code[end] === '\r' && end + 1 < len && code[end + 1] === '\n') end += 2;
      }
      i = end;
    }
    else if (code[i] === '/' && i + 1 < len && code[i + 1] === '/') {
      const beforeComment = result.lastIndexOf('\n');
      const lineStart = result.substring(beforeComment + 1);
      let end = code.indexOf('\n', i);
      if (end === -1) end = len;

      if (lineStart.trim() === '') {
        result = result.substring(0, beforeComment + 1);
        i = end + 1;
      } else {
        result = result.replace(/\s+$/, '');
        i = end;
      }
    }
    else if (code[i] === '/' && i + 1 < len && code[i + 1] !== '/' && code[i + 1] !== '*') {
      const prevNonSpace = result.trimEnd();
      const lastChar = prevNonSpace[prevNonSpace.length - 1];
      const regexPrecursors = '=([{,;!&|?:~^%*/+-><';
      if (!lastChar || regexPrecursors.includes(lastChar) ||
          prevNonSpace.endsWith('return') || prevNonSpace.endsWith('typeof') ||
          prevNonSpace.endsWith('case') || prevNonSpace.endsWith('new')) {
        let end = i + 1;
        while (end < len && code[end] !== '/') {
          if (code[end] === '\\') end++;
          if (code[end] === '[') {
            end++;
            while (end < len && code[end] !== ']') {
              if (code[end] === '\\') end++;
              end++;
            }
          }
          end++;
        }
        end++;
        while (end < len && /[gimsuy]/.test(code[end])) end++;
        result += code.substring(i, end);
        i = end;
      } else {
        result += code[i];
        i++;
      }
    }
    else {
      result += code[i];
      i++;
    }
  }

  return result.replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').trimEnd() + '\n';
}

function stripCssComments(code) {
  let result = '';
  let i = 0;
  while (i < code.length) {
    if (code[i] === '/' && i + 1 < code.length && code[i + 1] === '*') {
      let end = code.indexOf('*/', i + 2);
      if (end === -1) end = code.length;
      else end += 2;
      const beforeComment = result.lastIndexOf('\n');
      const lineStart = result.substring(beforeComment + 1);
      if (lineStart.trim() === '') {
        result = result.substring(0, beforeComment + 1);
        if (end < code.length && code[end] === '\n') end++;
      }
      i = end;
    }
    else if (code[i] === '"' || code[i] === "'") {
      const q = code[i];
      let end = i + 1;
      while (end < code.length && code[end] !== q) {
        if (code[end] === '\\') end++;
        end++;
      }
      result += code.substring(i, end + 1);
      i = end + 1;
    }
    else {
      result += code[i];
      i++;
    }
  }
  return result.replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').trimEnd() + '\n';
}

function stripHtmlComments(code) {
  return code.replace(/\s*<!--[\s\S]*?-->\s*/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').trimEnd() + '\n';
}

function stripHashComments(code) {
  return code.split('\n')
    .filter(line => !line.match(/^\s*#/))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+/, '')
    .trimEnd() + '\n';
}

function stripSqlComments(code) {
  let result = code.split('\n')
    .map(line => {
      if (line.match(/^\s*--/)) return null;
      return line.replace(/\s+--\s.*$/, '');
    })
    .filter(line => line !== null)
    .join('\n');

  result = result.replace(/\/\*[\s\S]*?\*\//g, '');
  return result.replace(/\n{3,}/g, '\n\n').replace(/^\n+/, '').trimEnd() + '\n';
}

function stripBatComments(code) {
  return code.split('\n')
    .filter(line => !line.match(/^\s*(?:REM\s|::)/i))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+/, '')
    .trimEnd() + '\n';
}

function stripPs1Comments(code) {
  return code.split('\n')
    .filter(line => !line.match(/^\s*#(?!!)/) )
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+/, '')
    .trimEnd() + '\n';
}

function getStripper(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const name = path.basename(filePath).toLowerCase();

  if (name === '.env' || name === '.env.example') return stripHashComments;
  if (ext === '.sql') return stripSqlComments;
  if (ext === '.bat') return stripBatComments;
  if (ext === '.ps1') return stripPs1Comments;
  if (ext === '.html') return stripHtmlComments;
  if (ext === '.css') return stripCssComments;
  if (['.js', '.jsx', '.ts', '.tsx'].includes(ext)) return stripJsComments;
  return null;
}

let processed = 0;
let skipped = 0;
let errors = 0;

for (const relPath of FILES) {
  const absPath = path.join(ROOT, relPath);
  if (!fs.existsSync(absPath)) {
    console.log(`SKIP (not found): ${relPath}`);
    skipped++;
    continue;
  }

  const stripper = getStripper(relPath);
  if (!stripper) {
    console.log(`SKIP (no handler): ${relPath}`);
    skipped++;
    continue;
  }

  try {
    const original = fs.readFileSync(absPath, 'utf-8');
    const stripped = stripper(original);

    if (stripped !== original) {
      fs.writeFileSync(absPath, stripped, 'utf-8');
      const removedLines = original.split('\n').length - stripped.split('\n').length;
      console.log(`STRIPPED: ${relPath} (-${removedLines} lines)`);
    } else {
      console.log(`NO CHANGE: ${relPath}`);
    }
    processed++;
  } catch (err) {
    console.error(`ERROR: ${relPath} — ${err.message}`);
    errors++;
  }
}

console.log(`\nDone. Processed: ${processed}, Skipped: ${skipped}, Errors: ${errors}`);

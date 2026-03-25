const express = require('express');
const cors    = require('cors');
const fs      = require('fs');
const path    = require('path');
const app     = express();
const PORT    = process.env.PORT || 3000;

// ── CORS ─────────────────────────────────────────────────────────────────────
// Allow the Vercel frontend and local dev to reach the API
app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://mtechnic-presentation.vercel.app',
    /\.vercel\.app$/,
    /\.railway\.app$/,
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
}));

app.use(express.json({ limit: '100mb' }));
app.use(express.static(__dirname));

// ── HEALTH CHECK ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true, service: 'mtechnic-pdf-backend' }));

// ── SAVE HTML ────────────────────────────────────────────────────────────────
// Local dev: writes file to disk
// Railway: returns the HTML as a downloadable file response
app.post('/save', (req, res) => {
  try {
    const html = req.body.html;
    if (!html) return res.status(400).json({ ok: false, error: 'No HTML provided' });

    if (process.env.RAILWAY_ENVIRONMENT) {
      // Cloud: send back as a download
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="mTechnic_Presentation.html"');
      return res.send(html);
    }

    // Local: write to disk
    const outPath = path.join(__dirname, 'presentation_saved.html');
    fs.writeFileSync(outPath, html, 'utf8');
    console.log('✓ Saved to presentation_saved.html');
    res.json({ ok: true, path: outPath });
  } catch (err) {
    console.error('Save error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── EXPORT PDF ───────────────────────────────────────────────────────────────
// Returns the PDF as a binary download stream (works locally and on Railway)
app.post('/export-pdf', async (req, res) => {
  let browser;
  try {
    const puppeteer = require('puppeteer');
    const html = req.body.html;
    if (!html) return res.status(400).json({ ok: false, error: 'No HTML provided' });

    console.log('⏳ Generating PDF…');

    const launchOpts = {
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    };

    // On Railway, use the system-installed Chromium (set via PUPPETEER_EXECUTABLE_PATH)
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      launchOpts.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    }

    browser = await puppeteer.launch(launchOpts);
    const page = await browser.newPage();

    // Strip editor chrome for clean print output
    const printHtml = html.replace(
      '</head>',
      '<style>.toolbar,.page-nav,.swap-btn{display:none!important;}[contenteditable]{outline:none!important;cursor:default!important;}</style></head>'
    );

    await page.setContent(printHtml, { waitUntil: 'networkidle0', timeout: 30000 });
    await new Promise(r => setTimeout(r, 1500)); // wait for fonts

    const pdf = await page.pdf({
      format: 'A4',
      landscape: true,
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });

    await browser.close();
    console.log('✓ PDF generated (' + (pdf.length / 1024).toFixed(0) + ' KB)');

    // Always stream the PDF back — browser triggers download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="mTechnic_Presentation_2026.pdf"');
    res.setHeader('Content-Length', pdf.length);
    res.end(pdf);

  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    console.error('PDF export error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log('');
  console.log('  ┌─────────────────────────────────────────────────────┐');
  console.log('  │  mTechnic® Presentation Editor — Backend            │');
  console.log('  │  → http://localhost:' + PORT + '                          │');
  console.log('  │                                                     │');
  console.log('  │  POST /export-pdf  →  streams PDF binary            │');
  console.log('  │  POST /save        →  save / download HTML          │');
  console.log('  │  GET  /health      →  health check                  │');
  console.log('  └─────────────────────────────────────────────────────┘');
  console.log('');
});

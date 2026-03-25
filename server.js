const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = 3000;

app.use(express.json({ limit: '100mb' }));
app.use(express.static(__dirname));

// Save edited HTML to disk
app.post('/save', (req, res) => {
  try {
    const html = req.body.html;
    if (!html) return res.status(400).json({ ok: false, error: 'No HTML provided' });
    const outPath = path.join(__dirname, 'presentation_saved.html');
    fs.writeFileSync(outPath, html, 'utf8');
    console.log('✓ Saved to presentation_saved.html');
    res.json({ ok: true, path: outPath });
  } catch (err) {
    console.error('Save error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Export PDF via Puppeteer (headless Chrome)
app.post('/export-pdf', async (req, res) => {
  let browser;
  try {
    const puppeteer = require('puppeteer');
    const html = req.body.html;
    if (!html) return res.status(400).json({ ok: false, error: 'No HTML provided' });

    console.log('⏳ Generating PDF…');
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    // Inject a print-mode flag so the HTML hides editor chrome
    const printHtml = html.replace(
      '</head>',
      '<style>.toolbar,.page-nav,.swap-btn{display:none!important;}[contenteditable]{outline:none!important;cursor:default!important;}</style></head>'
    );

    await page.setContent(printHtml, { waitUntil: 'networkidle0', timeout: 30000 });

    // Wait for fonts to render
    await new Promise(r => setTimeout(r, 1500));

    const pdf = await page.pdf({
      format: 'A4',
      landscape: true,
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 }
    });

    await browser.close();

    const outPath = path.join(__dirname, 'mTechnic_Presentation_2026.pdf');
    fs.writeFileSync(outPath, pdf);
    console.log('✓ PDF exported to mTechnic_Presentation_2026.pdf');
    res.json({ ok: true, path: outPath });

  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    console.error('PDF export error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log('');
  console.log('  ┌─────────────────────────────────────────────────────┐');
  console.log('  │  mTechnic® Presentation Editor                      │');
  console.log('  │  → http://localhost:' + PORT + '                          │');
  console.log('  │                                                     │');
  console.log('  │  Click any text to edit · Click grey box for image │');
  console.log('  │  Use toolbar buttons to Save & Export PDF           │');
  console.log('  └─────────────────────────────────────────────────────┘');
  console.log('');
});

// Local preview only. Never expose this development server to the internet.
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const port = Number(process.env.PORT || 4173);
const handlers = {
  '/api/taxi-estimate': require('../api/taxi-estimate'),
  '/api/taxi-booking': require('../api/taxi-booking'),
  '/api/taxi-interest': require('../api/taxi-interest'),
};
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.pdf': 'application/pdf' };

http.createServer(async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    if (handlers[pathname]) {
      let body = '';
      for await (const chunk of request) {
        body += chunk;
        if (body.length > 16000) { response.writeHead(413); response.end(); return; }
      }
      request.body = body;
      response.status = code => { response.statusCode = code; return response; };
      response.json = data => { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(data)); };
      await handlers[pathname](request, response);
      return;
    }
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
    // Only public website files, never source scripts, credentials or Git data.
    if (!/^\/(?:assets\/(?!.*(?:^|\/)\.).+|[a-zA-Z0-9_-]+\.(?:html|ico|svg|webmanifest|txt|xml))$/.test(pathname) && pathname !== '/') {
      response.writeHead(404); response.end('Niet gevonden'); return;
    }
    const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root + path.sep)) { response.writeHead(403); response.end(); return; }
    const content = await fs.readFile(file);
    response.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch {
    if (!response.headersSent) response.writeHead(404);
    response.end('Niet gevonden');
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`Voorbeeld: http://127.0.0.1:${port}/taxi-service.html`);
  console.log(process.env.TAXI_GOOGLE_APPS_SCRIPT_URL && process.env.TAXI_FORM_SECRET
    ? 'LET OP: echte Google-koppeling geconfigureerd; inzendingen worden echt verwerkt.'
    : 'Google-koppeling niet geconfigureerd: berekening/boeken geeft een beschikbaarheidsmelding.');
});

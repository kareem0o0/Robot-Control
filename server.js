#!/usr/bin/env node

const fs = require('fs');
const http = require('http');
const path = require('path');

const root = __dirname;
const port = Number(process.env.PORT || 8000);
const host = process.env.HOST || '127.0.0.1';
const registryPath = path.join(root, 'project', 'hexapods.json');

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.glb': 'model/gltf-binary'
};

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data, null, 2));
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 4 * 1024 * 1024) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

async function handleApi(req, res) {
  if (req.url !== '/api/hexapods') return false;

  if (req.method === 'GET') {
    fs.promises.readFile(registryPath, 'utf8').then((content) => {
      try {
        sendJson(res, 200, JSON.parse(content));
      } catch (parseError) {
        sendJson(res, 500, { error: parseError.message });
      }
    }).catch((error) => {
      sendJson(res, 500, { error: error.message });
    });
    return true;
  }

  if (req.method === 'PUT') {
    try {
      const data = JSON.parse(await readRequestBody(req));
      if (!Array.isArray(data.projects)) {
        sendJson(res, 400, { error: 'Registry JSON must contain a projects array.' });
        return true;
      }
      fs.mkdirSync(path.dirname(registryPath), { recursive: true });
      fs.writeFileSync(registryPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
      sendJson(res, 200, data);
    } catch (error) {
      sendJson(res, 400, { error: error.message });
    }
    return true;
  }

  sendJson(res, 405, { error: 'Method not allowed' });
  return true;
}

function safeStaticPath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const relative = decoded === '/' ? 'main-dashboard.html' : decoded.replace(/^\/+/, '');
  const resolved = path.resolve(root, relative);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) return null;
  return resolved;
}

const server = http.createServer(async (req, res) => {
  if (await handleApi(req, res)) return;

  const filePath = safeStaticPath(req.url || '/');
  if (!filePath) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Try: PORT=8001 node server.js`);
  } else if (error.code === 'EPERM') {
    console.error(`Permission denied while opening ${host}:${port}. Try another port or run from a normal terminal.`);
  } else {
    console.error(error);
  }
  process.exit(1);
});

server.listen(port, host, () => {
  console.log(`Hexabot control server running at http://${host}:${port}/`);
  console.log(`Project registry API: http://${host}:${port}/api/hexapods`);
});

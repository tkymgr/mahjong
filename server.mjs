import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Optional dependency-free server for the Vite build output.
let root;
try {
  root = await realpath(resolve(dirname(fileURLToPath(import.meta.url)), 'dist'));
} catch {
  console.error('dist が見つかりません。先に npm run build を実行してください。');
  process.exit(1);
}
const usage = `四人麻雀 — ビルド済みファイルの配信サーバー

  node server.mjs
  node server.mjs --port 4174
  node server.mjs --host 0.0.0.0

  --host <address>  待ち受け先（初期値: 127.0.0.1）
  --port <number>   ポート番号（初期値: 4173）
  --help           この説明を表示
`;

function readOptions(args) {
  const options = { host: '127.0.0.1', port: 4173 };
  for (let i = 0; i < args.length; i += 1) {
    const argument = args[i];
    if (argument === '--help' || argument === '-h') {
      console.log(usage);
      process.exit(0);
    }
    if (argument !== '--host' && argument !== '--port') {
      throw new Error(`不明なオプションです: ${argument}`);
    }
    const value = args[++i];
    if (!value || value.startsWith('--')) {
      throw new Error(`${argument} の後に値を指定してください。`);
    }
    if (argument === '--host') {
      options.host = value;
    } else {
      if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535) {
        throw new Error('--port は 1〜65535 の整数で指定してください。');
      }
      options.port = Number(value);
    }
  }
  return options;
}

let options;
try {
  options = readOptions(process.argv.slice(2));
} catch (error) {
  console.error(`${error.message}\n\n${usage}`);
  process.exit(1);
}

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.md': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
};

function isInsideRoot(path) {
  return path === root || path.startsWith(root + sep);
}

function reply(request, response, status, message, headers = {}) {
  response.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(message),
    'X-Content-Type-Options': 'nosniff',
    ...headers
  });
  response.end(request.method === 'HEAD' ? undefined : message);
}

async function serve(request, response) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    reply(request, response, 405, 'Method not allowed', { Allow: 'GET, HEAD' });
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent((request.url || '/').split(/[?#]/, 1)[0]);
  } catch {
    reply(request, response, 400, 'Invalid URL');
    return;
  }
  const parts = pathname.split('/');
  if (!pathname.startsWith('/') || pathname.includes('\\') || pathname.includes('\0') ||
      parts.some((part) => part === '..' || part.startsWith('.'))) {
    reply(request, response, 403, 'Forbidden');
    return;
  }

  const relativePath = pathname.endsWith('/') ? pathname + 'index.html' : pathname;
  const candidate = resolve(root, '.' + relativePath);
  if (!isInsideRoot(candidate)) {
    reply(request, response, 403, 'Forbidden');
    return;
  }

  let filePath;
  let metadata;
  try {
    filePath = await realpath(candidate);
    if (!isInsideRoot(filePath)) {
      reply(request, response, 403, 'Forbidden');
      return;
    }
    metadata = await stat(filePath);
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
      reply(request, response, 404, 'File not found');
      return;
    }
    throw error;
  }
  if (!metadata.isFile()) {
    reply(request, response, 404, 'File not found');
    return;
  }

  const headers = {
    'Content-Type': mimeTypes[extname(filePath).toLowerCase()] || 'application/octet-stream',
    'Content-Length': metadata.size,
    'Cache-Control': 'no-cache',
    'Accept-Ranges': 'bytes',
    'X-Content-Type-Options': 'nosniff'
  };
  let status = 200;
  let range;
  if (request.headers.range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
    let start;
    let end;
    if (match && (match[1] || match[2])) {
      start = match[1] ? Number(match[1]) : Math.max(0, metadata.size - Number(match[2]));
      end = match[1] && match[2] ? Math.min(Number(match[2]), metadata.size - 1) : metadata.size - 1;
    }
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) ||
        start < 0 || start > end || start >= metadata.size) {
      reply(request, response, 416, 'Range not satisfiable', {
        'Content-Range': `bytes */${metadata.size}`
      });
      return;
    }
    range = { start, end };
    status = 206;
    headers['Content-Length'] = end - start + 1;
    headers['Content-Range'] = `bytes ${start}-${end}/${metadata.size}`;
  }
  response.writeHead(status, headers);
  if (request.method === 'HEAD') {
    response.end();
    return;
  }
  const stream = createReadStream(filePath, range);
  stream.on('error', () => response.destroy());
  response.on('close', () => stream.destroy());
  stream.pipe(response);
}

const server = createServer((request, response) => {
  serve(request, response).catch((error) => {
    console.error(`ファイルを読み込めませんでした: ${error.code || error.message}`);
    if (response.headersSent) response.destroy();
    else reply(request, response, 500, 'Internal server error');
  });
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    const alternativePort = options.port === 65535 ? 4173 : options.port + 1;
    console.error(`ポート ${options.port} は使用中です。npm start -- --port ${alternativePort} などで変更してください。`);
  } else if (error.code === 'EACCES') {
    console.error(`ポート ${options.port} を開けません。4173 など別のポートを指定してください。`);
  } else {
    console.error(`起動できませんでした: ${error.message}`);
  }
  process.exitCode = 1;
});

server.listen(options.port, options.host, () => {
  const openHost = options.host === '0.0.0.0' || options.host === '::' ? '127.0.0.1' : options.host;
  const urlHost = openHost.includes(':') ? `[${openHost}]` : openHost;
  console.log(`四人麻雀を起動しました。\nhttp://${urlHost}:${options.port}/\n\n終了するには Ctrl+C を押してください。`);
  if (options.host === '0.0.0.0' || options.host === '::') {
    console.log(`スマートフォンでは、同じ Wi-Fi のパソコンの IP アドレスと :${options.port} を指定してください。`);
  }
});

process.on('SIGINT', () => {
  server.close();
  server.closeIdleConnections();
});

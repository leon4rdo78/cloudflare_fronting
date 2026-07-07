// TLS-only WebSocket Worker
// Client path format:
//   /origin.example.com/ws-path
//
// Example:
//   /tr.fishtailfn.fun/download
// forwards to:
//   https://tr.fishtailfn.fun:8443/download

const UPSTREAM_TLS_PORT = '8443';

export default {
  async fetch(request) {
    const incomingUrl = new URL(request.url);

    if (incomingUrl.pathname === '/') {
      return new Response(renderHomePage(), {
        headers: {
          'content-type': 'text/html; charset=UTF-8',
        },
      });
    }

    return forwardToTlsOrigin(request, incomingUrl);
  },
};

function renderHomePage() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TLS Worker</title>
  <style>
    html, body {
      margin: 0;
      min-height: 100%;
      background: #fff;
      color: #000;
      font-family: "Google Sans", "Product Sans", Arial, sans-serif;
    }

    body {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
    }

    main {
      font-size: 20px;
      line-height: 1.5;
      padding: 24px;
    }
  </style>
</head>
<body>
  <main>this worker forwards tls upstream to port ${UPSTREAM_TLS_PORT}</main>
</body>
</html>`;
}

function forwardToTlsOrigin(request, incomingUrl) {
  const pathParts = incomingUrl.pathname.split('/').filter(Boolean);

  if (pathParts.length < 2) {
    return new Response('Invalid path. Use /hostname/path, for example /tr.fishtailfn.fun/download', {
      status: 400,
      headers: { 'content-type': 'text/plain; charset=UTF-8' },
    });
  }

  const upstreamHostname = decodeURIComponent(pathParts[0]);

  if (upstreamHostname.includes(':')) {
    return new Response('Invalid hostname. Do not include a port in the path. Use /hostname/path, for example /tr.fishtailfn.fun/download', {
      status: 400,
      headers: { 'content-type': 'text/plain; charset=UTF-8' },
    });
  }

  const upstreamPath = '/' + pathParts.slice(1).map(encodeURIComponent).join('/');

  const upstreamUrl = new URL(incomingUrl.toString());
  upstreamUrl.protocol = 'https:';
  upstreamUrl.hostname = upstreamHostname;
  upstreamUrl.port = UPSTREAM_TLS_PORT;
  upstreamUrl.pathname = upstreamPath;

  const upstreamHeaders = new Headers(request.headers);

  // Force the WebSocket Host header expected by the 3x-ui inbound.
  upstreamHeaders.set('host', upstreamHostname);

  // Keep useful forwarding metadata.
  upstreamHeaders.set('x-forwarded-host', incomingUrl.hostname);
  upstreamHeaders.set('x-forwarded-proto', incomingUrl.protocol.replace(':', ''));

  const upstreamRequest = new Request(upstreamUrl.toString(), {
    method: request.method,
    headers: upstreamHeaders,
    body: request.body,
    redirect: request.redirect,
    cf: request.cf,
  });

  return fetch(upstreamRequest);
}

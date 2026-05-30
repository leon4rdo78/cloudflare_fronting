// Cloudflare Worker: auto protocol + mirror-port WebSocket front
//
// Old/legacy path format stays the same:
//   /<backend-host>/<backend-ws-path>
//
// Behavior:
//   HTTP-front Cloudflare ports  -> http://<backend-host>:<same-port>/<backend-ws-path>
//   HTTPS-front Cloudflare ports -> https://<backend-host>:<same-port>/<backend-ws-path>
//
// HTTP-front ports:
//   80, 8080, 8880, 2052, 2082, 2086, 2095
// HTTPS-front ports:
//   443, 8443, 2053, 2083, 2087, 2096
//
// Examples with client path /vps.example.com/download:
//   Client -> Worker on http://worker-domain:8080  => http://vps.example.com:8080/download
//   Client -> Worker on https://worker-domain:8443 => https://vps.example.com:8443/download
//
// Optional explicit backend port override is still accepted:
//   /vps.example.com:2082/download
// In that case the explicit backend port is used, but the backend protocol is still chosen by front-port class.

const HTTP_FRONT_PORTS = new Set(["80", "8080", "8880", "2052", "2082", "2086", "2095"]);
const HTTPS_FRONT_PORTS = new Set(["443", "8443", "2053", "2083", "2087", "2096"]);

export default {
  async fetch(request) {
    try {
      const incomingUrl = new URL(request.url);

      if (incomingUrl.pathname === "/" && request.method === "GET") {
        return new Response(renderInfoPage(request, incomingUrl), {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }

      const targetUrl = buildBackendUrl(request, incomingUrl);
      if (!targetUrl) {
        return new Response("Invalid proxy path. Use /<backend-host>/<backend-path>", { status: 400 });
      }

      return fetch(new Request(targetUrl, request));
    } catch (error) {
      return new Response(`Worker error: ${error && error.message ? error.message : String(error)}`, {
        status: 500,
      });
    }
  },
};

function buildBackendUrl(request, incomingUrl) {
  const pathWithoutLeadingSlash = incomingUrl.pathname.replace(/^\/+/, "");
  if (!pathWithoutLeadingSlash) return null;

  const firstSlashIndex = pathWithoutLeadingSlash.indexOf("/");
  const rawHostPart = firstSlashIndex === -1
    ? pathWithoutLeadingSlash
    : pathWithoutLeadingSlash.slice(0, firstSlashIndex);

  const backendPath = firstSlashIndex === -1
    ? "/"
    : "/" + pathWithoutLeadingSlash.slice(firstSlashIndex + 1);

  const backend = parseBackendHostPart(rawHostPart);
  if (!backend || !backend.hostname) return null;

  const front = detectFront(request, incomingUrl);
  const backendPort = backend.port || front.port;
  const backendProtocol = front.backendProtocol;

  const targetUrl = new URL(`${backendProtocol}//placeholder.invalid`);
  targetUrl.hostname = backend.hostname;
  targetUrl.port = backendPort;
  targetUrl.pathname = backendPath;
  targetUrl.search = incomingUrl.search;

  return targetUrl.toString();
}

function detectFront(request, incomingUrl) {
  const port = getFrontPort(request, incomingUrl);

  if (HTTP_FRONT_PORTS.has(port)) {
    return {
      port,
      className: "HTTP-front / non-TLS backend",
      backendProtocol: "http:",
      backendProtocolDisplay: "http",
    };
  }

  if (HTTPS_FRONT_PORTS.has(port)) {
    return {
      port,
      className: "HTTPS-front / TLS backend",
      backendProtocol: "https:",
      backendProtocolDisplay: "https",
    };
  }

  // Conservative fallback for unusual cases where Cloudflare/Workers does not expose the custom port.
  // This keeps the Worker usable on default ports even if Host does not include :port.
  const fallbackIsHttps = incomingUrl.protocol === "https:";
  return {
    port,
    className: fallbackIsHttps ? "HTTPS-front fallback / TLS backend" : "HTTP-front fallback / non-TLS backend",
    backendProtocol: fallbackIsHttps ? "https:" : "http:",
    backendProtocolDisplay: fallbackIsHttps ? "https" : "http",
  };
}

function parseBackendHostPart(rawHostPart) {
  const hostPart = safeDecodeURIComponent(rawHostPart).trim();
  if (!hostPart) return null;

  // IPv6 in brackets: /[2001:db8::1]:8080/download
  if (hostPart.startsWith("[")) {
    const endBracket = hostPart.indexOf("]");
    if (endBracket === -1) return null;

    const hostname = hostPart.slice(1, endBracket);
    const rest = hostPart.slice(endBracket + 1);
    const port = rest.startsWith(":") ? sanitizePort(rest.slice(1)) : "";
    return { hostname, port };
  }

  // Domain/IPv4 with optional port. Plain IPv6 without brackets is intentionally not parsed.
  const lastColon = hostPart.lastIndexOf(":");
  if (lastColon > -1 && hostPart.indexOf(":") === lastColon) {
    const possiblePort = hostPart.slice(lastColon + 1);
    const port = sanitizePort(possiblePort);
    if (port) {
      return { hostname: hostPart.slice(0, lastColon), port };
    }
  }

  return { hostname: hostPart, port: "" };
}

function getFrontPort(request, incomingUrl) {
  // URL.port is usually present for non-default ports when the request URL includes :port.
  if (incomingUrl.port) {
    const urlPort = sanitizePort(incomingUrl.port);
    if (urlPort) return urlPort;
  }

  // Host header normally preserves non-default ports: example.com:8080 or example.com:8443.
  const hostHeader = request.headers.get("host") || "";
  const bracketedIpv6WithPort = hostHeader.match(/^\[[^\]]+\]:(\d{1,5})$/);
  if (bracketedIpv6WithPort) {
    const port = sanitizePort(bracketedIpv6WithPort[1]);
    if (port) return port;
  }

  const hostWithPort = hostHeader.match(/:(\d{1,5})$/);
  if (hostWithPort) {
    const port = sanitizePort(hostWithPort[1]);
    if (port) return port;
  }

  return incomingUrl.protocol === "https:" ? "443" : "80";
}

function sanitizePort(port) {
  if (!/^\d{1,5}$/.test(port || "")) return "";
  const number = Number(port);
  if (!Number.isInteger(number) || number < 1 || number > 65535) return "";
  return String(number);
}

function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function renderInfoPage(request, incomingUrl) {
  const front = detectFront(request, incomingUrl);
  const sampleHost = "vps.example.com";
  const samplePath = "/download";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Auto Protocol Mirror-Port Worker</title>
  <style>
    body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;line-height:1.5;max-width:960px;margin:40px auto;padding:0 18px;color:#111827;background:#ffffff}
    h1{font-size:1.55rem;margin-bottom:.5rem}
    code,pre{background:#f3f4f6;border-radius:8px;padding:2px 6px}
    pre{padding:12px;overflow:auto;border:1px solid #e5e7eb}
    table{border-collapse:collapse;width:100%;margin:1rem 0}
    th,td{border:1px solid #e5e7eb;padding:8px;text-align:left}
    th{background:#f9fafb}
    .ok{background:#ecfdf5;border:1px solid #a7f3d0;padding:12px;border-radius:10px}
  </style>
</head>
<body>
  <h1>Auto Protocol Mirror-Port Worker</h1>
  <div class="ok">
    <p><b>Detected front port:</b> ${escapeHtml(front.port)}</p>
    <p><b>Detected mode:</b> ${escapeHtml(front.className)}</p>
  </div>

  <p>Old path format is preserved:</p>
  <pre>/${sampleHost}${samplePath}</pre>

  <p>For this current request, that sample would forward to:</p>
  <pre>${escapeHtml(front.backendProtocolDisplay)}://${sampleHost}:${escapeHtml(front.port)}${samplePath}</pre>

  <h2>Port mapping</h2>
  <table>
    <thead><tr><th>Cloudflare front port</th><th>Backend protocol</th><th>Backend port</th></tr></thead>
    <tbody>
      <tr><td>80, 8080, 8880, 2052, 2082, 2086, 2095</td><td>http / non-TLS</td><td>same as front port</td></tr>
      <tr><td>443, 8443, 2053, 2083, 2087, 2096</td><td>https / TLS</td><td>same as front port</td></tr>
    </tbody>
  </table>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Export helpers for simple local tests without affecting Cloudflare runtime.
export const __test__ = { buildBackendUrl, detectFront, getFrontPort };

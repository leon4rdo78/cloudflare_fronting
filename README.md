# Auto Protocol Mirror-Port Cloudflare Worker
# THIS README IS FOR THE COMBINED WORKER

This Worker keeps the old path format:

```text
/<backend-host>/<backend-ws-path>
```

Example:

```text
/my-vps.example.com/download
```

## Main behavior

The Worker reads the Cloudflare-facing/front port and mirrors it to the VPS/x-ui backend port.

### Non-TLS / HTTP backend ports

These front ports are treated as non-TLS backend ports:

```text
80, 8080, 8880, 2052, 2082, 2086, 2095
```

Example:

```text
Client -> Worker on port 8080 with path /my-vps.example.com/download
Worker -> http://my-vps.example.com:8080/download
```

### TLS / HTTPS backend ports

These front ports are treated as TLS backend ports:

```text
443, 8443, 2053, 2083, 2087, 2096
```

Example:

```text
Client -> Worker on port 8443 with path /my-vps.example.com/download
Worker -> https://my-vps.example.com:8443/download
```

## What to change in x-ui

For each inbound, set its port normally:

```text
80 / 8080 / 8880 / 2052 / 2082 / 2086 / 2095  -> non-TLS x-ui inbound
443 / 8443 / 2053 / 2083 / 2087 / 2096        -> TLS x-ui inbound
```

Keep the x-ui WebSocket path the same, for example:

```text
/download
```

Do not put `/my-vps.example.com/download` inside x-ui. That full path is only for the client-to-Worker side.

## Client config examples

For non-TLS backend 8080:

```text
client front port: 8080
client host/SNI/WS host: your-worker-domain
client path: /my-vps.example.com/download
x-ui inbound: non-TLS, port 8080, WS path /download
```

For TLS backend 8443:

```text
client front port: 8443
client host/SNI/WS host: your-worker-domain
client path: /my-vps.example.com/download
x-ui inbound: TLS, port 8443, WS path /download
```

## Optional explicit backend port override

This Worker still accepts an explicit backend port in the first path segment:

```text
/my-vps.example.com:8080/download
```

Then the backend port is taken from the path instead of the front port. The backend protocol is still chosen from the front-port class.

## Verification

Open the Worker URL in a browser on each port, for example:

```text
http://your-worker-domain:8080/
https://your-worker-domain:8443/
```

The info page should show the detected front port and whether it will forward to `http` or `https`.

If a custom port is not detected, the Worker falls back to:

```text
https -> 443
http  -> 80
```

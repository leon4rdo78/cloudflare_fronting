// Developed by Surfboardv2ray modified by leon4rdo78
// https://github.com/Surfboardv2ray/v2ray-refiner
// Change 'url.port' and 'const workerport' value if your config uses another port. Only one port will work at a time.

export default {
  async fetch(request) {
    let url = new URL(request.url);
    
    if (url.pathname === '/' && request.method === "GET") {
      // Serve the HTML page at the root URL for GET request
      return handleRequest();
    } else if (url.pathname === '/' && request.method === "POST") {
      // Handle POST request to process the config refinement
      return handleConfigRefinement(request);
    } else {
      // Proceed with the existing fetch logic for other paths
      let realhostname = url.pathname.split('/')[1];
      let realpathname = url.pathname.split('/')[2];
      url.hostname = realhostname;
      url.pathname = '/' + realpathname;
      url.port = 80;
      url.protocol = 'http';
      let newRequest = new Request(url, request);
      return fetch(newRequest);
    }
  }
};



async function handleRequest() {
  const html = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Connected</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Google+Sans:opsz,wght@17..18,300&display=swap" rel="stylesheet">
    <style>
      html, body {
        width: 100%;
        height: 100%;
        margin: 0;
      }

      body {
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: 'Google Sans', Arial, sans-serif;
        font-weight: 300;
      }
    </style>
  </head>
  <body>
    connected
  </body>
  </html>
  `;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=UTF-8' },
  });
}

// Function to handle POST request and refine config
async function handleConfigRefinement(request) {
  const { config, hostname, cleanIp } = await request.json();
  const url = new URL(request.url);
  const workerUrl = url.hostname;
  const workerPort = '80'; // Default port value

  try {
    // Check if the config starts with vmess://, vless://, or trojan://
    if (config.startsWith('vmess://')) {
      return handleVmessConfig(config, hostname, cleanIp, workerUrl, workerPort);
    } else if (config.startsWith('vless://')) {
      return handleVlessConfig(config, hostname, cleanIp, workerUrl, workerPort);
    } else if (config.startsWith('trojan://')) {
      return handleTrojanConfig(config, hostname, cleanIp, workerUrl, workerPort);
    } else {
      return new Response(JSON.stringify({ error: "Please enter a valid vmess, vless or trojan config" }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
}


function handleVmessConfig(config, hostname, cleanIp, workerUrl, workerPort) {
  console.log("Original config:", config);
  
  const base64Part = config.split('vmess://')[1]; 
  console.log("Base64 part:", base64Part);
  
  if (!base64Part) {
    throw new Error("Invalid vmess config: No base64 part found.");
  }

  let decodedConfig;

  try {
    decodedConfig = atob(base64Part); 
    console.log("Decoded config:", decodedConfig);
  } catch (e) {
    throw new Error("Invalid vmess config: Base64 decoding failed.");
  }

  let jsonConfig;
  try {
    jsonConfig = JSON.parse(decodedConfig);
    console.log("Parsed JSON config:", jsonConfig);
  } catch (e) {
    throw new Error("Invalid vmess config: JSON parsing failed.");
  }

  if (!jsonConfig.port || !jsonConfig.ps || !jsonConfig.id) {
    throw new Error("Invalid vmess config: Missing required fields (port, ps, id).");
  }

  const port = jsonConfig.port.toString();
  console.log("Config port:", port);
  
  if (port !== workerPort) {
    throw new Error(`The config port must be ${workerPort}`);
  }

  const refinedConfig = {
    v: "2", 
    ps: jsonConfig.ps, 
    add: cleanIp, // Use Clean IP provided by the user
    port: "443", 
    id: jsonConfig.id,
    aid: "0", 
    scy: "auto", 
    net: "ws", 
    type: "none", 
    host: workerUrl, 
    path: `/${hostname}${jsonConfig.path || ''}`, 
    tls: "tls", 
    sni: workerUrl, 
    alpn: "h2,http/1.1", 
    fp: "chrome" 
  };

  console.log("Refined config object:", refinedConfig);

  let refinedConfigBase64;
  try {
    refinedConfigBase64 = btoa(JSON.stringify(refinedConfig));
    console.log("Refined config base64:", refinedConfigBase64);
  } catch (e) {
    throw new Error("Failed to encode the refined configuration to base64.");
  }

  return new Response(JSON.stringify({ refinedConfig: `vmess://${refinedConfigBase64}` }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

function handleVlessConfig(config, hostname, cleanIp, workerUrl, workerPort) {
  const parts = config.split('vless://')[1].split('@');
  const uuid = parts[0];
  const hostAndPort = parts[1].split('#')[0]; // Get everything before the #
  const [host, portPath] = hostAndPort.split(':'); // Separate host and port
  const port = portPath.split('?')[0]; // Get port
  const path = portPath.split('path=')[1]?.split('&')[0] || ''; // Extract path if it exists
  const alias = parts[1].split('#')[1]; // Extract the alias after #

  if (port !== workerPort) {
    throw new Error(`The config port must be ${workerPort}`);
  }

  const refinedConfig = `vless://${uuid}@${cleanIp}:443?encryption=none&security=tls&sni=${workerUrl}&alpn=h2%2Chttp%2F1.1&fp=chrome&allowInsecure=1&type=ws&host=${workerUrl}&path=%2F${hostname}${path}#${alias}`;
  
  return new Response(JSON.stringify({ refinedConfig }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

function handleTrojanConfig(config, hostname, cleanIp, workerUrl, workerPort) {
  const parts = config.split('trojan://')[1].split('@');
  const uuid = parts[0];
  const hostAndPort = parts[1].split('#')[0]; // Get everything before the #
  const [host, portPath] = hostAndPort.split(':'); // Separate host and port
  const port = portPath.split('?')[0]; // Get port
  const path = portPath.split('path=')[1]?.split('&')[0] || ''; // Extract path if it exists
  const alias = parts[1].split('#')[1]; // Extract the alias after #

  if (port !== workerPort) {
    throw new Error(`The config port must be ${workerPort}`);
  }

  const refinedConfig = `trojan://${uuid}@${cleanIp}:443?encryption=none&security=tls&sni=${workerUrl}&alpn=h2%2Chttp%2F1.1&fp=chrome&allowInsecure=1&type=ws&host=${workerUrl}&path=%2F${hostname}${path}#${alias}`;

  return new Response(JSON.stringify({ refinedConfig }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

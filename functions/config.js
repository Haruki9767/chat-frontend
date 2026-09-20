export async function onRequest(context) {
  let backendUrl = '';
  try {
    const configured = new URL(context.env.BACKEND_URL || '');
    const allowedHost = configured.hostname === 'chat.lime-paranoid.workers.dev'
      || configured.hostname.endsWith('.workers.dev');
    if (configured.protocol === 'https:' && allowedHost) {
      backendUrl = configured.origin;
    }
  } catch {}

  const body = `window.BACKEND_URL = ${JSON.stringify(backendUrl)};`;

  return new Response(body, {
    headers: {
      'Content-Type': 'application/javascript',
      'Cache-Control': 'no-store',
    },
  });
}

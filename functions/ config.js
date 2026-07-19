export async function onRequest(context) {
  const backendUrl = context.env.BACKEND_URL || '';

  const body = `window.BACKEND_URL = ${JSON.stringify(backendUrl)};`;

  return new Response(body, {
    headers: {
      'Content-Type': 'application/javascript',
      'Cache-Control': 'no-store',
    },
  });
}

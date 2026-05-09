export async function GET() { return Response.json({ pong: true, time: new Date().toISOString() }); }

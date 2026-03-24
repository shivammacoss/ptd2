import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Proxies /api/v1/* → gateway. More reliable than next.config rewrites on some Windows setups.
 * Set TRADER_API_PROXY_TARGET or GATEWAY_URL (e.g. http://localhost:8000).
 */
function gatewayOrigin(): string {
  const raw =
    process.env.TRADER_API_PROXY_TARGET ||
    process.env.GATEWAY_URL ||
    process.env.NEXT_PUBLIC_GATEWAY_ORIGIN ||
    'http://127.0.0.1:8000';
  return String(raw).replace(/\/$/, '');
}

async function proxy(req: NextRequest, segments: string[]): Promise<NextResponse> {
  const sub = segments.length ? segments.join('/') : '';
  const path = sub ? `api/v1/${sub}` : 'api/v1';
  const targetUrl = `${gatewayOrigin()}/${path}${req.nextUrl.search}`;

  const headers = new Headers();
  const auth = req.headers.get('authorization');
  if (auth) headers.set('authorization', auth);
  const ct = req.headers.get('content-type');
  if (ct) headers.set('content-type', ct);

  const method = req.method.toUpperCase();
  const hasBody = !['GET', 'HEAD'].includes(method);
  let body: ArrayBuffer | undefined;
  if (hasBody) {
    try {
      body = await req.arrayBuffer();
    } catch {
      body = undefined;
    }
  }

  const ctrl = typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal
    ? AbortSignal.timeout(120_000)
    : undefined;

  let res: Response;
  try {
    res = await fetch(targetUrl, {
      method,
      headers,
      body: body && body.byteLength > 0 ? body : undefined,
      signal: ctrl,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'fetch failed';
    console.error('[api/v1 proxy]', targetUrl, msg);
    return NextResponse.json(
      {
        detail:
          'Cannot reach API gateway. Run: docker compose up -d (or start gateway on port 8000). ' +
          `Proxy target: ${gatewayOrigin()}`,
      },
      { status: 502 },
    );
  }

  const out = new Headers();
  const ctOut = res.headers.get('content-type');
  if (ctOut) out.set('content-type', ctOut);

  return new NextResponse(await res.arrayBuffer(), {
    status: res.status,
    statusText: res.statusText,
    headers: out,
  });
}

type RouteCtx = { params: { path: string[] } };

export async function GET(req: NextRequest, ctx: RouteCtx) {
  return proxy(req, ctx.params.path ?? []);
}

export async function POST(req: NextRequest, ctx: RouteCtx) {
  return proxy(req, ctx.params.path ?? []);
}

export async function PUT(req: NextRequest, ctx: RouteCtx) {
  return proxy(req, ctx.params.path ?? []);
}

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  return proxy(req, ctx.params.path ?? []);
}

export async function DELETE(req: NextRequest, ctx: RouteCtx) {
  return proxy(req, ctx.params.path ?? []);
}

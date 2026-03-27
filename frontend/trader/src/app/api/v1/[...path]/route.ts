import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Proxies /api/v1/* → gateway. More reliable than next.config rewrites on some Windows setups.
 *
 * Priority: TRADER_API_PROXY_TARGET | GATEWAY_URL | INTERNAL_API_URL (strip /api/v1) | NEXT_PUBLIC_GATEWAY_ORIGIN | localhost.
 * Docker Compose sets INTERNAL_API_URL=http://gateway:8000/api/v1 — that must be honored here.
 */
function gatewayOrigin(): string {
  const explicit =
    process.env.TRADER_API_PROXY_TARGET?.trim() ||
    process.env.GATEWAY_URL?.trim();
  if (explicit) {
    return String(explicit).replace(/\/$/, '');
  }

  const internal = process.env.INTERNAL_API_URL?.trim();
  if (internal) {
    const base = internal.replace(/\/api\/v1\/?$/i, '').replace(/\/$/, '');
    if (base) {
      try {
        const u = new URL(base);
        const path = u.pathname.replace(/\/$/, '');
        return path ? `${u.origin}${path}` : u.origin;
      } catch {
        return base;
      }
    }
  }

  const fallback = process.env.NEXT_PUBLIC_GATEWAY_ORIGIN?.trim();
  if (fallback) {
    return String(fallback).replace(/\/$/, '');
  }

  return 'http://127.0.0.1:8000';
}

async function proxy(req: NextRequest, segments: string[]): Promise<NextResponse> {
  const sub = segments.length ? segments.join('/') : '';
  // Always add trailing slash so FastAPI doesn't 307-redirect (which drops body & auth on POST).
  const path = sub ? `api/v1/${sub}/` : 'api/v1/';
  // Collapse any double slashes that might appear
  const targetUrl = `${gatewayOrigin()}/${path}${req.nextUrl.search}`.replace(/([^:])\/\//g, '$1/');

  const headers = new Headers();
  const auth = req.headers.get('authorization');
  if (auth) headers.set('authorization', auth);
  const ct = req.headers.get('content-type');
  if (ct) headers.set('content-type', ct);

  const method = req.method.toUpperCase();
  const hasBody = !['GET', 'HEAD'].includes(method);
  let body: BodyInit | undefined;
  if (hasBody) {
    try {
      const buf = await req.arrayBuffer();
      if (buf.byteLength > 0) {
        // Use Buffer (Node.js) instead of raw ArrayBuffer — more reliable with native fetch.
        body = Buffer.from(buf);
      }
    } catch {
      body = undefined;
    }
  }

  let res: Response;
  try {
    res = await fetch(targetUrl, {
      method,
      headers,
      body,
      // Don't follow redirects automatically — they drop Authorization + body on 307.
      redirect: 'manual',
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

  // If gateway returned a redirect (307/308), follow it manually preserving body + auth.
  if ([301, 302, 307, 308].includes(res.status)) {
    const location = res.headers.get('location');
    if (location) {
      try {
        const redirectUrl = new URL(location, targetUrl).toString();
        res = await fetch(redirectUrl, { method, headers, body, redirect: 'manual' });
      } catch (e2) {
        const msg = e2 instanceof Error ? e2.message : 'redirect fetch failed';
        console.error('[api/v1 proxy redirect]', location, msg);
        return NextResponse.json({ detail: 'Gateway redirect failed' }, { status: 502 });
      }
    }
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

import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/register"];

/**
 * Comprobación ligera de presencia de sesión para redirigir rápido en el borde.
 * La verificación criptográfica real del JWT ocurre en cada API route / Server Component
 * (requireSession), así que esto es solo una redirección de conveniencia de UX.
 */
export function middleware(req: NextRequest) {
  const hasSessionCookie = Boolean(req.cookies.get("familia_session")?.value);
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (!hasSessionCookie && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (hasSessionCookie && isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|icons|sw.js).*)"],
};

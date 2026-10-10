import { NextResponse } from "next/server";
import { JWT_COOKIE_NAME } from "@/lib/auth";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(JWT_COOKIE_NAME, "", { path: "/", maxAge: 0 });
  return res;
}

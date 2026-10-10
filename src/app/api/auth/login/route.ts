import { NextResponse, type NextRequest } from "next/server";
import { parseBody } from "@/lib/api";
import { loginSchema } from "@/lib/validation";
import { findUserByEmail, touchLastLogin } from "@/services/members";
import { signSession, verifyPassword, JWT_COOKIE_NAME } from "@/lib/auth";
import { AuthError, toSafeError } from "@/lib/errors";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await parseBody(req, loginSchema);
    const user = await findUserByEmail(email);
    if (!user) throw new AuthError("Correo o contraseña incorrectos.");

    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) throw new AuthError("Correo o contraseña incorrectos.");

    await touchLastLogin(user.id);

    const token = signSession({
      userId: user.id,
      familyMemberId: user.family_member_id,
      familyId: user.family_id,
      role: user.role,
      name: user.name,
    });

    const res = NextResponse.json({ member: { name: user.name, role: user.role } });
    res.cookies.set(JWT_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
    return res;
  } catch (err) {
    const { status, message, code } = toSafeError(err);
    return NextResponse.json({ error: message, code }, { status });
  }
}

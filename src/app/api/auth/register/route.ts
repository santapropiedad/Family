import { NextResponse, type NextRequest } from "next/server";
import { parseBody } from "@/lib/api";
import { registerSchema } from "@/lib/validation";
import { createFamilyWithAdmin } from "@/services/families";
import { signSession, JWT_COOKIE_NAME } from "@/lib/auth";
import { toSafeError } from "@/lib/errors";

export async function POST(req: NextRequest) {
  try {
    const input = await parseBody(req, registerSchema);
    const { family, member, user } = await createFamilyWithAdmin(input);

    const token = signSession({
      userId: user.id,
      familyMemberId: member.id,
      familyId: family.id,
      role: member.role,
      name: member.name,
    });

    const res = NextResponse.json({
      family: { id: family.id, name: family.name },
      member: { id: member.id, name: member.name, role: member.role },
    });
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

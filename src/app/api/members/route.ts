import type { NextRequest } from "next/server";
import { handleRoute, parseBody } from "@/lib/api";
import { requireSession } from "@/lib/session";
import { assertCapability } from "@/lib/permissions";
import { addMemberSchema } from "@/lib/validation";
import { addMember, listMembers } from "@/services/members";

export async function GET() {
  return handleRoute(async () => {
    const session = await requireSession();
    return { members: await listMembers(session.familyId) };
  });
}

export async function POST(req: NextRequest) {
  return handleRoute(async () => {
    const session = await requireSession();
    assertCapability(session.role, "family:manage_members");
    const input = await parseBody(req, addMemberSchema);
    const member = await addMember(session.familyId, {
      name: input.name,
      role: input.role,
      color: input.color,
      avatarEmoji: input.avatarEmoji,
      birthDate: input.birthDate ?? null,
      login: input.login,
    });
    return { member };
  });
}

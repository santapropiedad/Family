import { ForbiddenError } from "./errors";

export type Role = "admin" | "adult" | "child";

/**
 * Every capability the app can gate. Keeping this as one flat union (instead of a
 * per-family configurable permissions table) matches the spec's fixed 3-role model
 * and keeps enforcement in one reviewable place instead of spread across routes.
 */
export type Capability =
  | "family:configure"
  | "family:manage_members"
  | "family:manage_permissions"
  | "finances:view"
  | "finances:manage"
  | "ai:configure"
  | "ai:use"
  | "data:admin"
  | "tasks:create"
  | "tasks:manage_any"
  | "tasks:manage_own"
  | "events:manage"
  | "reminders:manage"
  | "shopping:manage"
  | "inventory:manage"
  | "maintenance:manage"
  | "bills:manage"
  | "memory:manage";

const ROLE_CAPABILITIES: Record<Role, ReadonlySet<Capability>> = {
  admin: new Set<Capability>([
    "family:configure",
    "family:manage_members",
    "family:manage_permissions",
    "finances:view",
    "finances:manage",
    "ai:configure",
    "ai:use",
    "data:admin",
    "tasks:create",
    "tasks:manage_any",
    "tasks:manage_own",
    "events:manage",
    "reminders:manage",
    "shopping:manage",
    "inventory:manage",
    "maintenance:manage",
    "bills:manage",
    "memory:manage",
  ]),
  adult: new Set<Capability>([
    "finances:view",
    "finances:manage",
    "ai:use",
    "tasks:create",
    "tasks:manage_any",
    "tasks:manage_own",
    "events:manage",
    "reminders:manage",
    "shopping:manage",
    "inventory:manage",
    "maintenance:manage",
    "bills:manage",
    "memory:manage",
  ]),
  child: new Set<Capability>(["ai:use", "tasks:manage_own"]),
};

export function hasCapability(role: Role, capability: Capability): boolean {
  return ROLE_CAPABILITIES[role].has(capability);
}

export function assertCapability(role: Role, capability: Capability): void {
  if (!hasCapability(role, capability)) {
    throw new ForbiddenError(
      "No tienes permiso para realizar esta acción. Pídele a un adulto o administrador de la familia que la haga."
    );
  }
}

/** A child can only act on records that belong to them (tasks assigned to them, their own events, etc.). */
export function canActOnOwnRecordOnly(role: Role): boolean {
  return role === "child";
}

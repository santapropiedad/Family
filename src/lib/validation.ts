import { z } from "zod";

export const registerSchema = z.object({
  familyName: z.string().trim().min(2).max(80),
  adminName: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(160),
  password: z.string().min(8).max(200),
});

export const loginSchema = z.object({
  email: z.string().trim().email().max(160),
  password: z.string().min(1).max(200),
});

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().trim().url().max(2000),
  keys: z.object({
    p256dh: z.string().trim().min(1).max(400),
    auth: z.string().trim().min(1).max(400),
  }),
});

export const unsubscribePushSchema = z.object({
  endpoint: z.string().trim().url().max(2000),
});

export const updateCredentialsSchema = z
  .object({
    currentPassword: z.string().min(1).max(200),
    newEmail: z.string().trim().email().max(160).optional(),
    newPassword: z.string().min(8).max(200).optional(),
  })
  .refine((data) => data.newEmail || data.newPassword, {
    message: "Debes indicar un correo o una contraseña nueva.",
  });

export const setMemberLoginSchema = z
  .object({
    email: z.string().trim().email().max(160).optional(),
    password: z.string().min(8).max(200).optional(),
  })
  .refine((data) => data.email || data.password, {
    message: "Debes indicar un correo o una contraseña.",
  });

export const addMemberSchema = z.object({
  name: z.string().trim().min(1).max(80),
  role: z.enum(["admin", "adult", "child"]),
  color: z.string().trim().max(20).optional(),
  avatarEmoji: z.string().trim().max(8).optional(),
  birthDate: z.string().trim().max(10).nullable().optional(),
  login: z.object({ email: z.string().trim().email(), password: z.string().min(8) }).optional(),
});

export const createTaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  priority: z.enum(["red", "yellow", "green"]).optional(),
  dueDate: z.string().trim().max(10).nullable().optional(),
  dueTime: z.string().trim().max(8).nullable().optional(),
  recurrence: z.enum(["none", "daily", "weekly", "monthly"]).optional(),
  assigneeIds: z.array(z.string().uuid()).optional(),
});

export const createEventSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  category: z
    .enum(["birthday", "school", "appointment", "activity", "vacation", "payment", "maintenance", "family", "other"])
    .optional(),
  startAt: z.string().trim().min(1),
  endAt: z.string().trim().nullable().optional(),
  allDay: z.boolean().optional(),
  location: z.string().trim().max(200).nullable().optional(),
  assigneeIds: z.array(z.string().uuid()).optional(),
});

export const createReminderSchema = z.object({
  title: z.string().trim().min(1).max(200),
  remindAt: z.string().trim().min(1),
  recurrence: z.enum(["none", "daily", "weekly", "monthly"]).optional(),
  relatedTaskId: z.string().uuid().nullable().optional(),
  relatedEventId: z.string().uuid().nullable().optional(),
  relatedBillId: z.string().uuid().nullable().optional(),
  relatedMaintenanceId: z.string().uuid().nullable().optional(),
});

export const addShoppingItemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  quantity: z.number().positive().max(100000).optional(),
  unit: z.string().trim().max(30).nullable().optional(),
  priority: z.enum(["red", "yellow", "green"]).optional(),
  categoryId: z.string().uuid().nullable().optional(),
  store: z.string().trim().max(80).nullable().optional(),
});

export const recordPurchaseSchema = z.object({
  itemName: z.string().trim().min(1).max(120),
  amount: z.number().positive().max(100_000_000),
  quantity: z.number().positive().max(100000).optional(),
  unit: z.string().trim().max(30).nullable().optional(),
  store: z.string().trim().max(80).nullable().optional(),
  merchant: z.string().trim().max(120).nullable().optional(),
  paymentMethod: z.string().trim().max(60).nullable().optional(),
});

export const createExpenseSchema = z.object({
  amount: z.number().positive().max(100_000_000),
  categoryId: z.string().uuid().nullable().optional(),
  subcategory: z.string().trim().max(80).nullable().optional(),
  familyMemberId: z.string().uuid().nullable().optional(),
  spentAt: z.string().trim().max(10).optional(),
  merchant: z.string().trim().max(120).nullable().optional(),
  paymentMethod: z.string().trim().max(60).nullable().optional(),
  description: z.string().trim().max(400).nullable().optional(),
  isRecurring: z.boolean().optional(),
});

export const updateExpenseSchema = z.object({
  amount: z.number().positive().max(100_000_000).optional(),
  categoryId: z.string().uuid().nullable().optional(),
  subcategory: z.string().trim().max(80).nullable().optional(),
  spentAt: z.string().trim().max(10).optional(),
  merchant: z.string().trim().max(120).nullable().optional(),
  paymentMethod: z.string().trim().max(60).nullable().optional(),
  description: z.string().trim().max(400).nullable().optional(),
  isRecurring: z.boolean().optional(),
});

export const createMaintenanceSchema = z.object({
  name: z.string().trim().min(1).max(120),
  location: z.string().trim().max(120).nullable().optional(),
  purchaseDate: z.string().trim().max(10).nullable().optional(),
  warrantyUntil: z.string().trim().max(10).nullable().optional(),
  nextMaintenanceAt: z.string().trim().max(10).nullable().optional(),
  frequencyDays: z.number().int().positive().max(3650).nullable().optional(),
  provider: z.string().trim().max(120).nullable().optional(),
  cost: z.number().nonnegative().max(100_000_000).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(60),
  icon: z.string().trim().min(1).max(8).optional(),
  color: z.string().trim().min(1).max(20).optional(),
});

export const createBillSchema = z.object({
  name: z.string().trim().min(1).max(120),
  provider: z.string().trim().max(120).nullable().optional(),
  amount: z.number().positive().max(100_000_000),
  dueDate: z.string().trim().max(10),
  frequency: z.enum(["once", "monthly", "bimonthly", "quarterly", "annual"]).optional(),
  categoryId: z.string().uuid().nullable().optional(),
  paymentMethod: z.string().trim().max(60).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export const procesarBoletaSchema = z.object({
  image: z
    .string()
    .trim()
    .min(100)
    .max(8_000_000)
    .regex(/^data:image\/[a-zA-Z+]+;base64,/, "La imagen debe venir en formato data URL."),
});

export const confirmarBoletaSchema = z.object({
  total: z.number().positive().max(100_000_000),
  spentAt: z.string().trim().max(10),
  merchant: z.string().trim().max(160).nullable().optional(),
  receiptNumber: z.string().trim().max(80).nullable().optional(),
  items: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(160),
        qty: z.number().positive().max(10000),
        unit: z.enum(["unidades", "kilos", "litros"]),
        unitPrice: z.number().nonnegative().max(100_000_000).nullable().optional(),
        lineTotal: z.number().nonnegative().max(100_000_000).nullable().optional(),
      })
    )
    .max(100),
});

export const chatMessageSchema = z.object({
  text: z.string().trim().min(1).max(2000),
});

export const confirmActionSchema = z.object({
  actionId: z.string().uuid(),
});

import type { Role } from "@/lib/permissions";

export interface Family {
  id: string;
  name: string;
  timezone: string;
  locale: string;
  ai_enabled: boolean;
  ai_memory_enabled: boolean;
  ai_proactive_enabled: boolean;
  shopping_suggestions_enabled: boolean;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
}

export interface FamilyMember {
  id: string;
  family_id: string;
  name: string;
  role: Role;
  color: string;
  avatar_emoji: string | null;
  birth_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface AppUser {
  id: string;
  family_member_id: string;
  email: string;
  password_hash: string;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export type Priority = "red" | "yellow" | "green";
export type Recurrence = "none" | "daily" | "weekly" | "monthly";
export type Source = "manual" | "ai";

export interface Task {
  id: string;
  family_id: string;
  title: string;
  description: string | null;
  priority: Priority;
  due_date: string | null;
  due_time: string | null;
  recurrence: Recurrence;
  status: "pending" | "completed" | "cancelled";
  completed_at: string | null;
  source: Source;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  assignees?: string[];
}

export type EventCategory =
  | "birthday"
  | "school"
  | "appointment"
  | "activity"
  | "vacation"
  | "payment"
  | "maintenance"
  | "family"
  | "other";

export interface FamilyEvent {
  id: string;
  family_id: string;
  title: string;
  description: string | null;
  category: EventCategory;
  start_at: string;
  end_at: string | null;
  all_day: boolean;
  location: string | null;
  source: Source;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  assignees?: string[];
}

export interface Reminder {
  id: string;
  family_id: string;
  title: string;
  remind_at: string;
  recurrence: Recurrence;
  status: "pending" | "done" | "dismissed";
  related_task_id: string | null;
  related_event_id: string | null;
  related_bill_id: string | null;
  related_maintenance_id: string | null;
  source: Source;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExpenseCategory {
  id: string;
  family_id: string | null;
  name: string;
  icon: string;
  color: string;
  is_default: boolean;
  created_at: string;
}

export interface Expense {
  id: string;
  family_id: string;
  amount: string;
  category_id: string | null;
  subcategory: string | null;
  family_member_id: string | null;
  spent_at: string;
  merchant: string | null;
  payment_method: string | null;
  description: string | null;
  is_recurring: boolean;
  receipt_url: string | null;
  receipt_number: string | null;
  origin: string | null;
  source: Source;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Budget {
  id: string;
  family_id: string;
  category_id: string;
  monthly_limit: string;
  created_at: string;
  updated_at: string;
}

export interface ShoppingList {
  id: string;
  family_id: string;
  name: string;
  created_at: string;
}

export interface ShoppingItem {
  id: string;
  shopping_list_id: string;
  family_id: string;
  name: string;
  category_id: string | null;
  quantity: string;
  unit: string | null;
  priority: Priority;
  assigned_to: string | null;
  status: "pending" | "purchased";
  purchased_at: string | null;
  purchased_price: string | null;
  store: string | null;
  inventory_item_id: string | null;
  source: Source;
  created_at: string;
  updated_at: string;
}

export interface InventoryItem {
  id: string;
  family_id: string;
  name: string;
  category_id: string | null;
  current_quantity: string;
  unit: string | null;
  min_quantity: string | null;
  avg_purchase_frequency_days: string | null;
  last_purchased_at: string | null;
  last_price: string | null;
  auto_suggest: boolean;
  store: string | null;
  created_at: string;
  updated_at: string;
}

export interface Maintenance {
  id: string;
  family_id: string;
  name: string;
  location: string | null;
  purchase_date: string | null;
  warranty_until: string | null;
  last_maintenance_at: string | null;
  next_maintenance_at: string | null;
  frequency_days: number | null;
  provider: string | null;
  cost: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Bill {
  id: string;
  family_id: string;
  name: string;
  provider: string | null;
  amount: string;
  due_date: string;
  frequency: "once" | "monthly" | "bimonthly" | "quarterly" | "annual";
  category_id: string | null;
  status: "pending" | "paid" | "overdue";
  payment_method: string | null;
  notes: string | null;
  paid_at: string | null;
  expense_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Memory {
  id: string;
  family_id: string;
  type: "permanent" | "temporary";
  category: string | null;
  content: string;
  related_family_member_id: string | null;
  expires_at: string | null;
  created_by: "user" | "ai";
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Notification {
  id: string;
  family_id: string;
  family_member_id: string | null;
  type: string;
  title: string;
  body: string | null;
  priority: "low" | "medium" | "high";
  related_entity_type: string | null;
  related_entity_id: string | null;
  read_at: string | null;
  created_at: string;
}

export interface PushSubscriptionRow {
  id: string;
  family_id: string;
  family_member_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  created_at: string;
}

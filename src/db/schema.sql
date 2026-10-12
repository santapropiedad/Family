-- FAMILIA+ — esquema relacional normalizado
-- IDs son UUID generados en la aplicación (uuidv4), no en la base de datos,
-- para mantener el mismo esquema funcionando igual en PGlite (desarrollo) y Postgres (producción).

CREATE TABLE IF NOT EXISTS families (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'America/Santiago',
  locale TEXT NOT NULL DEFAULT 'es-CL',
  ai_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ai_memory_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  ai_proactive_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  shopping_suggestions_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Perfil de cada integrante de la familia (tenga o no acceso a la app).
CREATE TABLE IF NOT EXISTS family_members (
  id UUID PRIMARY KEY,
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'adult', 'child')),
  color TEXT NOT NULL DEFAULT '#6366f1',
  avatar_emoji TEXT,
  birth_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_family_members_family ON family_members(family_id);

-- Credenciales de acceso (1:1 opcional con family_members). No todos los integrantes inician sesión.
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  family_member_id UUID NOT NULL UNIQUE REFERENCES family_members(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS expense_categories (
  id UUID PRIMARY KEY,
  family_id UUID REFERENCES families(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '🧾',
  color TEXT NOT NULL DEFAULT '#6366f1',
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_expense_categories_family ON expense_categories(family_id);

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY,
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'yellow' CHECK (priority IN ('red', 'yellow', 'green')),
  due_date DATE,
  due_time TIME,
  recurrence TEXT NOT NULL DEFAULT 'none' CHECK (recurrence IN ('none', 'daily', 'weekly', 'monthly')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
  completed_at TIMESTAMPTZ,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'ai')),
  created_by UUID REFERENCES family_members(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tasks_family ON tasks(family_id);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);

CREATE TABLE IF NOT EXISTS task_assignments (
  id UUID PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  family_member_id UUID NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (task_id, family_member_id)
);

CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY,
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'family' CHECK (category IN
    ('birthday', 'school', 'appointment', 'activity', 'vacation', 'payment', 'maintenance', 'family', 'other')),
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ,
  all_day BOOLEAN NOT NULL DEFAULT FALSE,
  location TEXT,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'ai')),
  created_by UUID REFERENCES family_members(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_events_family ON events(family_id);
CREATE INDEX IF NOT EXISTS idx_events_start ON events(start_at);

CREATE TABLE IF NOT EXISTS event_assignments (
  id UUID PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  family_member_id UUID NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (event_id, family_member_id)
);

CREATE TABLE IF NOT EXISTS maintenance (
  id UUID PRIMARY KEY,
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  location TEXT,
  purchase_date DATE,
  warranty_until DATE,
  last_maintenance_at DATE,
  next_maintenance_at DATE,
  frequency_days INTEGER,
  provider TEXT,
  cost NUMERIC(12, 2),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_maintenance_family ON maintenance(family_id);

CREATE TABLE IF NOT EXISTS bills (
  id UUID PRIMARY KEY,
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  provider TEXT,
  amount NUMERIC(12, 2) NOT NULL,
  due_date DATE NOT NULL,
  frequency TEXT NOT NULL DEFAULT 'monthly' CHECK (frequency IN ('once', 'monthly', 'bimonthly', 'quarterly', 'annual')),
  category_id UUID REFERENCES expense_categories(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'overdue')),
  payment_method TEXT,
  notes TEXT,
  paid_at TIMESTAMPTZ,
  expense_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bills_family ON bills(family_id);
CREATE INDEX IF NOT EXISTS idx_bills_due_date ON bills(due_date);

CREATE TABLE IF NOT EXISTS shopping_lists (
  id UUID PRIMARY KEY,
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Lista principal',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory_items (
  id UUID PRIMARY KEY,
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category_id UUID REFERENCES expense_categories(id),
  current_quantity NUMERIC(10, 2) NOT NULL DEFAULT 0,
  unit TEXT,
  min_quantity NUMERIC(10, 2),
  avg_purchase_frequency_days NUMERIC(6, 2),
  last_purchased_at DATE,
  last_price NUMERIC(12, 2),
  auto_suggest BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (family_id, name)
);
CREATE INDEX IF NOT EXISTS idx_inventory_family ON inventory_items(family_id);
-- Tienda de origen (Feria / Supermercado), para separar el stock de casa por tienda en la UI.
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS store TEXT;

CREATE TABLE IF NOT EXISTS shopping_items (
  id UUID PRIMARY KEY,
  shopping_list_id UUID NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category_id UUID REFERENCES expense_categories(id),
  quantity NUMERIC(10, 2) NOT NULL DEFAULT 1,
  unit TEXT,
  priority TEXT NOT NULL DEFAULT 'yellow' CHECK (priority IN ('red', 'yellow', 'green')),
  assigned_to UUID REFERENCES family_members(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'purchased')),
  purchased_at TIMESTAMPTZ,
  purchased_price NUMERIC(12, 2),
  store TEXT,
  inventory_item_id UUID REFERENCES inventory_items(id),
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'ai')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_shopping_items_family ON shopping_items(family_id);
CREATE INDEX IF NOT EXISTS idx_shopping_items_status ON shopping_items(status);

CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY,
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  amount NUMERIC(12, 2) NOT NULL,
  category_id UUID REFERENCES expense_categories(id),
  subcategory TEXT,
  family_member_id UUID REFERENCES family_members(id),
  spent_at DATE NOT NULL,
  merchant TEXT,
  payment_method TEXT,
  description TEXT,
  is_recurring BOOLEAN NOT NULL DEFAULT FALSE,
  receipt_url TEXT,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'ai')),
  created_by UUID REFERENCES family_members(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_expenses_family ON expenses(family_id);
CREATE INDEX IF NOT EXISTS idx_expenses_spent_at ON expenses(spent_at);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category_id);

CREATE TABLE IF NOT EXISTS budgets (
  id UUID PRIMARY KEY,
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES expense_categories(id) ON DELETE CASCADE,
  monthly_limit NUMERIC(12, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (family_id, category_id)
);

CREATE TABLE IF NOT EXISTS reminders (
  id UUID PRIMARY KEY,
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  remind_at TIMESTAMPTZ NOT NULL,
  recurrence TEXT NOT NULL DEFAULT 'none' CHECK (recurrence IN ('none', 'daily', 'weekly', 'monthly')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'dismissed')),
  related_task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  related_event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  related_bill_id UUID REFERENCES bills(id) ON DELETE CASCADE,
  related_maintenance_id UUID REFERENCES maintenance(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'ai')),
  created_by UUID REFERENCES family_members(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reminders_family ON reminders(family_id);
CREATE INDEX IF NOT EXISTS idx_reminders_remind_at ON reminders(remind_at);

CREATE TABLE IF NOT EXISTS memories (
  id UUID PRIMARY KEY,
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('permanent', 'temporary')),
  category TEXT,
  content TEXT NOT NULL,
  related_family_member_id UUID REFERENCES family_members(id),
  expires_at TIMESTAMPTZ,
  created_by TEXT NOT NULL DEFAULT 'ai' CHECK (created_by IN ('user', 'ai')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_memories_family ON memories(family_id);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY,
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  family_member_id UUID REFERENCES family_members(id),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  related_entity_type TEXT,
  related_entity_id UUID,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_family ON notifications(family_id);

CREATE TABLE IF NOT EXISTS ai_conversations (
  id UUID PRIMARY KEY,
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  family_member_id UUID NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_family ON ai_conversations(family_id);

CREATE TABLE IF NOT EXISTS ai_messages (
  id UUID PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation ON ai_messages(conversation_id);

CREATE TABLE IF NOT EXISTS ai_actions (
  id UUID PRIMARY KEY,
  family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  family_member_id UUID NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES ai_conversations(id) ON DELETE SET NULL,
  tool_name TEXT NOT NULL,
  parameters JSONB NOT NULL DEFAULT '{}',
  confirmation_level TEXT NOT NULL CHECK (confirmation_level IN ('auto', 'confirm', 'always_confirm')),
  status TEXT NOT NULL CHECK (status IN ('executed', 'pending_confirmation', 'rejected', 'failed')),
  result JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_actions_family ON ai_actions(family_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY,
  family_id UUID REFERENCES families(id) ON DELETE CASCADE,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('user', 'ai', 'system')),
  actor_id UUID,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_family ON audit_logs(family_id);

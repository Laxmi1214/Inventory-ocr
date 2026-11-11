-- ==============================================================================
-- CONGIOTECH PHARMACEUTICAL INVENTORY - DATABASE INITIALIZATION
-- User Table & Roles Schema for Login and Signup
-- ==============================================================================

-- 1. Create Roles Table
CREATE TABLE IF NOT EXISTS public.roles (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Seed initial roles as per BRD Section 3
INSERT INTO public.roles (id, name, description)
VALUES 
    ('OPERATOR', 'Warehouse Operator', 'Scan products, receive goods, pick items, perform stock counts'),
    ('SUPERVISOR', 'Supervisor', 'Review mismatches, approve permitted overrides, resolve exceptions'),
    ('INVENTORY_ADMIN', 'Inventory Administrator', 'Maintain product, batch, supplier, and warehouse information'),
    ('SYSTEM_ADMIN', 'System Administrator', 'Manage users, roles, devices, and application settings')
ON CONFLICT (id) DO NOTHING;

-- 2. Create Users Table
CREATE TABLE IF NOT EXISTS public.users (
    id VARCHAR(100) PRIMARY KEY,
    username VARCHAR(100) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'OPERATOR' REFERENCES public.roles(id),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Index on email for fast login lookup
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users (LOWER(email));

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Allow public / authenticated access policies
CREATE POLICY "Allow public read on roles" 
ON public.roles FOR SELECT 
USING (true);

CREATE POLICY "Allow public read on users for auth" 
ON public.users FOR SELECT 
USING (true);

CREATE POLICY "Allow user registration insert" 
ON public.users FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Allow user update" 
ON public.users FOR UPDATE 
USING (true);

-- Trigger to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_users_updated_at ON public.users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public'
    AND tablename IN ('companies', 'users', 'booths', 'modular_home_quote_requests')) THEN
    RAISE EXCEPTION 'FRESH_PROJECT_REQUIRED: refusing to bootstrap an existing application database';
  END IF;
END $$;


-- SOURCE: 20260303000000_init_schema_and_rls.sql
-- PR 1 & PR 2 & PR 3: Init Schema, Re-enable RLS, Owner Isolation, and Telemetry Tables

-- 1. Create essential tables (if they don't exist)
CREATE TABLE IF NOT EXISTS organization (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    business_type TEXT,
    logo_url TEXT,
    owner_id UUID REFERENCES auth.users(id) NOT NULL -- Links to Supabase Auth user
);

CREATE TABLE IF NOT EXISTS expo_booth (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organization(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    plan_type TEXT DEFAULT 'standard',
    is_paid BOOLEAN DEFAULT false,
    color TEXT DEFAULT '#3b82f6',
    position_z FLOAT,
    side TEXT
);

CREATE TABLE IF NOT EXISTS ad_slot (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    base_price_weekly NUMERIC NOT NULL
);

CREATE TABLE IF NOT EXISTS ad_campaign (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organization(id) ON DELETE CASCADE,
    slot_id TEXT REFERENCES ad_slot(id),
    media_url TEXT NOT NULL,
    media_type TEXT NOT NULL,
    link_url TEXT,
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ NOT NULL,
    is_active BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS expo_seminar (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    is_live BOOLEAN DEFAULT false,
    expo_booth_id UUID REFERENCES expo_booth(id)
);

-- PR 3: Telemetry tables
CREATE TABLE IF NOT EXISTS ad_impression (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID REFERENCES ad_campaign(id) ON DELETE CASCADE,
    visitor_id TEXT, -- Anonymous session ID or user ID
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ad_click (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID REFERENCES ad_campaign(id) ON DELETE CASCADE,
    visitor_id TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS booth_lead (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booth_id UUID REFERENCES expo_booth(id) ON DELETE CASCADE,
    visitor_id TEXT,
    contact_data JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Indexes for performance and telemetry queries
CREATE INDEX IF NOT EXISTS idx_ad_campaign_active ON ad_campaign(slot_id, is_active, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_ad_impression_campaign ON ad_impression(campaign_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ad_click_campaign ON ad_click(campaign_id, created_at);

-- 3. ENABLE ROW LEVEL SECURITY (RLS)
ALTER TABLE organization ENABLE ROW LEVEL SECURITY;
ALTER TABLE expo_booth ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_slot ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_campaign ENABLE ROW LEVEL SECURITY;
ALTER TABLE expo_seminar ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_impression ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_click ENABLE ROW LEVEL SECURITY;
ALTER TABLE booth_lead ENABLE ROW LEVEL SECURITY;

-- 4. POLICIES (PR 1 & PR 2)

-- Organization: Users can only see and edit their own organization
CREATE POLICY "Users can view their own organization" ON organization
    FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "Users can update their own organization" ON organization
    FOR UPDATE USING (auth.uid() = owner_id);

-- Expo Booth: Anyone can read public info, but only org owner can edit
CREATE POLICY "Anyone can view expo booths" ON expo_booth
    FOR SELECT USING (true);
CREATE POLICY "Org owner can insert booth" ON expo_booth
    FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM organization WHERE id = expo_booth.org_id AND owner_id = auth.uid()));
CREATE POLICY "Org owner can update booth" ON expo_booth
    FOR UPDATE USING (EXISTS (SELECT 1 FROM organization WHERE id = expo_booth.org_id AND owner_id = auth.uid()));

-- Ad Slots: Publicly readable (to know what to buy), not editable by clients
CREATE POLICY "Anyone can view ad slots" ON ad_slot
    FOR SELECT USING (true);

-- Ad Campaigns: Publicly readable IF active, org owner can manage ALL their campaigns
CREATE POLICY "Anyone can view active ad campaigns" ON ad_campaign
    FOR SELECT USING (is_active = true AND now() BETWEEN start_date AND end_date);
CREATE POLICY "Org owner can view all their campaigns" ON ad_campaign
    FOR SELECT USING (EXISTS (SELECT 1 FROM organization WHERE id = ad_campaign.org_id AND owner_id = auth.uid()));
CREATE POLICY "Org owner can insert campaigns" ON ad_campaign
    FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM organization WHERE id = ad_campaign.org_id AND owner_id = auth.uid()));
CREATE POLICY "Org owner can update campaigns" ON ad_campaign
    FOR UPDATE USING (EXISTS (SELECT 1 FROM organization WHERE id = ad_campaign.org_id AND owner_id = auth.uid()));

-- Expo Seminar: Publicly readable
CREATE POLICY "Anyone can view seminars" ON expo_seminar
    FOR SELECT USING (true);

-- Telemetry (Impressions & Clicks): Anyone can insert (anonymous web traffic), only org owners can read their own
CREATE POLICY "Anyone can insert impressions" ON ad_impression
    FOR INSERT WITH CHECK (true);
CREATE POLICY "Org owners can read their own impressions" ON ad_impression
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM ad_campaign c 
            JOIN organization o ON c.org_id = o.id 
            WHERE c.id = ad_impression.campaign_id AND o.owner_id = auth.uid()
        )
    );

CREATE POLICY "Anyone can insert clicks" ON ad_click
    FOR INSERT WITH CHECK (true);
CREATE POLICY "Org owners can read their own clicks" ON ad_click
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM ad_campaign c 
            JOIN organization o ON c.org_id = o.id 
            WHERE c.id = ad_click.campaign_id AND o.owner_id = auth.uid()
        )
    );

-- Booth Leads: Anyone can insert (visitor submitting form), only org owners can read
CREATE POLICY "Anyone can insert booth leads" ON booth_lead
    FOR INSERT WITH CHECK (true);
CREATE POLICY "Org owners can read their own booth leads" ON booth_lead
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM expo_booth b 
            JOIN organization o ON b.org_id = o.id 
            WHERE b.id = booth_lead.booth_id AND o.owner_id = auth.uid()
        )
    );



-- SOURCE: 20260305000000_security_audit.sql
-- PR 4: Security Audit & Comprehensive RLS Policies (INTELLIGENT COLUMN VERSION 2)
-- Date: 2026-03-05

-- ==========================================
-- 1. TABULU UN KOLONNU STRUKTŪRAS SAKĀRTOŠANA
-- ==========================================

-- Organization sakārtošana
CREATE TABLE IF NOT EXISTS organization (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    business_type TEXT,
    logo_url TEXT
);

DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='organization' AND column_name='owner_id') THEN
        ALTER TABLE organization ADD COLUMN owner_id UUID REFERENCES auth.users(id);
    END IF;
END $$;

-- Estimates sakārtošana
CREATE TABLE IF NOT EXISTS estimate (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    estimate_no TEXT NOT NULL,
    client_name TEXT,
    project_name TEXT,
    status TEXT DEFAULT 'draft',
    total_amount NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS estimate_line (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    estimate_id UUID REFERENCES estimate(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    quantity NUMERIC DEFAULT 1,
    unit TEXT,
    unit_price NUMERIC DEFAULT 0,
    total_price NUMERIC DEFAULT 0
);

-- Marketing Autopilot sakārtošana
CREATE TABLE IF NOT EXISTS marketing_autopilot (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bot_name TEXT NOT NULL,
    is_active BOOLEAN DEFAULT false,
    total_reach INTEGER DEFAULT 0,
    total_leads INTEGER DEFAULT 0,
    last_run_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='marketing_autopilot' AND column_name='org_id') THEN
        ALTER TABLE marketing_autopilot ADD COLUMN org_id UUID REFERENCES organization(id) ON DELETE CASCADE;
    END IF;
END $$;

-- Booth Offer sakārtošana
CREATE TABLE IF NOT EXISTS booth_offer (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booth_id UUID REFERENCES expo_booth(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    price TEXT,
    description TEXT,
    sort_order INTEGER DEFAULT 0
);

-- Booth Asset sakārtošana
CREATE TABLE IF NOT EXISTS booth_asset (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booth_id UUID REFERENCES expo_booth(id) ON DELETE CASCADE,
    asset_type TEXT NOT NULL,
    url TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ==========================================
-- 2. RLS IESLĒGŠANA
-- ==========================================
ALTER TABLE organization ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate ENABLE ROW LEVEL SECURITY;
ALTER TABLE estimate_line ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_autopilot ENABLE ROW LEVEL SECURITY;
ALTER TABLE booth_offer ENABLE ROW LEVEL SECURITY;
ALTER TABLE booth_asset ENABLE ROW LEVEL SECURITY;
ALTER TABLE expo_seminar ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- 3. VECO POLITIKU DZĒŠANA (Tīrīšana)
-- ==========================================
DO $$ 
DECLARE
    pol_cmd TEXT;
BEGIN
    SELECT string_agg('DROP POLICY IF EXISTS ' || quote_ident(policyname) || ' ON ' || quote_ident(tablename) || ';', ' ')
    INTO pol_cmd
    FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename IN ('organization', 'estimate', 'estimate_line', 'marketing_autopilot', 'booth_offer', 'booth_asset', 'expo_seminar');

    IF pol_cmd IS NOT NULL THEN
        EXECUTE pol_cmd;
    END IF;
END $$;

-- ==========================================
-- 4. JAUNU POLITIKU PIEMĒROŠANA (Ar dinamisko kolonnu pārbaudi)
-- ==========================================

-- Organization
CREATE POLICY "org_select_own" ON organization FOR SELECT USING (auth.uid() = owner_id);
CREATE POLICY "org_update_own" ON organization FOR UPDATE USING (auth.uid() = owner_id);
CREATE POLICY "org_insert_authenticated" ON organization FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Estimates
CREATE POLICY "est_manage_own" ON estimate FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "est_line_manage_own" ON estimate_line FOR ALL USING (
    EXISTS (SELECT 1 FROM estimate e WHERE e.id = estimate_line.estimate_id AND e.user_id = auth.uid())
);

-- Marketing Autopilot
CREATE POLICY "auto_manage_own" ON marketing_autopilot FOR ALL USING (
    EXISTS (SELECT 1 FROM organization o WHERE o.id = marketing_autopilot.org_id AND o.owner_id = auth.uid())
);

-- Booth Offers
CREATE POLICY "offer_select_all" ON booth_offer FOR SELECT USING (true);
CREATE POLICY "offer_manage_own" ON booth_offer FOR ALL USING (
    EXISTS (SELECT 1 FROM expo_booth b JOIN organization o ON b.org_id = o.id WHERE b.id = booth_offer.booth_id AND o.owner_id = auth.uid())
);

-- Booth Assets
CREATE POLICY "asset_select_all" ON booth_asset FOR SELECT USING (true);
CREATE POLICY "asset_manage_own" ON booth_asset FOR ALL USING (
    EXISTS (SELECT 1 FROM expo_booth b JOIN organization o ON b.org_id = o.id WHERE b.id = booth_asset.booth_id AND o.owner_id = auth.uid())
);

-- Expo Seminar (Dinamiska politika, kas atpazīst gan booth_id, gan expo_booth_id)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='expo_seminar' AND column_name='booth_id') THEN
        EXECUTE 'CREATE POLICY seminar_select_all ON expo_seminar FOR SELECT USING (true)';
        EXECUTE 'CREATE POLICY seminar_manage_own ON expo_seminar FOR ALL USING (EXISTS (SELECT 1 FROM expo_booth b JOIN organization o ON b.org_id = o.id WHERE b.id = expo_seminar.booth_id AND o.owner_id = auth.uid()))';
    ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='expo_seminar' AND column_name='expo_booth_id') THEN
        EXECUTE 'CREATE POLICY seminar_select_all ON expo_seminar FOR SELECT USING (true)';
        EXECUTE 'CREATE POLICY seminar_manage_own ON expo_seminar FOR ALL USING (EXISTS (SELECT 1 FROM expo_booth b JOIN organization o ON b.org_id = o.id WHERE b.id = expo_seminar.expo_booth_id AND o.owner_id = auth.uid()))';
    END IF;
END $$;



-- SOURCE: 20260308000000_warpala_os_schema.sql
-- Warpala AI Construction OS - Database Schema & Security Audit
-- Date: 2026-03-08

-- ==========================================
-- 1. TABLES
-- ==========================================

-- Companies / Organizations
CREATE TABLE IF NOT EXISTS companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    country TEXT DEFAULT 'LV',
    vat TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Users & Profiles
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    company_id UUID REFERENCES companies(id),
    email TEXT NOT NULL,
    plan TEXT DEFAULT 'free', -- free, pro, enterprise
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Clients
CREATE TABLE IF NOT EXISTS clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    address TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Projects
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    user_id UUID REFERENCES auth.users(id),
    title TEXT NOT NULL,
    status TEXT DEFAULT 'draft', -- draft, active, completed, cancelled
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Project Tasks (Labour)
CREATE TABLE IF NOT EXISTS project_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    description TEXT,
    cost_per_hour NUMERIC DEFAULT 0,
    hours_planned NUMERIC DEFAULT 0,
    status TEXT DEFAULT 'pending'
);

-- Project Materials
CREATE TABLE IF NOT EXISTS project_materials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    quantity NUMERIC DEFAULT 1,
    unit_price NUMERIC DEFAULT 0,
    unit TEXT DEFAULT 'pcs'
);

-- Quotes & Invoices
CREATE TABLE IF NOT EXISTS quotes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    total_price NUMERIC DEFAULT 0,
    status TEXT DEFAULT 'draft',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    amount NUMERIC DEFAULT 0,
    status TEXT DEFAULT 'unpaid', -- unpaid, paid
    payment_link TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ==========================================
-- 2. SECURITY (RLS)
-- ==========================================
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- POLICIES: Only access own company data
CREATE POLICY "company_access" ON companies FOR ALL USING (
    id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
);

CREATE POLICY "user_profile_access" ON user_profiles FOR ALL USING (id = auth.uid());

CREATE POLICY "project_access" ON projects FOR ALL USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
);

CREATE POLICY "client_access" ON clients FOR ALL USING (
    company_id IN (SELECT company_id FROM user_profiles WHERE id = auth.uid())
);

CREATE POLICY "task_access" ON project_tasks FOR ALL USING (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
);

CREATE POLICY "material_access" ON project_materials FOR ALL USING (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
);



-- SOURCE: 20260308000001_expo_city_core.sql
-- WARPALA EXPO CITY CORE SCHEMA

-- 1. SEKTORI (RAJONI)
CREATE TABLE IF NOT EXISTS sectors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    color_theme TEXT DEFAULT '#3b82f6',
    map_position JSONB, -- {x: number, y: number, z: number} priekš 2D/3D
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. UZŅĒMUMI
CREATE TYPE subscription_tier AS ENUM ('free', 'basic', 'pro', 'enterprise');

CREATE TABLE IF NOT EXISTS companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sector_id UUID REFERENCES sectors(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    description TEXT,
    logo_url TEXT,
    website TEXT,
    location TEXT,
    contact_email TEXT,
    tier subscription_tier DEFAULT 'free',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. STENDI (BOOTH CONTENT)
CREATE TABLE IF NOT EXISTS booths (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE UNIQUE,
    video_url TEXT,
    images JSONB DEFAULT '[]', -- Bilžu galerija
    services JSONB DEFAULT '[]', -- Pakalpojumu saraksts
    products JSONB DEFAULT '[]', -- Produktu saraksts
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. PIEPRASĪJUMI / LEADS
CREATE TABLE IF NOT EXISTS service_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    user_id UUID, -- Var būt NULL, ja klients nav reģistrēts
    service_name TEXT,
    client_name TEXT,
    client_email TEXT,
    message TEXT,
    status TEXT DEFAULT 'pending', -- pending, contacted, closed, rejected
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- IESPĒJOJAM RLS (Row Level Security)
ALTER TABLE sectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE booths ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_requests ENABLE ROW LEVEL SECURITY;

-- PUBLISKĀS LASĪŠANAS TIESĪBAS (Visi redz pilsētu)
CREATE POLICY "Public sectors are viewable by everyone" ON sectors FOR SELECT USING (true);
CREATE POLICY "Active companies are viewable by everyone" ON companies FOR SELECT USING (is_active = true);
CREATE POLICY "Booths are viewable by everyone" ON booths FOR SELECT USING (true);

-- DATU PARAUGI (Sākotnējie sektori)
INSERT INTO sectors (name, description, color_theme, map_position) VALUES
('Construction', 'Building innovation and contractors', '#eab308', '{"x": 0, "y": 0, "z": -150}'),
('Tech Zone', 'AI, Software and Hardware', '#3b82f6', '{"x": 0, "y": 0, "z": -250}'),
('Art Gallery', 'Digital and fine arts', '#8b5cf6', '{"x": 0, "y": 0, "z": -400}'),
('Real Estate', 'Global property and investment', '#ec4899', '{"x": 0, "y": 0, "z": -550}');



-- SOURCE: 20260309000000_market_and_chat.sql
-- MARKETPLACE SERVICES
CREATE TABLE IF NOT EXISTS public.marketplace_services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    price_starting_from DECIMAL,
    category TEXT,
    image_url TEXT,
    tags TEXT[],
    rating DECIMAL DEFAULT 5.0,
    reviews_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- REAL-TIME CHAT MESSAGES
CREATE TABLE IF NOT EXISTS public.chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID REFERENCES auth.users(id),
    receiver_id UUID REFERENCES auth.users(id), -- NULL if global/AI
    session_id TEXT, -- For guest/AI sessions
    content TEXT NOT NULL,
    is_ai BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS SETTINGS
ALTER TABLE public.marketplace_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read for services" ON public.marketplace_services FOR SELECT USING (true);
CREATE POLICY "Allow authenticated chat" ON public.chat_messages FOR ALL USING (true);



-- SOURCE: 20260310000000_core_system_schema.sql
-- Phase 2: Core System Schema Migration (Safe, Additive)
-- Ensures existing tables are NOT touched if they exist.

-- 1. Users Table
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    role TEXT DEFAULT 'user',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Projects Table
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'active',
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Agents Table
CREATE TABLE IF NOT EXISTS public.agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    system_prompt TEXT,
    memory JSONB DEFAULT '{}'::jsonb,
    status TEXT DEFAULT 'idle',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Agent Tasks Table
CREATE TABLE IF NOT EXISTS public.agent_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID REFERENCES public.agents(id) ON DELETE CASCADE,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'pending',
    task_data JSONB NOT NULL DEFAULT '{}'::jsonb,
    result JSONB,
    scheduled_for TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Leads Table
CREATE TABLE IF NOT EXISTS public.leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source TEXT NOT NULL,
    contact_info JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT DEFAULT 'new',
    value NUMERIC DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Expo Booths Table
CREATE TABLE IF NOT EXISTS public.expo_booths (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name TEXT NOT NULL,
    industry_sector TEXT,
    subscription_type TEXT DEFAULT 'basic',
    assets_3d JSONB DEFAULT '{}'::jsonb,
    contact_info JSONB DEFAULT '{}'::jsonb,
    status TEXT DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Simple generic updated_at trigger logic (Only applying if we create it)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- We don't attach triggers heavily here because IF NOT EXISTS doesn't support easy conditional trigger drops,
-- but the tables themselves are safely added and will handle our Phase 3 and Phase 4 systems nicely.



-- SOURCE: 20260310000001_agent_memory.sql
-- Phase 7: Agent Memory Table
-- Provides long-term episodic and semantic memory for agents

CREATE TABLE IF NOT EXISTS public.agent_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID REFERENCES public.agents(id) ON DELETE CASCADE,
    context TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);



-- SOURCE: 20260310000002_add_lead_fields.sql
-- Phase 9: Add additional fields to leads table
-- Adding score and contacted fields (status already exists from initial setup)

ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS score INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS contacted BOOLEAN DEFAULT false;



-- SOURCE: 20260310000003_expo_engine.sql
-- Phase 10: Expo City Engine

-- Add specific fields requested for expo_booths if they don't exist
ALTER TABLE public.expo_booths 
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS booth_type TEXT DEFAULT 'standard',
ADD COLUMN IF NOT EXISTS "3d_model_url" TEXT,
ADD COLUMN IF NOT EXISTS logo TEXT,
ADD COLUMN IF NOT EXISTS contact_email TEXT,
ADD COLUMN IF NOT EXISTS district TEXT;

-- Analytics table for booths
CREATE TABLE IF NOT EXISTS public.booth_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booth_id UUID REFERENCES public.expo_booths(id) ON DELETE CASCADE,
    visits INTEGER DEFAULT 0,
    interactions INTEGER DEFAULT 0,
    leads_generated INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);



-- SOURCE: 20260310000004_billing_fields.sql
-- Phase 12: SaaS Monetization System Fields

ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'free',
ADD COLUMN IF NOT EXISTS credits INTEGER DEFAULT 100,
ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'active';



-- SOURCE: 20260310000005_marketplace_tables.sql
-- Phase 13: AI Agent Marketplace Tables

CREATE TABLE IF NOT EXISTS public.marketplace_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id TEXT UNIQUE NOT NULL, -- e.g., 'seo_agent'
    name TEXT NOT NULL,
    description TEXT,
    price INTEGER DEFAULT 0,
    category TEXT,
    capabilities JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.marketplace_workflows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    price INTEGER DEFAULT 0,
    steps JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.user_installed_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    marketplace_agent_id UUID REFERENCES public.marketplace_agents(id) ON DELETE CASCADE,
    installed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.user_installed_workflows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    marketplace_workflow_id UUID REFERENCES public.marketplace_workflows(id) ON DELETE CASCADE,
    installed_at TIMESTAMPTZ DEFAULT NOW()
);



-- SOURCE: 20260310000006_security_and_auth.sql
-- Phase 17: Security & Auth Orchestration
-- 1. Enable RLS on all system tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expo_booths ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booth_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_installed_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_installed_workflows ENABLE ROW LEVEL SECURITY;

-- 2. USERS Table Policies
CREATE POLICY "Users can view their own data" ON public.users
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own data" ON public.users
    FOR UPDATE USING (auth.uid() = id);

-- 3. PROJECTS Table Policies
CREATE POLICY "Users can manage their own projects" ON public.projects
    FOR ALL USING (auth.uid() = user_id);

-- 4. AGENT_TASKS Table Policies
-- Tasks are linked to projects, so we check if the user owns the project
CREATE POLICY "Users can view tasks for their projects" ON public.agent_tasks
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.projects 
            WHERE projects.id = agent_tasks.project_id 
            AND projects.user_id = auth.uid()
        )
    );

-- 5. LEADS Table Policies
-- For simplicity, leads in this phase are user-specific if we add a user_id, 
-- or global if shared. Let's make them private by adding a user_id check.
-- First, let's add user_id to leads for proper RLS
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.users(id);

CREATE POLICY "Users can manage their own leads" ON public.leads
    FOR ALL USING (auth.uid() = user_id);

-- 6. EXPO_BOOTHS Table Policies
-- Expo booths are usually public for viewing but private for editing
CREATE POLICY "Anyone can view active booths" ON public.expo_booths
    FOR SELECT USING (status = 'active');

CREATE POLICY "Users can manage their own booths" ON public.expo_booths
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.users 
            WHERE users.id = auth.uid() AND users.role = 'admin'
        )
    );

-- 7. MARKETPLACE (Read-only for users)
ALTER TABLE public.marketplace_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_workflows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Everyone can view marketplace" ON public.marketplace_agents FOR SELECT USING (true);
CREATE POLICY "Everyone can view workflows" ON public.marketplace_workflows FOR SELECT USING (true);

-- 8. USER_INSTALLED (Owner-only)
CREATE POLICY "Users can view their own installs" ON public.user_installed_agents FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can view their own workflow installs" ON public.user_installed_workflows FOR ALL USING (auth.uid() = user_id);

-- 9. AUTH TRIGGER
-- Automatically sync Supabase Auth users with our public.users table
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.users (id, email, full_name, role)
    VALUES (
        NEW.id, 
        NEW.email, 
        NEW.raw_user_meta_data->>'full_name',
        'user'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger execution
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();



-- SOURCE: 20260310000007_outreach_logs.sql
-- Phase 4: Outreach Logs Table
-- Tracks every email sent via the platform

CREATE TABLE IF NOT EXISTS public.outreach_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    recipient_email TEXT NOT NULL,
    subject TEXT NOT NULL,
    body_html TEXT NOT NULL,
    status TEXT DEFAULT 'pending', -- pending, sent, failed, delivered, opened
    provider_message_id TEXT,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.outreach_logs ENABLE ROW LEVEL SECURITY;

-- Owner-only policy
CREATE POLICY "Users can view their own outreach logs" ON public.outreach_logs
    FOR SELECT USING (auth.uid() = user_id);



-- SOURCE: 20260310000008_cost_protection.sql
-- Phase 6: API Usage and Cost Protection Tables

-- 1. Logs every LLM call and its token cost
CREATE TABLE IF NOT EXISTS public.api_usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    provider TEXT NOT NULL, -- openai, gemini, serpapi, resend
    model TEXT,
    prompt_tokens INTEGER DEFAULT 0,
    completion_tokens INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    estimated_cost_usd NUMERIC DEFAULT 0,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Daily limits tracker for users
CREATE TABLE IF NOT EXISTS public.user_daily_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    usage_date DATE DEFAULT CURRENT_DATE,
    total_requests INTEGER DEFAULT 0,
    total_credits_consumed INTEGER DEFAULT 0,
    UNIQUE(user_id, usage_date)
);

-- Enable RLS
ALTER TABLE public.api_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_daily_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own API usage" ON public.api_usage_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can view their own daily limits" ON public.user_daily_limits FOR SELECT USING (auth.uid() = user_id);



-- SOURCE: 20260310000009_growth_engine.sql
-- Phase 11: Growth Engine Tables

CREATE TABLE IF NOT EXISTS public.landing_pages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    niche TEXT NOT NULL,
    title TEXT NOT NULL,
    seo_metadata JSONB DEFAULT '{}'::jsonb,
    content_html TEXT NOT NULL,
    status TEXT DEFAULT 'draft', -- draft, published
    conversion_rate NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.landing_pages ENABLE ROW LEVEL SECURITY;

-- Allow public viewing of published pages
CREATE POLICY "Anyone can view published landing pages" ON public.landing_pages
    FOR SELECT USING (status = 'published');

-- Allow owners to manage their pages (linking to projects)
CREATE POLICY "Users can manage landing pages for their projects" ON public.landing_pages
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.projects 
            WHERE projects.id = landing_pages.project_id 
            AND projects.user_id = auth.uid()
        )
    );



-- SOURCE: 20260310000010_distribution_and_sequences.sql
-- Phase 14-16: Distribution, Analytics, and Sequences

-- 1. Content Schedule Table
CREATE TABLE IF NOT EXISTS public.content_schedule (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    platform TEXT NOT NULL, -- twitter, linkedin, reddit
    content JSONB NOT NULL,
    scheduled_at TIMESTAMPTZ NOT NULL,
    status TEXT DEFAULT 'scheduled', -- scheduled, published, failed
    published_at TIMESTAMPTZ,
    error_log TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Traffic Analytics Table
CREATE TABLE IF NOT EXISTS public.traffic_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    landing_page_id UUID REFERENCES public.landing_pages(id) ON DELETE SET NULL,
    source TEXT NOT NULL, -- reddit, twitter, direct, etc.
    campaign TEXT,
    device_type TEXT,
    converted BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Email Sequences Table
CREATE TABLE IF NOT EXISTS public.email_sequences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    steps JSONB NOT NULL, -- [{ "day": 0, "subject": "...", "body": "..." }, { "day": 2, ... }]
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. User Sequence Progress
CREATE TABLE IF NOT EXISTS public.user_sequence_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
    sequence_id UUID REFERENCES public.email_sequences(id) ON DELETE CASCADE,
    current_step INTEGER DEFAULT 0,
    last_sent_at TIMESTAMPTZ,
    status TEXT DEFAULT 'active', -- active, completed, paused
    UNIQUE(lead_id, sequence_id)
);

-- Add slug to landing_pages if missing
ALTER TABLE public.landing_pages ADD COLUMN IF NOT EXISTS slug TEXT UNIQUE;

-- Enable RLS
ALTER TABLE public.content_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.traffic_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sequence_progress ENABLE ROW LEVEL SECURITY;

-- Basic Owner-only policies
CREATE POLICY "Users can manage their content schedule" ON public.content_schedule FOR ALL USING (
    EXISTS (SELECT 1 FROM public.projects WHERE projects.id = content_schedule.project_id AND projects.user_id = auth.uid())
);
CREATE POLICY "Users can view their analytics" ON public.traffic_analytics FOR SELECT USING (true); -- Public for tracking



-- SOURCE: 20260310000011_governance_layer.sql
-- Phase 17: Agent Governance and Safety

CREATE TABLE IF NOT EXISTS public.governance_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    agent_id UUID REFERENCES public.agents(id) ON DELETE CASCADE,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    alert_type TEXT NOT NULL, -- loop_detected, budget_exceeded, velocity_limit
    severity TEXT DEFAULT 'warning', -- warning, critical, blocked
    description TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Workflow stats to track depth and task count
CREATE TABLE IF NOT EXISTS public.workflow_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    total_tasks_run INTEGER DEFAULT 0,
    max_depth INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active',
    last_run_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.governance_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their alerts" ON public.governance_alerts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can view their workflow stats" ON public.workflow_stats FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.projects WHERE projects.id = workflow_stats.project_id AND projects.user_id = auth.uid())
);



-- SOURCE: 20260310000012_revenue_engine.sql
-- Phase 19-23: AI Revenue Engine

-- 1. Prospects Table (Businesses we target for our SaaS)
CREATE TABLE IF NOT EXISTS public.prospects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name TEXT NOT NULL,
    website TEXT,
    email TEXT,
    industry TEXT,
    location TEXT,
    niche_relevance_score INTEGER DEFAULT 0,
    status TEXT DEFAULT 'new', -- new, analyzing, offer_generated, outreach_active, converted, rejected
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Personalized Offers Table
CREATE TABLE IF NOT EXISTS public.personalized_offers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prospect_id UUID REFERENCES public.prospects(id) ON DELETE CASCADE,
    offer_type TEXT NOT NULL, -- ai_website, ai_marketing, ai_lead_gen
    analysis_context TEXT, -- Data extracted from their website
    personalized_copy TEXT NOT NULL,
    stripe_checkout_url TEXT,
    status TEXT DEFAULT 'draft', -- draft, sent, accepted
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Conversion tracking table
CREATE TABLE IF NOT EXISTS public.revenue_conversions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prospect_id UUID REFERENCES public.prospects(id) ON DELETE CASCADE,
    offer_id UUID REFERENCES public.personalized_offers(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL, -- email_open, link_click, stripe_session_started, purchase_completed
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personalized_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revenue_conversions ENABLE ROW LEVEL SECURITY;

-- Admin-only policies for revenue management
CREATE POLICY "Admins can manage prospects" ON public.prospects FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role = 'admin')
);
CREATE POLICY "Admins can manage offers" ON public.personalized_offers FOR ALL USING (
    EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role = 'admin')
);
CREATE POLICY "Admins can view conversions" ON public.revenue_conversions FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.users WHERE users.id = auth.uid() AND users.role = 'admin')
);



-- SOURCE: 20260310000013_workflow_builder.sql
-- Phase 24-27: Workflow Builder and Execution

-- 1. Workflows Table (Stores the node-based definitions)
CREATE TABLE IF NOT EXISTS public.workflows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    nodes JSONB NOT NULL DEFAULT '[]'::jsonb,
    edges JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Workflow Runs Table (Stores execution history and states)
CREATE TABLE IF NOT EXISTS public.workflow_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID REFERENCES public.workflows(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'running', -- running, completed, failed, paused
    current_node_id TEXT,
    state_data JSONB DEFAULT '{}'::jsonb,
    error_log TEXT,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Enable RLS
ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_runs ENABLE ROW LEVEL SECURITY;

-- Owner-only policies
CREATE POLICY "Users can manage their workflows" ON public.workflows FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can view their workflow runs" ON public.workflow_runs FOR SELECT USING (auth.uid() = user_id);



-- SOURCE: 20260311000000_system_recovery.sql
-- WARPALA AI SYSTEM RECOVERY & SYNCHRONIZATION
-- This migration ensures ALL required tables exist for the current application logic.

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. BASIC SCHEMA (Companies & Clients)
CREATE TABLE IF NOT EXISTS public.companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sector_id UUID,
    name TEXT NOT NULL,
    description TEXT,
    logo_url TEXT,
    website TEXT,
    location TEXT,
    contact_email TEXT,
    tier TEXT DEFAULT 'free',
    is_active BOOLEAN DEFAULT true,
    vat TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. PROJECTS & TRACKING
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    user_id UUID,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'draft',
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.project_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    description TEXT,
    cost_per_hour NUMERIC DEFAULT 0,
    hours_planned NUMERIC DEFAULT 0,
    status TEXT DEFAULT 'pending'
);

CREATE TABLE IF NOT EXISTS public.project_materials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    quantity NUMERIC DEFAULT 1,
    unit_price NUMERIC DEFAULT 0,
    unit TEXT DEFAULT 'pcs'
);

CREATE TABLE IF NOT EXISTS public.quotes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    total_price NUMERIC DEFAULT 0,
    status TEXT DEFAULT 'draft',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    amount NUMERIC DEFAULT 0,
    status TEXT DEFAULT 'unpaid',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. EXPO & MARKETPLACE
CREATE TABLE IF NOT EXISTS public.sectors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    color_theme TEXT DEFAULT '#3b82f6',
    map_position JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.booths (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE UNIQUE,
    video_url TEXT,
    images JSONB DEFAULT '[]',
    services JSONB DEFAULT '[]',
    products JSONB DEFAULT '[]',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.marketplace_services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    price_starting_from DECIMAL,
    category TEXT,
    image_url TEXT,
    tags TEXT[],
    rating DECIMAL DEFAULT 5.0,
    reviews_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.service_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    user_id UUID,
    service_name TEXT,
    client_name TEXT,
    client_email TEXT,
    message TEXT,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. COMMUNICATION
CREATE TABLE IF NOT EXISTS public.chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID,
    receiver_id UUID,
    session_id TEXT,
    content TEXT NOT NULL,
    is_ai BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. AGENT CORE
CREATE TABLE IF NOT EXISTS public.agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    system_prompt TEXT,
    memory JSONB DEFAULT '{}'::jsonb,
    status TEXT DEFAULT 'idle',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. SECURITY (RLS)
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booths ENABLE ROW LEVEL SECURITY;

-- POLICIES (Simplified for Recovery)
DROP POLICY IF EXISTS "Public read services" ON public.marketplace_services;
CREATE POLICY "Public read services" ON public.marketplace_services FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read companies" ON public.companies;
CREATE POLICY "Public read companies" ON public.companies FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read sectors" ON public.sectors;
CREATE POLICY "Public read sectors" ON public.sectors FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read booths" ON public.booths;
CREATE POLICY "Public read booths" ON public.booths FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow chat messages" ON public.chat_messages;
CREATE POLICY "Allow chat messages" ON public.chat_messages FOR ALL USING (true);

-- Ensure user can see their clients and projects
DROP POLICY IF EXISTS "Clients viewable by authenticated" ON public.clients;
CREATE POLICY "Clients viewable by authenticated" ON public.clients FOR SELECT USING (true);

DROP POLICY IF EXISTS "Projects viewable by authenticated" ON public.projects;
CREATE POLICY "Projects viewable by authenticated" ON public.projects FOR SELECT USING (true);



-- SOURCE: 20260312000000_phase1_hardening.sql
-- PHASE 1: DATA PERSISTENCE & SECURITY HARDENING

-- 1. CITIES TABLE
CREATE TABLE IF NOT EXISTS cities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    architecture_style TEXT DEFAULT 'Futuristic', -- Futuristic, Industrial, Minimalist, Cyberpunk
    global_location JSONB DEFAULT '{"x": 0, "y": 0, "z": 0}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. LINK SECTORS TO CITIES
ALTER TABLE sectors ADD COLUMN IF NOT EXISTS city_id UUID REFERENCES cities(id) ON DELETE CASCADE;

-- 3. ENHANCE COMPANIES WITH ECONOMIC DATA
ALTER TABLE companies ADD COLUMN IF NOT EXISTS current_revenue NUMERIC DEFAULT 0;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS activity_score NUMERIC DEFAULT 0.5; -- 0.0 to 1.0
ALTER TABLE companies ADD COLUMN IF NOT EXISTS employee_count INTEGER DEFAULT 0;

-- 4. BOOTH 3D DATA
ALTER TABLE booths ADD COLUMN IF NOT EXISTS model_url TEXT DEFAULT 'L_Booth_Default';

-- 5. API SECURITY (Simple key table for UE5)
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key_name TEXT NOT NULL,
    secret_key TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ENABLE RLS
ALTER TABLE cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- POLICIES
CREATE POLICY "Public cities are viewable by everyone" ON cities FOR SELECT USING (is_active = true);
CREATE POLICY "API keys are service-only" ON api_keys FOR ALL USING (false); -- No public access

-- SEED DATA
INSERT INTO cities (name, architecture_style, global_location) 
VALUES ('Warpala Prime', 'Futuristic', '{"x": 0, "y": 0, "z": 0}')
ON CONFLICT DO NOTHING;

-- Link existing sectors to the first city
UPDATE sectors SET city_id = (SELECT id FROM cities LIMIT 1) WHERE city_id IS NULL;



-- SOURCE: 20260314163542_fix_rls_traffic_and_sequences.sql
-- Iespējot RLS priekš traffic_analytics
ALTER TABLE public.traffic_analytics ENABLE ROW LEVEL SECURITY;

-- Noteikumi priekš traffic_analytics
-- Parasti analītiku var skatīt tikai autentificēti lietotāji (vai admini), bet ja nepieciešams vākt datus publiski:
CREATE POLICY "Enable insert for public" ON public.traffic_analytics
  FOR INSERT WITH CHECK (true);

-- Iespējot RLS priekš user_sequence_progress
ALTER TABLE public.user_sequence_progress ENABLE ROW LEVEL SECURITY;

-- Noteikumi priekš user_sequence_progress
-- Lietotāji var redzēt tikai progresu, kas piesaistīts viņu pašu līdiem
CREATE POLICY "Users can view their own sequence progress" ON public.user_sequence_progress
  FOR SELECT TO authenticated USING (
      EXISTS (SELECT 1 FROM public.leads WHERE leads.id = user_sequence_progress.lead_id AND leads.user_id = auth.uid())
  );

CREATE POLICY "Users can insert their own sequence progress" ON public.user_sequence_progress
  FOR INSERT TO authenticated WITH CHECK (
      EXISTS (SELECT 1 FROM public.leads WHERE leads.id = lead_id AND leads.user_id = auth.uid())
  );

CREATE POLICY "Users can update their own sequence progress" ON public.user_sequence_progress
  FOR UPDATE TO authenticated USING (
      EXISTS (SELECT 1 FROM public.leads WHERE leads.id = user_sequence_progress.lead_id AND leads.user_id = auth.uid())
  );




-- SOURCE: 20260318_production_setup.sql
-- PRODUCTION SPONSORSHIP SYSTEM
-- Izpildīt šo Supabase SQL Editor

-- 1. Sponsoru tabula
CREATE TABLE IF NOT EXISTS sponsors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  logo_url TEXT,
  tier TEXT CHECK (tier IN ('BASIC', 'INTERACTIVE', 'PREMIUM')),
  balance NUMERIC DEFAULT 1000.0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Analītikas tabula
CREATE TABLE IF NOT EXISTS booth_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  sponsor_id TEXT REFERENCES sponsors(id),
  event_type TEXT CHECK (event_type IN ('ENTRY', 'EXIT', 'CLICK', 'DOWNLOAD')),
  duration INT DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Billing kopsavilkums
CREATE TABLE IF NOT EXISTS sponsor_billing (
  sponsor_id TEXT PRIMARY KEY REFERENCES sponsors(id),
  total_entries INT DEFAULT 0,
  total_spent NUMERIC DEFAULT 0,
  last_updated TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Funkcija automātiskai norēķinu veikšanai (Anti-Spam 1h)
CREATE OR REPLACE FUNCTION handle_booth_entry(s_id TEXT, u_id UUID)
RETURNS VOID AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM booth_analytics 
    WHERE user_id = u_id AND sponsor_id = s_id AND event_type = 'ENTRY' 
    AND created_at > NOW() - INTERVAL '1 hour'
  ) THEN
    INSERT INTO booth_analytics (user_id, sponsor_id, event_type)
    VALUES (u_id, s_id, 'ENTRY');

    UPDATE sponsors SET balance = balance - 0.50 WHERE id = s_id;
    
    INSERT INTO sponsor_billing (sponsor_id, total_entries, total_spent)
    VALUES (s_id, 1, 0.50)
    ON CONFLICT (sponsor_id) DO UPDATE SET
      total_entries = sponsor_billing.total_entries + 1,
      total_spent = sponsor_billing.total_spent + 0.50,
      last_updated = NOW();
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;



-- SOURCE: 20260327061000_expo_sponsor_release_seed.sql
-- Release hardening: replace legacy expo demo seed data with sponsor-ready minimum content.

-- 1. Ensure sponsor-ready columns exist on the public expo tables used by /api/expo/scene.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS sector_id UUID REFERENCES public.sectors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS website TEXT,
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS contact_email TEXT,
  ADD COLUMN IF NOT EXISTS tier TEXT DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS sponsor_tier TEXT DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS booth_type TEXT DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS tagline TEXT,
  ADD COLUMN IF NOT EXISTS booking_url TEXT,
  ADD COLUMN IF NOT EXISTS poster_url TEXT,
  ADD COLUMN IF NOT EXISTS hero_asset_url TEXT,
  ADD COLUMN IF NOT EXISTS cta_label TEXT,
  ADD COLUMN IF NOT EXISTS slug TEXT;

ALTER TABLE public.booths
  ADD COLUMN IF NOT EXISTS model_url TEXT,
  ADD COLUMN IF NOT EXISTS booth_type TEXT DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS poster_url TEXT,
  ADD COLUMN IF NOT EXISTS hero_asset_url TEXT,
  ADD COLUMN IF NOT EXISTS cta_label TEXT;

UPDATE public.companies
SET slug = lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'))
WHERE slug IS NULL AND name IS NOT NULL;

-- 2. Remove legacy demo content that keeps the live scene in a non-sponsor-ready state.
DELETE FROM public.booths
WHERE company_id IN (
  SELECT id
  FROM public.companies
  WHERE name IN ('Demo Company 1', 'Demo Company 2')
);

DELETE FROM public.companies
WHERE name IN ('Demo Company 1', 'Demo Company 2');

DELETE FROM public.sectors
WHERE name IN ('Construction', 'Technology')
  AND id NOT IN (
    SELECT DISTINCT sector_id
    FROM public.companies
    WHERE sector_id IS NOT NULL
  );

-- 3. Create sponsor-ready baseline sectors for the release boulevard.
WITH sponsor_sectors AS (
  INSERT INTO public.sectors (name, description, color_theme, map_position)
  VALUES
    (
      'Platform Partners',
      'Core platform, title sponsors, and primary arrival boulevard partners',
      '#2563eb',
      '{"x": 0, "y": 0, "z": -110}'::jsonb
    ),
    (
      'Meetings & Demos',
      'Live demos, meeting booking, and sponsor follow-up actions',
      '#0f766e',
      '{"x": 0, "y": 0, "z": -250}'::jsonb
    )
  ON CONFLICT DO NOTHING
  RETURNING id, name
),
all_target_sectors AS (
  SELECT id, name FROM sponsor_sectors
  UNION
  SELECT id, name
  FROM public.sectors
  WHERE name IN ('Platform Partners', 'Meetings & Demos')
)
INSERT INTO public.companies (
  sector_id,
  name,
  description,
  logo_url,
  website,
  location,
  tier,
  is_active,
  sponsor_tier,
  priority,
  booth_type,
  tagline,
  booking_url,
  poster_url,
  hero_asset_url,
  cta_label,
  slug
)
SELECT
  (SELECT id FROM all_target_sectors WHERE name = payload.sector_name),
  payload.name,
  payload.description,
  payload.logo_url,
  payload.website,
  payload.location,
  payload.tier,
  true,
  payload.sponsor_tier,
  payload.priority,
  payload.booth_type,
  payload.tagline,
  payload.booking_url,
  NULL,
  NULL,
  payload.cta_label,
  payload.slug
FROM (
  VALUES
    (
      'Platform Partners',
      'Warpala Platform',
      'Primary platform showcase and sponsor boulevard entry point',
      NULL,
      'https://warpala.com',
      'Warpala Expo Boulevard',
      'enterprise',
      'hero',
      100,
      'hero',
      'Platform overview, sponsor discovery, and live expo entry point.',
      NULL,
      NULL,
      'warpala-platform'
    ),
    (
      'Meetings & Demos',
      'Sponsor Concierge',
      'Meeting booking and sponsor support desk for live demos and follow-up',
      NULL,
      'https://warpala.com/contact',
      'Warpala Expo Meetings',
      'pro',
      'gold',
      80,
      'premium',
      'Book sponsor meetings and navigate the boulevard without disruption.',
      'https://warpala.com/contact',
      'Book Meeting',
      'sponsor-concierge'
    ),
    (
      'Meetings & Demos',
      'Demo Room Access',
      'Internal guided product demos and sponsor handoff room',
      NULL,
      'https://warpala.com',
      'Warpala Demo Rooms',
      'pro',
      'silver',
      60,
      'standard',
      'Open a guided product demo room with stable fallback navigation.',
      NULL,
      'Open Demo',
      'demo-room-access'
    )
) AS payload(
  sector_name,
  name,
  description,
  logo_url,
  website,
  location,
  tier,
  sponsor_tier,
  priority,
  booth_type,
  tagline,
  booking_url,
  cta_label,
  slug
)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.companies existing
  WHERE existing.slug = payload.slug
     OR existing.name = payload.name
);

-- 4. Ensure each release sponsor has a matching booth record with no placeholder media.
INSERT INTO public.booths (
  company_id,
  video_url,
  model_url,
  images,
  services,
  products,
  booth_type,
  poster_url,
  hero_asset_url,
  cta_label
)
SELECT
  c.id,
  NULL,
  NULL,
  '[]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  c.booth_type,
  NULL,
  NULL,
  c.cta_label
FROM public.companies c
WHERE c.slug IN ('warpala-platform', 'sponsor-concierge', 'demo-room-access')
  AND NOT EXISTS (
    SELECT 1
    FROM public.booths b
    WHERE b.company_id = c.id
  );

-- 5. Normalize any leftover fake booth model identifiers from legacy seeds.
UPDATE public.booths
SET model_url = NULL
WHERE model_url IN ('L_Booth_Default', 'L_Booth_Default.glb', '');



-- SOURCE: 20260328093000_expo_release_analytics.sql
CREATE TABLE IF NOT EXISTS public.expo_release_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_name TEXT NOT NULL CHECK (event_name IN (
        'scene_loaded',
        'sector_entered',
        'booth_viewed',
        'booth_clicked',
        'website_opened',
        'booking_clicked',
        'demo_room_entered'
    )),
    session_id TEXT,
    booth_id TEXT,
    booth_template TEXT,
    company_id TEXT,
    company_slug TEXT,
    sector_id TEXT,
    sector_name TEXT,
    sponsor_tier TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS expo_release_analytics_event_name_idx
    ON public.expo_release_analytics (event_name);

CREATE INDEX IF NOT EXISTS expo_release_analytics_company_slug_idx
    ON public.expo_release_analytics (company_slug);

CREATE INDEX IF NOT EXISTS expo_release_analytics_session_id_idx
    ON public.expo_release_analytics (session_id);



-- SOURCE: 20260407123000_premium_showroom_and_city_screens.sql
-- Premium showroom content slots + city screen inventory/reservations.
-- This extends the existing public.companies/public.booths expo model
-- instead of introducing a parallel booth schema.

ALTER TABLE public.booths
  ADD COLUMN IF NOT EXISTS showroom_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS hero_screen_type TEXT DEFAULT 'image',
  ADD COLUMN IF NOT EXISTS hero_screen_image_url TEXT,
  ADD COLUMN IF NOT EXISTS hero_screen_video_url TEXT,
  ADD COLUMN IF NOT EXISTS hero_screen_title TEXT,
  ADD COLUMN IF NOT EXISTS hero_screen_text TEXT,
  ADD COLUMN IF NOT EXISTS featured_asset_type TEXT DEFAULT 'image',
  ADD COLUMN IF NOT EXISTS featured_asset_url TEXT,
  ADD COLUMN IF NOT EXISTS featured_asset_title TEXT,
  ADD COLUMN IF NOT EXISTS featured_asset_description TEXT;

CREATE TABLE IF NOT EXISTS public.city_screens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  screen_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  zone TEXT,
  location_label TEXT,
  size_class TEXT DEFAULT 'medium',
  tier_class TEXT DEFAULT 'premium',
  screen_width INTEGER,
  screen_height INTEGER,
  max_resolution TEXT,
  max_slots INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT city_screens_size_class_check CHECK (size_class IN ('small', 'medium', 'large', 'xl')),
  CONSTRAINT city_screens_tier_class_check CHECK (tier_class IN ('premium', 'elite'))
);

CREATE TABLE IF NOT EXISTS public.booth_screen_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booth_id UUID NOT NULL REFERENCES public.booths(id) ON DELETE CASCADE,
  city_screen_id UUID NOT NULL REFERENCES public.city_screens(id) ON DELETE CASCADE,
  content_type TEXT DEFAULT 'image',
  image_url TEXT,
  video_url TEXT,
  title TEXT,
  text TEXT,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT booth_screen_reservations_content_type_check CHECK (content_type IN ('image', 'video', 'mixed'))
);

CREATE INDEX IF NOT EXISTS booth_screen_reservations_booth_id_idx
  ON public.booth_screen_reservations (booth_id);

CREATE INDEX IF NOT EXISTS booth_screen_reservations_city_screen_id_idx
  ON public.booth_screen_reservations (city_screen_id);

CREATE INDEX IF NOT EXISTS booth_screen_reservations_active_window_idx
  ON public.booth_screen_reservations (is_active, starts_at, ends_at);

ALTER TABLE public.city_screens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booth_screen_reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read city screens" ON public.city_screens;
CREATE POLICY "Public read city screens"
  ON public.city_screens
  FOR SELECT
  USING (is_active = true);

DROP POLICY IF EXISTS "Public read booth screen reservations" ON public.booth_screen_reservations;
CREATE POLICY "Public read booth screen reservations"
  ON public.booth_screen_reservations
  FOR SELECT
  USING (is_active = true);

DROP POLICY IF EXISTS "Service-only booth screen reservations writes" ON public.booth_screen_reservations;
CREATE POLICY "Service-only booth screen reservations writes"
  ON public.booth_screen_reservations
  FOR ALL
  USING (false)
  WITH CHECK (false);

INSERT INTO public.city_screens (
  screen_code,
  name,
  zone,
  location_label,
  size_class,
  tier_class,
  screen_width,
  screen_height,
  max_resolution,
  max_slots
)
VALUES
  (
    'BLVD-HERO-01',
    'Boulevard Hero Screen',
    'arrival-boulevard',
    'Main arrival boulevard hero wall',
    'xl',
    'elite',
    7680,
    4320,
    '8k',
    1
  ),
  (
    'PLAZA-PREMIUM-01',
    'Plaza Premium Screen',
    'central-plaza',
    'Central plaza large-format display',
    'large',
    'premium',
    3840,
    2160,
    '4k',
    1
  ),
  (
    'PLAZA-PREMIUM-02',
    'Plaza Premium Screen B',
    'central-plaza',
    'Central plaza secondary display',
    'large',
    'premium',
    3840,
    2160,
    '4k',
    1
  )
ON CONFLICT (screen_code) DO NOTHING;



-- SOURCE: 20260418090000_expo_lead_ops.sql
CREATE TABLE IF NOT EXISTS public.expo_lead_ops (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_request_id UUID NOT NULL REFERENCES public.service_requests(id) ON DELETE CASCADE,
    ops_notes TEXT,
    follow_up_at TIMESTAMPTZ,
    updated_by_user_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (service_request_id)
);

CREATE INDEX IF NOT EXISTS expo_lead_ops_service_request_idx
    ON public.expo_lead_ops(service_request_id);

ALTER TABLE public.expo_lead_ops ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Expo lead ops denied by default" ON public.expo_lead_ops;
CREATE POLICY "Expo lead ops denied by default"
    ON public.expo_lead_ops
    FOR ALL
    USING (false)
    WITH CHECK (false);



-- SOURCE: 20260531113000_expo_booth_managed_screen_content_compat.sql
-- Adds managed screen-content compatibility fields to the legacy expo_booth table.
-- Staging currently falls back to public.expo_booth when public.expo_booths is absent.
-- The Expo Admin save flow stores sanitized screen payloads in assets_3d.screen_content.

ALTER TABLE public.expo_booth
  ADD COLUMN IF NOT EXISTS company_name TEXT,
  ADD COLUMN IF NOT EXISTS industry_sector TEXT,
  ADD COLUMN IF NOT EXISTS subscription_type TEXT DEFAULT 'basic',
  ADD COLUMN IF NOT EXISTS assets_3d JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS contact_info JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS district TEXT,
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

UPDATE public.expo_booth
SET
  company_name = COALESCE(company_name, title),
  subscription_type = COALESCE(subscription_type, plan_type, 'basic'),
  status = COALESCE(status, 'active'),
  assets_3d = COALESCE(assets_3d, '{}'::jsonb),
  contact_info = COALESCE(contact_info, '{}'::jsonb),
  created_at = COALESCE(created_at, NOW()),
  updated_at = COALESCE(updated_at, NOW());

CREATE INDEX IF NOT EXISTS expo_booth_company_name_idx
  ON public.expo_booth (company_name);

CREATE INDEX IF NOT EXISTS expo_booth_status_idx
  ON public.expo_booth (status);



-- SOURCE: 20260603193000_expo_sponsor_assets_storage.sql
-- Creates the public-read Expo sponsor asset storage bucket.
-- Client uploads are limited to authenticated users and their own sponsor-assets/<auth.uid()> folder.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'expo_assets',
  'expo_assets',
  true,
  83886080,
  array[
    'application/octet-stream',
    'application/pdf',
    'image/gif',
    'image/jpeg',
    'image/png',
    'image/webp',
    'model/gltf+json',
    'model/gltf-binary',
    'video/mp4',
    'video/webm'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "expo_assets_public_read" on storage.objects;
create policy "expo_assets_public_read"
on storage.objects
for select
using (bucket_id = 'expo_assets');

drop policy if exists "expo_sponsor_assets_authenticated_insert" on storage.objects;
create policy "expo_sponsor_assets_authenticated_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'expo_assets'
  and (storage.foldername(name))[1] = 'sponsor-assets'
  and (storage.foldername(name))[2] = auth.uid()::text
);

drop policy if exists "expo_sponsor_assets_authenticated_update" on storage.objects;
create policy "expo_sponsor_assets_authenticated_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'expo_assets'
  and (storage.foldername(name))[1] = 'sponsor-assets'
  and (storage.foldername(name))[2] = auth.uid()::text
)
with check (
  bucket_id = 'expo_assets'
  and (storage.foldername(name))[1] = 'sponsor-assets'
  and (storage.foldername(name))[2] = auth.uid()::text
);

drop policy if exists "expo_sponsor_assets_authenticated_delete" on storage.objects;
create policy "expo_sponsor_assets_authenticated_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'expo_assets'
  and (storage.foldername(name))[1] = 'sponsor-assets'
  and (storage.foldername(name))[2] = auth.uid()::text
);



-- SOURCE: 20260604002000_booth_analytics_counter_compat.sql
-- Add counter-style booth analytics fields to the legacy event analytics table.
-- This keeps existing sponsor event rows intact while allowing the expo admin
-- dashboard to read per-booth visits/interactions/lead counts safely.

ALTER TABLE public.booth_analytics
  ADD COLUMN IF NOT EXISTS booth_id UUID,
  ADD COLUMN IF NOT EXISTS visits INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS interactions INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS leads_generated INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS booth_analytics_booth_id_unique_idx
  ON public.booth_analytics (booth_id)
  WHERE booth_id IS NOT NULL;



-- SOURCE: 20260604014500_expo_booth_publication_status.sql
-- Managed booth publication workflow.
-- Only `active` booths are eligible for public 3D scene screen-content merge.

DO $$
BEGIN
  IF to_regclass('public.expo_booths') IS NOT NULL THEN
    UPDATE public.expo_booths
    SET status = 'draft'
    WHERE status IS NULL
      OR status NOT IN ('draft', 'review', 'approved', 'active', 'rejected', 'archived');

    ALTER TABLE public.expo_booths
      ALTER COLUMN status SET DEFAULT 'draft';

    ALTER TABLE public.expo_booths
      DROP CONSTRAINT IF EXISTS expo_booths_status_check;

    ALTER TABLE public.expo_booths
      ADD CONSTRAINT expo_booths_status_check
      CHECK (status IN ('draft', 'review', 'approved', 'active', 'rejected', 'archived'));

    CREATE INDEX IF NOT EXISTS expo_booths_status_idx
      ON public.expo_booths (status);
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.expo_booth') IS NOT NULL THEN
    UPDATE public.expo_booth
    SET status = 'draft'
    WHERE status IS NULL
      OR status NOT IN ('draft', 'review', 'approved', 'active', 'rejected', 'archived');

    ALTER TABLE public.expo_booth
      ALTER COLUMN status SET DEFAULT 'draft';

    ALTER TABLE public.expo_booth
      DROP CONSTRAINT IF EXISTS expo_booth_status_check;

    ALTER TABLE public.expo_booth
      ADD CONSTRAINT expo_booth_status_check
      CHECK (status IN ('draft', 'review', 'approved', 'active', 'rejected', 'archived'));

    CREATE INDEX IF NOT EXISTS expo_booth_status_idx
      ON public.expo_booth (status);
  END IF;
END $$;



-- SOURCE: 20260609040000_modular_home_quote_requests.sql
CREATE TABLE IF NOT EXISTS public.modular_home_quote_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'quoted', 'won', 'lost')),
  internal_note TEXT,
  requester JSONB NOT NULL DEFAULT '{}'::jsonb,
  project JSONB NOT NULL DEFAULT '{}'::jsonb,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  estimate JSONB NOT NULL DEFAULT '{}'::jsonb,
  consent JSONB NOT NULL DEFAULT '{}'::jsonb,
  attribution JSONB NOT NULL DEFAULT '{}'::jsonb,
  source JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS modular_home_quote_requests_created_at_idx
  ON public.modular_home_quote_requests (created_at DESC);

CREATE INDEX IF NOT EXISTS modular_home_quote_requests_status_idx
  ON public.modular_home_quote_requests (status);

CREATE INDEX IF NOT EXISTS modular_home_quote_requests_project_product_idx
  ON public.modular_home_quote_requests ((project->>'productId'));

CREATE INDEX IF NOT EXISTS modular_home_quote_requests_requester_email_idx
  ON public.modular_home_quote_requests ((lower(requester->>'email')));

CREATE OR REPLACE FUNCTION public.set_modular_home_quote_requests_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_modular_home_quote_requests_updated_at
  ON public.modular_home_quote_requests;

CREATE TRIGGER set_modular_home_quote_requests_updated_at
  BEFORE UPDATE ON public.modular_home_quote_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.set_modular_home_quote_requests_updated_at();

ALTER TABLE public.modular_home_quote_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Modular home quote requests denied by default"
  ON public.modular_home_quote_requests;

CREATE POLICY "Modular home quote requests denied by default"
  ON public.modular_home_quote_requests
  FOR ALL
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE public.modular_home_quote_requests
  IS 'Staging-gated Modular Home quote requests. Backend service role inserts/selects; anon/auth clients have no direct table access.';



-- SOURCE: 20260609164000_modular_home_quote_sales_ops.sql
ALTER TABLE public.modular_home_quote_requests
  ADD COLUMN IF NOT EXISTS consultant_assignment TEXT,
  ADD COLUMN IF NOT EXISTS follow_up_required BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS status_history JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.modular_home_quote_requests.consultant_assignment
  IS 'Admin-only sales operations placeholder for consultant assignment.';

COMMENT ON COLUMN public.modular_home_quote_requests.follow_up_required
  IS 'Admin-only sales operations flag indicating manual follow-up is required.';

COMMENT ON COLUMN public.modular_home_quote_requests.status_history
  IS 'Admin-only status history entries for Modular Home quote review workflow.';



-- SOURCE: 20260618113000_expo_review_media_storage.sql
-- Creates a private review-only sponsor media bucket.
-- Public sponsor scene media must not be uploaded here directly.
-- Backend service-role access manages uploads for review workflow.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'expo_review_media',
  'expo_review_media',
  false,
  26214400,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;



-- SOURCE: 20260618194500_expo_public_scene_select_grants.sql
-- Grant read access for the public Expo scene contract.
-- This keeps /api/expo/scene public-readonly without touching private review-media storage.

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT ON TABLE public.sectors TO anon, authenticated, service_role;
GRANT SELECT ON TABLE public.companies TO anon, authenticated, service_role;
GRANT SELECT ON TABLE public.booths TO anon, authenticated, service_role;



-- SOURCE: 20260618195500_expo_booths_service_role_privileges.sql
-- Staging data-plane fix for controlled sponsor media review mutation.
-- The backend service-role client needs to read and update public.expo_booths
-- so managed booth lookup and media-review metadata updates can run against
-- the approved disposable staging fixture.

GRANT SELECT, UPDATE ON TABLE public.expo_booths TO service_role;



-- SOURCE: 20260619000000_expo_booths_company_id_and_insert_privileges.sql
-- Staging managed-booth fixture provisioning support.
-- Adds the missing managed-booth company linkage and allows the backend
-- service-role client to create disposable staging fixtures when explicitly
-- requested by an operator-confirmed provisioning script.

ALTER TABLE public.expo_booths
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;

GRANT INSERT ON TABLE public.expo_booths TO service_role;



-- SOURCE: 20260619002000_service_role_update_companies_for_expo_review.sql
-- Staging-only minimal grant for controlled sponsor media review promotion.
-- Service-role promotion needs to update public.companies.logo_url after an approved
-- review upload is explicitly promoted. Keep this narrow to the backend service role.

GRANT UPDATE ON TABLE public.companies TO service_role;



-- SOURCE: 20260619004000_user_profiles_authenticated_select.sql
-- Allow authenticated Supabase users to read their own profile-linked data.
-- This keeps the existing company/profile bootstrap flow from failing during
-- authenticated scene and dashboard reads that resolve ownership through
-- public.user_profiles.

GRANT SELECT ON TABLE public.user_profiles TO authenticated;



-- SOURCE: 20260619012000_user_profiles_bootstrap_service_role_grants.sql
-- Minimal staging-safe grants for the protected auth/profile bootstrap path.
-- The backend bootstrap controller uses the Supabase service-role client to
-- read, create, and repair the authenticated user's profile/company records.
-- Keep this narrow to the backend service role only.

GRANT SELECT, INSERT, UPDATE ON TABLE public.user_profiles TO service_role;
GRANT INSERT ON TABLE public.companies TO service_role;



-- SOURCE: 20260620000000_modular_home_quote_requests_service_role_privileges.sql
-- Staging-safe privilege fix for Modular Home quote submit/admin follow-through.
-- The backend service-role client needs table privileges on the existing
-- quote request table so public submission, admin review, and smoke cleanup
-- can operate without broadening anon/auth access.

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.modular_home_quote_requests TO service_role;



-- SOURCE: 20260630170000_billing_stripe_checkout.sql
-- WP-B: Stripe checkout/session accounting.
-- All direct client access remains denied; backend service role writes these rows.

ALTER TABLE public.invoices
ADD COLUMN IF NOT EXISTS stripe_session_id TEXT,
ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT,
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'eur',
ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.billing_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    product_kind TEXT NOT NULL CHECK (product_kind IN ('plan', 'credits')),
    product_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('checkout_started', 'payment_completed', 'payment_failed', 'refunded')),
    amount_cents INTEGER,
    currency TEXT NOT NULL DEFAULT 'eur',
    stripe_session_id TEXT NOT NULL UNIQUE,
    stripe_payment_intent_id TEXT,
    stripe_customer_id TEXT,
    stripe_checkout_url TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.billing_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "billing_payments_default_deny" ON public.billing_payments;
CREATE POLICY "billing_payments_default_deny"
ON public.billing_payments
FOR ALL
USING (false)
WITH CHECK (false);

REVOKE ALL ON TABLE public.billing_payments FROM anon, authenticated, public;
GRANT SELECT, INSERT, UPDATE ON TABLE public.billing_payments TO service_role;

REVOKE ALL ON TABLE public.invoices FROM anon, authenticated, public;
GRANT SELECT, INSERT, UPDATE ON TABLE public.invoices TO service_role;



-- SOURCE: 20260630183000_booth_slot_marketplace.sql
-- WP-C: self-serve sponsor booth slot reservations.
-- Direct client access remains denied; availability/reservation writes flow through the backend.

CREATE TABLE IF NOT EXISTS public.booth_slot_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id TEXT NOT NULL,
  user_id UUID,
  user_email TEXT,
  company_name TEXT NOT NULL,
  contact_email TEXT,
  website TEXT,
  status TEXT NOT NULL DEFAULT 'held',
  commercial_tier TEXT NOT NULL,
  screen_class TEXT NOT NULL,
  booth_type TEXT NOT NULL,
  sponsor_tier TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'eur',
  stripe_session_id TEXT UNIQUE,
  company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
  booth_id UUID REFERENCES public.booths(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ NOT NULL,
  paid_at TIMESTAMPTZ,
  assigned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT booth_slot_reservations_status_check
    CHECK (status IN ('held', 'checkout_started', 'assigned', 'expired', 'cancelled', 'payment_failed')),
  CONSTRAINT booth_slot_reservations_tier_check
    CHECK (commercial_tier IN ('common', 'premium', 'elite', 'hero')),
  CONSTRAINT booth_slot_reservations_screen_class_check
    CHECK (screen_class IN ('support', 'presentation', 'large-format', 'landmark')),
  CONSTRAINT booth_slot_reservations_booth_type_check
    CHECK (booth_type IN ('standard', 'premium', 'hero')),
  CONSTRAINT booth_slot_reservations_sponsor_tier_check
    CHECK (sponsor_tier IN ('standard', 'bronze', 'silver', 'gold', 'platinum', 'hero')),
  CONSTRAINT booth_slot_reservations_amount_check
    CHECK (amount_cents > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS booth_slot_reservations_active_slot_idx
  ON public.booth_slot_reservations (slot_id)
  WHERE status IN ('held', 'checkout_started', 'assigned');

CREATE INDEX IF NOT EXISTS booth_slot_reservations_user_status_idx
  ON public.booth_slot_reservations (user_id, status);

CREATE INDEX IF NOT EXISTS booth_slot_reservations_status_expires_idx
  ON public.booth_slot_reservations (status, expires_at);

ALTER TABLE public.booth_slot_reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "booth_slot_reservations_default_deny" ON public.booth_slot_reservations;
CREATE POLICY "booth_slot_reservations_default_deny"
  ON public.booth_slot_reservations
  FOR ALL
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE public.booth_slot_reservations FROM anon, authenticated, public;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.booth_slot_reservations TO service_role;

ALTER TABLE public.booths
  ADD COLUMN IF NOT EXISTS slot_id TEXT,
  ADD COLUMN IF NOT EXISTS marketplace_reservation_id UUID REFERENCES public.booth_slot_reservations(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS booths_slot_id_unique_idx
  ON public.booths (slot_id)
  WHERE slot_id IS NOT NULL;

ALTER TABLE public.billing_payments
  DROP CONSTRAINT IF EXISTS billing_payments_product_kind_check;

ALTER TABLE public.billing_payments
  ADD CONSTRAINT billing_payments_product_kind_check
  CHECK (product_kind IN ('plan', 'credits', 'booth-slot'));



-- SOURCE: 20260701194000_booth_slot_marketplace_service_role_booth_grants.sql
-- WP-C follow-up: paid booth-slot finalization writes into the release scene booths table.
-- Direct client access remains denied; these grants are only for backend service-role writes.

GRANT SELECT, INSERT, UPDATE ON TABLE public.booths TO service_role;



-- SOURCE: 20260702100000_public_lead_abuse_controls.sql
-- Race-resistant duplicate suppression and PII-safe submission provenance for
-- the public Expo and calculator lead endpoints.

ALTER TABLE public.service_requests
  ADD COLUMN IF NOT EXISTS submission_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS submission_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS submission_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS submission_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS service_requests_submission_fingerprint_unique
  ON public.service_requests (submission_fingerprint)
  WHERE submission_fingerprint IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS leads_submission_fingerprint_unique
  ON public.leads (submission_fingerprint)
  WHERE submission_fingerprint IS NOT NULL;

COMMENT ON COLUMN public.service_requests.submission_metadata IS
  'PII-safe request provenance. Raw IP addresses, emails, query strings, and user-agent values are excluded.';

COMMENT ON COLUMN public.leads.submission_metadata IS
  'PII-safe request provenance. Raw IP addresses, emails, query strings, and user-agent values are excluded.';



-- SOURCE: 20260704160000_expo_community_content.sql
-- Persistent, moderated community content for the sponsor expo city board.
-- The public product reads and writes through backend-server only; direct client access stays closed.

create extension if not exists pgcrypto;

create table if not exists public.expo_community_entries (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('message', 'advert', 'voice')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'removed')),
  title text not null check (char_length(title) between 1 and 48),
  body text not null check (char_length(body) between 1 and 240),
  author_label text not null check (char_length(author_label) between 1 and 48),
  created_by uuid references auth.users(id) on delete set null,
  moderated_by uuid references auth.users(id) on delete set null,
  moderated_at timestamptz,
  audio_content_type text check (
    audio_content_type is null
    or audio_content_type in ('audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg')
  ),
  audio_bytes_base64 text check (
    audio_bytes_base64 is null
    or char_length(audio_bytes_base64) <= 1100000
  ),
  expires_at timestamptz,
  report_count integer not null default 0 check (report_count >= 0),
  reported_at timestamptz,
  removal_reason text check (removal_reason is null or char_length(removal_reason) <= 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expo_community_voice_has_audio check (
    kind <> 'voice'
    or (audio_content_type is not null and audio_bytes_base64 is not null)
  )
);

create table if not exists public.expo_community_graffiti (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'removed')),
  mark_text text not null default '' check (char_length(mark_text) <= 12),
  color text not null default '#22d3ee' check (color ~ '^#[0-9a-fA-F]{6}$'),
  logo_url text,
  wall_slot integer not null default 0 check (wall_slot between 0 and 47),
  placement_x numeric(8, 3),
  placement_y numeric(8, 3),
  placement_z numeric(8, 3),
  placement_rotation_y numeric(7, 4),
  placement_normal_x numeric(6, 4),
  placement_normal_y numeric(6, 4),
  placement_normal_z numeric(6, 4),
  placement_host_id text check (placement_host_id is null or char_length(placement_host_id) <= 80),
  placement_surface_label text check (placement_surface_label is null or char_length(placement_surface_label) <= 32),
  author_label text not null check (char_length(author_label) between 1 and 48),
  created_by uuid references auth.users(id) on delete set null,
  moderated_by uuid references auth.users(id) on delete set null,
  moderated_at timestamptz,
  expires_at timestamptz,
  report_count integer not null default 0 check (report_count >= 0),
  reported_at timestamptz,
  removal_reason text check (removal_reason is null or char_length(removal_reason) <= 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expo_community_graffiti_has_mark check (
    char_length(mark_text) > 0
    or logo_url is not null
  )
);

alter table public.expo_community_graffiti
  add column if not exists placement_x numeric(8, 3),
  add column if not exists placement_y numeric(8, 3),
  add column if not exists placement_z numeric(8, 3),
  add column if not exists placement_rotation_y numeric(7, 4),
  add column if not exists placement_normal_x numeric(6, 4),
  add column if not exists placement_normal_y numeric(6, 4),
  add column if not exists placement_normal_z numeric(6, 4),
  add column if not exists placement_host_id text,
  add column if not exists placement_surface_label text;

create table if not exists public.expo_community_reports (
  id uuid primary key default gen_random_uuid(),
  item_type text not null check (item_type in ('entry', 'graffiti')),
  item_id uuid not null,
  reason text not null check (reason in ('other', 'spam', 'unsafe', 'wrong-place')),
  detail text check (detail is null or char_length(detail) <= 160),
  reporter_id uuid references auth.users(id) on delete set null,
  reporter_label text not null check (char_length(reporter_label) between 1 and 48),
  created_at timestamptz not null default now()
);

create table if not exists public.expo_community_audit_events (
  id uuid primary key default gen_random_uuid(),
  item_type text not null check (item_type in ('entry', 'graffiti')),
  item_id uuid not null,
  action text not null check (action in ('created', 'reported', 'approved', 'rejected', 'removed')),
  actor_label text not null check (char_length(actor_label) between 1 and 64),
  note text check (note is null or char_length(note) <= 160),
  created_at timestamptz not null default now()
);

create index if not exists expo_community_entries_status_created_at_idx
  on public.expo_community_entries (status, created_at desc);

create index if not exists expo_community_entries_created_by_created_at_idx
  on public.expo_community_entries (created_by, created_at desc);

create index if not exists expo_community_graffiti_status_created_at_idx
  on public.expo_community_graffiti (status, created_at desc);

create index if not exists expo_community_graffiti_created_by_created_at_idx
  on public.expo_community_graffiti (created_by, created_at desc);

create index if not exists expo_community_entries_expires_at_idx
  on public.expo_community_entries (expires_at);

create index if not exists expo_community_graffiti_expires_at_idx
  on public.expo_community_graffiti (expires_at);

create index if not exists expo_community_reports_item_idx
  on public.expo_community_reports (item_type, item_id, created_at desc);

create index if not exists expo_community_audit_events_item_idx
  on public.expo_community_audit_events (item_type, item_id, created_at desc);

alter table public.expo_community_entries enable row level security;
alter table public.expo_community_graffiti enable row level security;
alter table public.expo_community_reports enable row level security;
alter table public.expo_community_audit_events enable row level security;

revoke all on table public.expo_community_entries from anon, authenticated;
revoke all on table public.expo_community_graffiti from anon, authenticated;
revoke all on table public.expo_community_reports from anon, authenticated;
revoke all on table public.expo_community_audit_events from anon, authenticated;

grant select, insert, update, delete on table public.expo_community_entries to service_role;
grant select, insert, update, delete on table public.expo_community_graffiti to service_role;
grant select, insert, update, delete on table public.expo_community_reports to service_role;
grant select, insert, update, delete on table public.expo_community_audit_events to service_role;


-- Run only AFTER the historical migrations on a NEW, empty app project.
-- Legacy event analytics and the canonical booth counters share this table.
ALTER TABLE public.booth_analytics
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS sponsor_id text REFERENCES public.sponsors(id),
  ADD COLUMN IF NOT EXISTS event_type text,
  ADD COLUMN IF NOT EXISTS duration integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

DO $$
DECLARE fk record;
BEGIN
  FOR fk IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.booth_analytics'::regclass
      AND confrelid = 'public.expo_booths'::regclass AND contype = 'f'
  LOOP
    EXECUTE format('ALTER TABLE public.booth_analytics DROP CONSTRAINT %I', fk.conname);
  END LOOP;
END $$;
-- Counter IDs can refer to either public scene booths or managed expo_booths.
-- The later counter compatibility migration uses a plain UUID for that reason.

-- Fresh cloud projects no longer expose new tables automatically. Explicitly
-- expose only the browser reads; all business writes go through the API.
DO $$
DECLARE item record;
BEGIN
  FOR item IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', item.tablename);
  END LOOP;
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT ON public.sectors, public.companies, public.booths, public.cities TO anon, authenticated;
GRANT SELECT ON public.users, public.user_profiles TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Legacy migrations include privileged functions; keep them server-only.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
DO $$
DECLARE item record;
BEGIN
  FOR item IN
    SELECT p.oid::regprocedure AS signature FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', item.signature);
  END LOOP;
END $$;

-- Only published sponsors/booths belong in direct public reads.
DROP POLICY IF EXISTS "Public read companies" ON public.companies;
DROP POLICY IF EXISTS "company_access" ON public.companies;
DROP POLICY IF EXISTS "Active companies are viewable by everyone" ON public.companies;
CREATE POLICY fresh_active_companies ON public.companies FOR SELECT TO anon, authenticated
  USING (is_active = true);
DROP POLICY IF EXISTS "Public read booths" ON public.booths;
DROP POLICY IF EXISTS "Booths are viewable by everyone" ON public.booths;
CREATE POLICY fresh_active_company_booths ON public.booths FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.is_active = true));

-- RLS does not require an ownership predicate for the public scene sectors.
-- Users/profile policies from the historical chain remain owner-scoped.


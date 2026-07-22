-- Obsidian/앱 투자노트와 자동메모리 저장소

CREATE TABLE IF NOT EXISTS public.user_knowledge_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    vault_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    title TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'obsidian',
    content TEXT NOT NULL DEFAULT '',
    content_hash TEXT NOT NULL,
    frontmatter JSONB NOT NULL DEFAULT '{}'::jsonb,
    sync_status TEXT NOT NULL DEFAULT 'SYNCED',
    modified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT user_knowledge_notes_source_check CHECK (source IN ('obsidian', 'app')),
    CONSTRAINT user_knowledge_notes_sync_status_check CHECK (sync_status IN ('SYNCED', 'FAILED')),
    CONSTRAINT user_knowledge_notes_unique_file UNIQUE (user_id, vault_name, file_path)
);

CREATE TABLE IF NOT EXISTS public.user_memory_facts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    memory_type TEXT NOT NULL,
    content TEXT NOT NULL,
    symbol TEXT,
    confidence NUMERIC NOT NULL DEFAULT 0.5,
    evidence_count INTEGER NOT NULL DEFAULT 1,
    source TEXT NOT NULL DEFAULT 'behavioral_event',
    is_active BOOLEAN NOT NULL DEFAULT true,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT user_memory_facts_confidence_check CHECK (confidence >= 0 AND confidence <= 1),
    CONSTRAINT user_memory_facts_evidence_count_check CHECK (evidence_count >= 1),
    CONSTRAINT user_memory_facts_type_check CHECK (
        memory_type IN ('favorite_symbol', 'repeated_mistake', 'risk_preference', 'answer_preference', 'investment_principle')
    )
);

CREATE INDEX IF NOT EXISTS idx_user_knowledge_notes_user_updated
    ON public.user_knowledge_notes(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_knowledge_notes_user_hash
    ON public.user_knowledge_notes(user_id, content_hash);

CREATE INDEX IF NOT EXISTS idx_user_memory_facts_user_active_type
    ON public.user_memory_facts(user_id, is_active, memory_type);

ALTER TABLE public.user_knowledge_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_memory_facts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_knowledge_notes_owner_select" ON public.user_knowledge_notes;
CREATE POLICY "user_knowledge_notes_owner_select"
    ON public.user_knowledge_notes
    FOR SELECT
    TO authenticated
    USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "user_knowledge_notes_owner_insert" ON public.user_knowledge_notes;
CREATE POLICY "user_knowledge_notes_owner_insert"
    ON public.user_knowledge_notes
    FOR INSERT
    TO authenticated
    WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "user_knowledge_notes_owner_update" ON public.user_knowledge_notes;
CREATE POLICY "user_knowledge_notes_owner_update"
    ON public.user_knowledge_notes
    FOR UPDATE
    TO authenticated
    USING ((select auth.uid()) = user_id)
    WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "user_memory_facts_owner_select" ON public.user_memory_facts;
CREATE POLICY "user_memory_facts_owner_select"
    ON public.user_memory_facts
    FOR SELECT
    TO authenticated
    USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "user_memory_facts_owner_insert" ON public.user_memory_facts;
CREATE POLICY "user_memory_facts_owner_insert"
    ON public.user_memory_facts
    FOR INSERT
    TO authenticated
    WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "user_memory_facts_owner_update" ON public.user_memory_facts;
CREATE POLICY "user_memory_facts_owner_update"
    ON public.user_memory_facts
    FOR UPDATE
    TO authenticated
    USING ((select auth.uid()) = user_id)
    WITH CHECK ((select auth.uid()) = user_id);;

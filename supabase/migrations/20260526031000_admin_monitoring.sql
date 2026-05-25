-- Create PUBG API Rate Limit status table
CREATE TABLE IF NOT EXISTS public.pubg_api_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    api_limit INT NOT NULL,
    remaining INT NOT NULL,
    reset_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create AI API Usage logs table
CREATE TABLE IF NOT EXISTS public.ai_usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    model_name VARCHAR(100) NOT NULL,
    prompt_tokens INT NOT NULL,
    completion_tokens INT NOT NULL,
    cost_usd NUMERIC(10, 6) NOT NULL,
    analysis_type VARCHAR(50) NOT NULL, -- 'analyze' | 'summary'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS Enable (without policy, meaning only service_role client has access)
ALTER TABLE public.pubg_api_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;

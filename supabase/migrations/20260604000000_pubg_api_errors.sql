-- Create PUBG API Error Logs table for partner reporting
CREATE TABLE IF NOT EXISTS public.pubg_api_errors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route VARCHAR(255) NOT NULL,
    status INT NOT NULL,
    message TEXT NOT NULL,
    detail TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS for data protection (accessible only by service_role Admin client)
ALTER TABLE public.pubg_api_errors ENABLE ROW LEVEL SECURITY;

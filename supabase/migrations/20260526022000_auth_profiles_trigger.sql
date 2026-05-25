-- Create trigger function for handling new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, nickname, avatar_url, role)
  VALUES (
    new.id,
    COALESCE(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'user_name',
      new.raw_user_meta_data->>'name',
      new.raw_user_meta_data->>'nickname',
      'User'
    ),
    COALESCE(
      new.raw_user_meta_data->>'avatar_url',
      new.raw_user_meta_data->>'avatar'
    ),
    'user'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on auth.users
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill profile data for existing auth users who don't have a profile yet
INSERT INTO public.profiles (id, nickname, avatar_url, role)
SELECT 
  id,
  COALESCE(
    raw_user_meta_data->>'full_name',
    raw_user_meta_data->>'user_name',
    raw_user_meta_data->>'name',
    raw_user_meta_data->>'nickname',
    'User'
  ),
  COALESCE(raw_user_meta_data->>'avatar_url', raw_user_meta_data->>'avatar'),
  'user'
FROM auth.users
ON CONFLICT (id) DO NOTHING;

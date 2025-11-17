import { supabase } from '@/lib/supabase';

// API key authentication middleware
export async function authenticateApiKey(request: Request) {
  const apiKey = request.headers.get('x-api-key');
  
  if (!apiKey) {
    return { authenticated: false, error: 'API key is required' };
  }
  
  // Check if API key exists in the database
  const { data, error } = await supabase
    .from('tbl_open_api_keys')
    .select('*')
    .eq('api_key', apiKey)
    .eq('is_active', true)
    .single();
  
  if (error || !data) {
    return { authenticated: false, error: 'Invalid API key' };
  }
  
  return { authenticated: true, userId: data.user_id };
}

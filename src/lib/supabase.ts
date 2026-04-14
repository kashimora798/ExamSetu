import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kejfqjqreaqtyummufiu.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtlamZxanFyZWFxdHl1bW11Zml1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3NjE5NTMsImV4cCI6MjA5MDMzNzk1M30.KPVspMz8e5ar8rvoGT5WZ8C8KhvVORrcLjRkyrAwEuw';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

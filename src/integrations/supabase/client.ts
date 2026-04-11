import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://tvmpuswuxrpxayktmgwf.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR2bXB1c3d1eHJweGF5a3RtZ3dmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5MzM5NTMsImV4cCI6MjA5MTUwOTk1M30.sFo13D7dxGlRAO-zr2c3_qC4dzTZAVo8DWZ9fO_jNUw";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

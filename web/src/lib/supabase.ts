import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://fygjocohiiilreitnsnl.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_9dPhOltcFFz602ngRqwMnA_gOJtofVQ";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

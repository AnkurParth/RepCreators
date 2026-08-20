import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://eqthgnhrwojomuekpqxd.supabase.co";
const supabaseAnonKey = "sb_publishable_YWBMkT11ZEqUnjITeZRfPA_CJ24gQLq";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
import { createClient } from "@supabase/supabase-js"
import dotenv from "dotenv"
dotenv.config({ path: ".env.local" })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function searchUser(phone: string) {
  // 模糊搜索
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .ilike("phone", `%${phone}%`)
    .limit(10)

  console.log("Profiles search result:", JSON.stringify({ data, error }, null, 2))
}

const phone = process.argv[2] || "13857793937"
searchUser(phone)
"use server";

import { redirect } from "next/navigation";
import { getCurrentOrg } from "@/lib/org";

export async function deleteConversation(id: string) {
  const { supabase } = await getCurrentOrg();
  await supabase.from("conversations").delete().eq("id", id);
  redirect("/assistant");
}

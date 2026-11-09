"use server";

import { revalidatePath } from "next/cache";
import { getCurrentOrg } from "@/lib/org";

export async function setEventStatus(id: string, status: "ignored" | "active") {
  const { supabase } = await getCurrentOrg();
  await supabase.from("ical_events").update({ status }).eq("id", id);
  // alert terkait otomatis selesai saat sinkron berikutnya; tandai sekarang juga
  if (status === "ignored") {
    await supabase.from("alerts").update({ status: "resolved", resolved_at: new Date().toISOString() })
      .eq("type", "ical_unrecorded").eq("data->>event_id", id);
  }
  revalidatePath("/", "layout");
}

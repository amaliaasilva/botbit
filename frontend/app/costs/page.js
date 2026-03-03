import { redirect } from "next/navigation";

export default function CostsPage() {
  redirect("/settings?tab=costs");
}

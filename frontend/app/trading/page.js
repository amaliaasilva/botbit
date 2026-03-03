import { redirect } from "next/navigation";

export default function TradingPage() {
  redirect("/settings?tab=trading");
}

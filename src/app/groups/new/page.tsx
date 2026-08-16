import type { Metadata } from "next";
import { CreateGroupScreen } from "@/components/screens/create-group-screen";

export const metadata: Metadata = { title: "Create group" };

export default function NewGroupPage() {
  return <CreateGroupScreen />;
}

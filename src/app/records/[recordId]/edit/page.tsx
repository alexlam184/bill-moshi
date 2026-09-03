import { AddRecordScreen } from "@/components/screens/add-record-screen";

export default async function EditRecordPage({ params }: PageProps<"/records/[recordId]/edit">) {
  const { recordId } = await params;
  return <AddRecordScreen editingRecordId={recordId} />;
}

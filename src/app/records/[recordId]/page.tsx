import { RecordDetailsScreen } from "@/components/screens/record-details-screen";

export default async function RecordPage({ params }: PageProps<"/records/[recordId]">) {
  const { recordId } = await params;
  return <RecordDetailsScreen recordId={recordId} />;
}

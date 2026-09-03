import { RecurringPaymentDetailsScreen } from "@/components/screens/recurring-payments-screen";

export default async function RecurringPaymentPage({ params }: PageProps<"/myself/recurring/[paymentId]">) {
  const { paymentId } = await params;
  return <RecurringPaymentDetailsScreen paymentId={paymentId} />;
}

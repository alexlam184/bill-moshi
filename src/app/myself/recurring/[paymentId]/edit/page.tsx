import { RecurringPaymentFormScreen } from "@/components/screens/recurring-payment-form";

export default async function EditRecurringPaymentPage({ params }: PageProps<"/myself/recurring/[paymentId]/edit">) {
  const { paymentId } = await params;
  return <RecurringPaymentFormScreen paymentId={paymentId} />;
}

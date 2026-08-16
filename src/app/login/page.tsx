import { LoginScreen } from "@/components/screens/login-screen";

export default function LoginPage() {
  return <LoginScreen googleEnabled={Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET)} />;
}

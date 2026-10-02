import { AuthShell } from "@/components/AuthShell";
import { LoginForm } from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <AuthShell title="Welcome back" subtitle="Sign in to access your project boards.">
      <LoginForm />
      <p className="mt-6 text-center text-sm text-[var(--text-muted)]">
        New here?{" "}
        <a href="/register" className="font-semibold text-[var(--primary-blue)] hover:underline">
          Create an account
        </a>
      </p>
    </AuthShell>
  );
}

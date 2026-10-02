import { AuthShell } from "@/components/AuthShell";
import { RegisterForm } from "@/components/RegisterForm";

export default function RegisterPage() {
  return (
    <AuthShell title="Create your account" subtitle="Start with a sample board you can make your own.">
      <RegisterForm />
      <p className="mt-6 text-center text-sm text-[var(--text-muted)]">
        Already have an account?{" "}
        <a href="/login" className="font-semibold text-[var(--primary-blue)] hover:underline">
          Sign in
        </a>
      </p>
    </AuthShell>
  );
}

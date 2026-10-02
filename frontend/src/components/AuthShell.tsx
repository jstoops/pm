import type { ReactNode } from "react";
import { Columns3, FolderKanban, Sparkles, SquareKanban } from "lucide-react";

const features = [
  { icon: FolderKanban, text: "A board for every project, all in one workspace" },
  { icon: Columns3, text: "Columns you can add, rename and reorder to fit your process" },
  { icon: Sparkles, text: "An AI assistant that can create, edit and move cards" },
];

type AuthShellProps = {
  title: string;
  subtitle: string;
  children: ReactNode;
};

/** The split marketing and form layout shared by the sign-in and registration pages. */
export const AuthShell = ({ title, subtitle, children }: AuthShellProps) => (
  <main className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
    <section className="relative hidden overflow-hidden bg-[var(--navy-dark)] p-12 text-white lg:flex lg:flex-col">
      <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-[var(--primary-blue)]/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -left-24 h-96 w-96 rounded-full bg-[var(--secondary-purple)]/30 blur-3xl" />
      <div className="relative flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--accent-yellow)] text-[var(--navy-dark)]">
          <SquareKanban aria-hidden="true" size={22} strokeWidth={2.25} />
        </span>
        <span className="font-display text-xl font-semibold">Kanban Studio</span>
      </div>
      <div className="relative my-auto max-w-md">
        <p className="font-display text-4xl font-semibold leading-tight">Keep momentum visible.</p>
        <p className="mt-4 text-base leading-7 text-white/70">
          Focused boards for every project, from backlog to done.
        </p>
        <ul className="mt-10 space-y-4">
          {features.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-3 text-sm text-white/85">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white/10 text-[var(--accent-yellow)]">
                <Icon aria-hidden="true" size={16} />
              </span>
              {text}
            </li>
          ))}
        </ul>
      </div>
    </section>

    <section className="flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <span className="mb-8 flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--navy-dark)] text-[var(--accent-yellow)] lg:hidden">
          <SquareKanban aria-hidden="true" size={22} strokeWidth={2.25} />
        </span>
        <h1 className="font-display text-3xl font-semibold text-[var(--navy-dark)]">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{subtitle}</p>
        {children}
      </div>
    </section>
  </main>
);

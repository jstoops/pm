import clsx from "clsx";
import { useState } from "react";

type InlineTitleProps = {
  initialTitle: string;
  onRename: (title: string) => void;
  label: string;
  className?: string;
};

/**
 * A title edited in place and saved on blur or Enter. A blank or unchanged
 * value is restored without calling `onRename`. Key it by `initialTitle` so a
 * server-side rename resets the draft.
 */
export const InlineTitle = ({ initialTitle, onRename, label, className }: InlineTitleProps) => {
  const [title, setTitle] = useState(initialTitle);

  return (
    <input
      value={title}
      onChange={(event) => setTitle(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.currentTarget.blur();
        }
      }}
      onBlur={() => {
        const nextTitle = title.trim();
        if (!nextTitle || nextTitle === initialTitle) {
          setTitle(initialTitle);
          return;
        }
        onRename(nextTitle);
      }}
      className={clsx(
        "min-w-0 text-ellipsis rounded-md border border-transparent bg-transparent px-1 py-0.5 font-semibold text-[var(--navy-dark)] outline-none transition hover:border-[var(--stroke)] focus:border-[var(--primary-blue)] focus:bg-white",
        className
      )}
      aria-label={label}
    />
  );
};

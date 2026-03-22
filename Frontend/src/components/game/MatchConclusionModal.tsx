import type { ReactNode } from "react";

type MatchConclusionAction = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
};

type MatchConclusionModalProps = {
  isOpen: boolean;
  title: string;
  subtitle: string;
  detail?: string;
  eyebrow?: string;
  extraContent?: ReactNode;
  actions: MatchConclusionAction[];
};

function MatchConclusionModal({
  isOpen,
  title,
  subtitle,
  detail,
  eyebrow = "Match Concluded",
  extraContent,
  actions,
}: MatchConclusionModalProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/72 p-4 backdrop-blur-sm">
      <section className="w-full max-w-md rounded-[2rem] border border-[#5f5b53] bg-[#2f2e2b] p-7 text-center text-white shadow-2xl">
        <div className="inline-flex items-center justify-center rounded-full bg-[#b58863] px-4 py-1 text-xs font-bold uppercase tracking-[0.18em] text-white">
          {eyebrow}
        </div>
        <h2 className="mt-5 text-4xl font-extrabold">{title}</h2>
        <p className="mt-3 text-lg text-gray-200">{subtitle}</p>
        {detail ? <p className="mt-2 text-sm text-gray-300">{detail}</p> : null}
        {extraContent ? <div className="mt-6">{extraContent}</div> : null}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          {actions.map((action) => (
            <button
              key={action.label}
              onClick={action.onClick}
              disabled={action.disabled}
              className={action.className}
            >
              {action.label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

export default MatchConclusionModal;

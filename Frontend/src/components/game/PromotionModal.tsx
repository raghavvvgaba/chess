type PromotionChoice = {
  id: string;
  label: string;
  imageSrc: string;
};

type PromotionModalProps = {
  isOpen: boolean;
  choices: PromotionChoice[];
  onSelect: (choiceId: string) => void;
  onCancel: () => void;
  title?: string;
  description?: string;
};

function PromotionModal({
  isOpen,
  choices,
  onSelect,
  onCancel,
  title = "Choose Promotion",
  description = "Select the piece for your pawn promotion.",
}: PromotionModalProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <section className="w-full max-w-sm rounded-3xl border border-[#5f5b53] bg-[#2f2e2b] p-6 text-center text-white shadow-2xl">
        <h2 className="text-2xl font-extrabold">{title}</h2>
        <p className="mt-2 text-sm text-gray-300">{description}</p>

        <div className="mt-5 grid grid-cols-2 gap-3">
          {choices.map((choice) => (
            <button
              key={choice.id}
              onClick={() => onSelect(choice.id)}
              className="flex flex-col items-center gap-2 rounded-2xl border border-[#5f5b53] bg-[#3a3936] px-3 py-3 transition hover:bg-[#4a4945]"
            >
              <img className="h-10 w-10 object-contain" src={choice.imageSrc} alt={choice.label} />
              <span className="text-sm font-semibold">{choice.label}</span>
            </button>
          ))}
        </div>

        <button
          onClick={onCancel}
          className="mt-5 w-full rounded-2xl bg-[#3c3b38] px-5 py-2.5 font-bold text-white transition hover:bg-[#4a4945]"
        >
          Cancel
        </button>
      </section>
    </div>
  );
}

export default PromotionModal;

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface DeepWorkFlashcardsViewProps {
  onDismiss?: () => void;
}

interface Card {
  topic: string;
  question: string;
  answer: string;
  source: string;
}

const CARDS: Card[] = [
  {
    topic: "Cognitive endurance",
    question: "What is attention residue and how long does it linger?",
    answer: "Part of the mind stays stuck on a prior task after switching (Leroy, 2009), lingering up to 20 minutes. Batch communication into discrete daily windows to protect focus.",
    source: "Sophie Leroy (2009) / Cal Newport Deep Work",
  },
  {
    topic: "Neural rhythms",
    question: "How should deep work blocks be structured?",
    answer: "Cognitive stamina operates in 90-minute rhythmic cycles followed by 20 minutes of recovery. Cap true deep focus at four hours per day.",
    source: "Nathaniel Kleitman (BRAC) / Ericsson (1993)",
  },
  {
    topic: "Executive function",
    question: "What is the daily shutdown routine?",
    answer: "Review open loops, file context notes, and pronounce shutdown complete to reset working memory and prevent Zeigarnik effect loops.",
    source: "Bluma Zeigarnik / Cal Newport",
  },
];

export function DeepWorkFlashcardsView({ onDismiss }: DeepWorkFlashcardsViewProps) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState<Record<number, boolean>>({});

  const card = CARDS[index];
  const isKnown = Boolean(known[index]);

  const toggleKnown = () => {
    setKnown((prev) => {
      const next = { ...prev };
      if (next[index]) delete next[index];
      else next[index] = true;
      return next;
    });
  };

  const go = (dir: number) => {
    setFlipped(false);
    setIndex((i) => (i + dir + CARDS.length) % CARDS.length);
  };

  return (
    <div className="flex h-full w-full max-w-2xl flex-col justify-between p-8 font-sans text-foreground select-none">
      <div className="flex flex-col gap-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold">Deep work flashcards</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {index + 1} of {CARDS.length} · {Object.keys(known).length} marked known · {card.topic}
            </p>
          </div>
          {onDismiss && (
            <Button variant="ghost" size="sm" onClick={onDismiss}>
              Close
            </Button>
          )}
        </div>

        <div
          role="button"
          tabIndex={0}
          onClick={() => setFlipped(!flipped)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setFlipped(!flipped);
            }
          }}
          className="flex min-h-[220px] flex-col justify-between rounded-lg bg-card p-6 cursor-pointer hover:bg-card/80 transition-colors"
        >
          <div>
            <div className="text-xs text-muted-foreground">{flipped ? "Answer" : "Question"}</div>
            <div className="mt-3 text-lg font-medium leading-relaxed">
              {flipped ? card.answer : card.question}
            </div>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground mt-4">
            <span>{card.source}</span>
            <span className="text-primary">{flipped ? "Click to show question" : "Click to reveal answer"}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-6">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => go(-1)}>
            Previous
          </Button>
          <Button variant="outline" size="sm" onClick={() => go(1)}>
            Next
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={isKnown ? "default" : "outline"}
            size="sm"
            onClick={toggleKnown}
          >
            {isKnown ? "Marked known" : "Mark known"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setFlipped(!flipped)}>
            {flipped ? "Question" : "Answer"}
          </Button>
        </div>
      </div>
    </div>
  );
}

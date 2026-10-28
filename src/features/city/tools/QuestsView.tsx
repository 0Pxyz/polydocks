import { useState } from "react";
import { CheckCircle2, Circle, Flame, Award, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useProfileStore } from "@/lib/store/useProfileStore";
import type { CityQuestItem } from "../types";

interface QuestsViewProps {
  quests: CityQuestItem[];
  cityName: string;
  onToggleQuest?: (questId: string) => CityQuestItem | undefined;
}

export function QuestsView({ quests, cityName, onToggleQuest }: QuestsViewProps) {
  const { completeQuest } = useProfileStore();
  const [completedNotification, setCompletedNotification] = useState<string | null>(null);

  const handleQuestToggle = (quest: CityQuestItem) => {
    const updated = onToggleQuest?.(quest.id);
    if (updated?.completed) {
      completeQuest(quest.id, quest.xpReward);
      setCompletedNotification(`+${quest.xpReward} XP Earned!`);
      setTimeout(() => setCompletedNotification(null), 3000);
    }
  };

  const completedCount = quests.filter((q) => q.completed).length;

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="font-display text-lg font-bold text-foreground flex items-center gap-2">
            <Award className="w-4 h-4 text-primary" />
            Learning Quests & Mastery Challenges
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Complete active learning challenges in {cityName} to level up and extend your streak.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {completedNotification && (
            <Badge className="bg-[var(--accent-lime)] text-black font-mono font-bold animate-bounce text-xs">
              <Sparkles className="w-3 h-3 mr-1" />
              {completedNotification}
            </Badge>
          )}

          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-card border border-border text-xs font-mono">
            <span className="text-muted-foreground">Mastery:</span>
            <span className="text-primary font-bold">
              {completedCount} / {quests.length} Done
            </span>
          </div>
        </div>
      </div>

      {/* Quest list */}
      <div className="flex flex-col gap-3">
        {quests.map((quest) => (
          <div
            key={quest.id}
            className={`p-4 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
              quest.completed
                ? "bg-secondary/40 border-primary/30 opacity-80"
                : "bg-card border-border hover:border-primary/40"
            }`}
          >
            <div className="flex items-start gap-3">
              <button
                type="button"
                onClick={() => handleQuestToggle(quest)}
                className="mt-0.5 text-muted-foreground hover:text-primary transition-colors cursor-pointer focus:outline-none"
              >
                {quest.completed ? (
                  <CheckCircle2 className="w-5 h-5 text-primary" />
                ) : (
                  <Circle className="w-5 h-5 text-muted-foreground hover:text-primary" />
                )}
              </button>

              <div>
                <h4
                  className={`text-sm font-semibold transition-colors ${
                    quest.completed
                      ? "line-through text-muted-foreground"
                      : "text-foreground"
                  }`}
                >
                  {quest.title}
                </h4>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  {quest.description}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
              <span className="text-xs font-mono font-bold text-[var(--accent-lime)] bg-[var(--accent-lime)]/10 px-2.5 py-1 rounded-md border border-[var(--accent-lime)]/20 flex items-center gap-1">
                <Flame className="w-3 h-3 fill-[var(--accent-lime)]" />
                +{quest.xpReward} XP
              </span>

              <Button
                size="sm"
                variant={quest.completed ? "outline" : "default"}
                onClick={() => handleQuestToggle(quest)}
                className="h-8 text-xs"
              >
                {quest.completed ? "Mark Incomplete" : "Complete Quest"}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

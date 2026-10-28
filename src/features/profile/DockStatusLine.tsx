import { useState, useEffect, useRef } from "react";
import { Flame } from "@phosphor-icons/react";
import { motion, AnimatePresence } from "motion/react";
import { useProfileStore } from "@/lib/store/useProfileStore";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/cn";

interface DockStatusLineProps {
  className?: string;
  onClickProfile?: () => void;
}

export function DockStatusLine({ className, onClickProfile }: DockStatusLineProps) {
  const { level, xp, xpToNextLevel, streak } = useProfileStore();

  const [gainXp, setGainXp] = useState<number | null>(null);
  const [isLevelingUp, setIsLevelingUp] = useState<boolean>(false);
  const [isHovered, setIsHovered] = useState<boolean>(false);

  const prevXpRef = useRef(xp);
  const prevLevelRef = useRef(level);

  useEffect(() => {
    if (xp > prevXpRef.current && level === prevLevelRef.current) {
      const diff = xp - prevXpRef.current;
      setGainXp(diff);
      const timer = setTimeout(() => setGainXp(null), 1800);
      prevXpRef.current = xp;
      return () => clearTimeout(timer);
    }
    prevXpRef.current = xp;
  }, [xp, level]);

  useEffect(() => {
    if (level > prevLevelRef.current) {
      setIsLevelingUp(true);
      const timer = setTimeout(() => setIsLevelingUp(false), 800);
      prevLevelRef.current = level;
      return () => clearTimeout(timer);
    }
    prevLevelRef.current = level;
  }, [level]);

  const progressPct = Math.min(100, Math.max(0, (xp / (xpToNextLevel || 100)) * 100));

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClickProfile}
      className={cn(
        "relative flex items-center justify-center gap-2.5 text-xs text-[#9aa5b8] font-sans select-none px-2 py-0.5 transition-colors",
        onClickProfile && "cursor-pointer hover:text-white",
        className
      )}
      role="status"
      aria-label={`Level ${level}, ${xp} of ${xpToNextLevel} XP, ${streak} day streak`}
    >
      {/* Level with soft level-up pulse */}
      <motion.span
        animate={isLevelingUp ? { scale: [1, 1.2, 1], color: ["#9aa5b8", "#c8ff57", "#9aa5b8"] } : {}}
        transition={{ duration: 0.5 }}
        className="font-medium"
      >
        Lvl {level}
      </motion.span>

      {/* 64px by 2px hairline progress bar */}
      <div className="relative w-16 h-0.5 rounded-full bg-white/10 overflow-hidden">
        <motion.div
          className="h-full bg-[var(--accent-lime)]"
          initial={false}
          animate={{ width: `${progressPct}%` }}
          transition={spring.soft}
        />
      </div>

      {/* Streak icon & days */}
      <div className="flex items-center gap-1 font-medium">
        <Flame size={13} weight="fill" className="text-[var(--accent-lime)]" />
        <span>{streak}d</span>
      </div>

      {/* Transient XP gain indicator */}
      <AnimatePresence>
        {gainXp !== null && (
          <motion.span
            initial={{ opacity: 0, y: 3, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.9 }}
            transition={{ duration: 0.2 }}
            className="text-[10px] text-[var(--accent-lime)] font-mono ml-0.5"
          >
            +{gainXp} XP
          </motion.span>
        )}
      </AnimatePresence>

      {/* Hover tooltip: XP to next level */}
      <AnimatePresence>
        {isHovered && gainXp === null && (
          <motion.div
            initial={{ opacity: 0, y: 2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 2 }}
            transition={{ duration: 0.12 }}
            className="pointer-events-none absolute -bottom-5 text-[10px] text-[#9aa5b8] whitespace-nowrap bg-[#0c0e14]/90 backdrop-blur-md px-1.5 py-0.5 rounded"
          >
            {xp} / {xpToNextLevel} XP
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

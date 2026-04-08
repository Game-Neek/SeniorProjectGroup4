import { useState, useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  Trophy, Star, Flame, Zap, Award, Target,
  PartyPopper, Sparkles, TrendingUp, Medal,
} from "lucide-react";

/* ── Milestone definitions ── */
interface Milestone {
  threshold: number; // percent
  label: string;
  icon: typeof Trophy;
  color: string;
  xp: number;
  message: string;
}

const MILESTONES: Milestone[] = [
  { threshold: 25, label: "Getting Started", icon: Zap, color: "text-blue-500", xp: 50, message: "Quarter of the way — nice momentum!" },
  { threshold: 50, label: "Halfway Hero", icon: Flame, color: "text-amber-500", xp: 120, message: "Half done! Keep the fire going 🔥" },
  { threshold: 75, label: "Almost There", icon: Star, color: "text-purple-500", xp: 200, message: "Three-quarters mastered — the finish line is near!" },
  { threshold: 100, label: "Completionist", icon: Trophy, color: "text-yellow-500", xp: 350, message: "All topics conquered — incredible work! 🏆" },
];

/* ── XP helper ── */
function computeXP(pct: number): number {
  let xp = 0;
  for (const m of MILESTONES) {
    if (pct >= m.threshold) xp += m.xp;
  }
  // Bonus per-topic XP (simulate ~10 XP per percent)
  xp += Math.round(pct * 2);
  return xp;
}

function xpLevel(xp: number): { level: number; current: number; needed: number } {
  // Each level costs 100 XP more than the last, starting at 200
  let level = 1;
  let remaining = xp;
  let cost = 200;
  while (remaining >= cost) {
    remaining -= cost;
    level++;
    cost += 100;
  }
  return { level, current: remaining, needed: cost };
}

/* ── Celebration overlay ── */
const CelebrationOverlay = ({ milestone, onDone }: { milestone: Milestone; onDone: () => void }) => {
  useEffect(() => {
    const timer = setTimeout(onDone, 3500);
    return () => clearTimeout(timer);
  }, [onDone]);

  const Icon = milestone.icon;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm animate-fade-in"
      onClick={onDone}
      role="dialog"
      aria-modal="true"
      aria-label={`Milestone achieved: ${milestone.label}`}
      onKeyDown={(e) => { if (e.key === 'Escape' || e.key === 'Enter') onDone(); }}
      tabIndex={0}
    >
      <div className="relative flex flex-col items-center gap-3 p-8 rounded-2xl bg-card border border-border shadow-2xl animate-scale-in max-w-sm text-center" aria-live="assertive">
        {/* confetti dots */}
        {Array.from({ length: 12 }).map((_, i) => (
          <span
            key={i}
            className="absolute w-2 h-2 rounded-full opacity-80"
            aria-hidden="true"
            style={{
              background: ["hsl(var(--primary))", "hsl(var(--accent))", "hsl(var(--secondary))", "#facc15", "#22c55e"][i % 5],
              top: `${10 + Math.random() * 80}%`,
              left: `${5 + Math.random() * 90}%`,
              animation: `confetti-fall ${1.5 + Math.random()}s ease-out forwards`,
              animationDelay: `${Math.random() * 0.5}s`,
            }}
          />
        ))}
        <div className="p-4 rounded-full bg-primary/10 animate-[pulse_1s_ease-in-out_2]">
          <Icon className={cn("w-10 h-10", milestone.color)} aria-hidden="true" />
        </div>
        <h3 className="text-xl font-bold text-foreground">{milestone.label}</h3>
        <p className="text-sm text-muted-foreground">{milestone.message}</p>
        <Badge className="bg-accent/20 text-accent border-accent/30 text-sm gap-1">
          <Sparkles className="w-3 h-3" aria-hidden="true" /> +{milestone.xp} XP
        </Badge>
      </div>
    </div>
  );
};

/* ── Earned badge pill ── */
const EarnedBadge = ({ milestone, earned }: { milestone: Milestone; earned: boolean }) => {
  const Icon = milestone.icon;
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-1 p-2 rounded-lg border transition-all duration-300",
        earned
          ? "border-primary/20 bg-primary/5 scale-100 opacity-100"
          : "border-border bg-muted/30 opacity-40 grayscale scale-95"
      )}
    >
      <div className={cn("p-1.5 rounded-full", earned ? "bg-primary/10" : "bg-muted")}>
        <Icon className={cn("w-4 h-4", earned ? milestone.color : "text-muted-foreground")} />
      </div>
      <span className="text-[10px] font-medium text-muted-foreground leading-tight text-center">
        {milestone.label}
      </span>
      {earned && (
        <span className="text-[9px] text-accent font-semibold">+{milestone.xp} XP</span>
      )}
    </div>
  );
};

/* ── Main component ── */
interface ChecklistRewardsProps {
  completionPct: number;
  checkedCount: number;
  totalCount: number;
  /** Storage key prefix to track which milestones were already celebrated */
  storageKey: string;
}

export const ChecklistRewards = ({
  completionPct,
  checkedCount,
  totalCount,
  storageKey,
}: ChecklistRewardsProps) => {
  const [celebrating, setCelebrating] = useState<Milestone | null>(null);
  const prevPct = useRef(completionPct);
  const celebrated = useRef<Set<number>>(new Set());

  // Load previously celebrated milestones
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(`rewards-${storageKey}`) || "[]");
      celebrated.current = new Set(stored);
    } catch { /* noop */ }
  }, [storageKey]);

  // Detect milestone crossings
  useEffect(() => {
    const prev = prevPct.current;
    prevPct.current = completionPct;

    for (const m of MILESTONES) {
      if (completionPct >= m.threshold && prev < m.threshold && !celebrated.current.has(m.threshold)) {
        celebrated.current.add(m.threshold);
        localStorage.setItem(`rewards-${storageKey}`, JSON.stringify([...celebrated.current]));
        setCelebrating(m);
        break;
      }
    }
  }, [completionPct, storageKey]);

  const xp = computeXP(completionPct);
  const { level, current, needed } = xpLevel(xp);

  // Next milestone
  const nextMilestone = MILESTONES.find(m => completionPct < m.threshold);

  return (
    <>
      {celebrating && (
        <CelebrationOverlay milestone={celebrating} onDone={() => setCelebrating(null)} />
      )}

      <div className="space-y-3">
        {/* XP & Level bar */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-accent/10 border border-accent/20 rounded-full px-3 py-1">
            <Medal className="w-4 h-4 text-accent" />
            <span className="text-xs font-bold text-accent">Lvl {level}</span>
          </div>
          <div className="flex-1 space-y-0.5">
            <div className="flex justify-between">
              <span className="text-[10px] text-muted-foreground font-medium">{xp} XP</span>
              <span className="text-[10px] text-muted-foreground">{current}/{needed} to next level</span>
            </div>
            <Progress value={(current / needed) * 100} className="h-1.5" />
          </div>
        </div>

        {/* Next milestone teaser */}
        {nextMilestone && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 border border-border">
            <Target className="w-4 h-4 text-primary flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground">
                Next: {nextMilestone.label}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {Math.max(0, Math.ceil((nextMilestone.threshold / 100) * totalCount) - checkedCount)} more topic{Math.ceil((nextMilestone.threshold / 100) * totalCount) - checkedCount !== 1 ? "s" : ""} to unlock +{nextMilestone.xp} XP
              </p>
            </div>
            <div className="text-xs font-bold text-primary">{nextMilestone.threshold}%</div>
          </div>
        )}

        {/* Badge row */}
        <div className="grid grid-cols-4 gap-2">
          {MILESTONES.map(m => (
            <EarnedBadge key={m.threshold} milestone={m} earned={completionPct >= m.threshold} />
          ))}
        </div>

        {/* Streak mini-indicator */}
        {completionPct >= 100 && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/20 animate-fade-in">
            <PartyPopper className="w-5 h-5 text-green-600" />
            <div>
              <p className="text-sm font-semibold text-green-600">Course Complete!</p>
              <p className="text-[10px] text-muted-foreground">You've earned all {xp} XP — amazing job!</p>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

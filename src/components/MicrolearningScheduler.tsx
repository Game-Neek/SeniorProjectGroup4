import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Loader2, CalendarClock, Sparkles, CheckCircle2, Clock,
  BookOpen, Pencil, FileQuestion, Trash2, ChevronDown, ChevronRight,
  CalendarDays, Timer, Zap,
} from "lucide-react";
import { useMicrolearningSchedule, MicroSession } from "@/hooks/useMicrolearningSchedule";
import { cn } from "@/lib/utils";
import { format, parseISO, isToday, isBefore, startOfDay } from "date-fns";

interface Props {
  className: string;
}

const typeConfig: Record<string, { icon: typeof BookOpen; label: string; color: string }> = {
  lesson: { icon: BookOpen, label: "Lesson", color: "text-blue-600 dark:text-blue-400" },
  practice: { icon: Pencil, label: "Practice", color: "text-amber-600 dark:text-amber-400" },
  quiz: { icon: FileQuestion, label: "Quiz", color: "text-primary" },
};

const SessionCard = ({
  session,
  onComplete,
}: {
  session: MicroSession;
  onComplete: (id: string) => void;
}) => {
  const cfg = typeConfig[session.moduleType] || typeConfig.lesson;
  const Icon = cfg.icon;
  const isPast = isBefore(parseISO(session.date), startOfDay(new Date()));
  const today = isToday(parseISO(session.date));

  return (
    <div className={cn(
      "flex items-center gap-3 p-3 rounded-lg border transition-all",
      session.isCompleted
        ? "bg-green-500/5 border-green-500/20 opacity-70"
        : today
        ? "bg-primary/5 border-primary/30 shadow-sm"
        : isPast
        ? "bg-destructive/5 border-destructive/20"
        : "border-border hover:bg-muted/40"
    )}>
      {/* Type icon */}
      <div className={cn(
        "flex items-center justify-center w-8 h-8 rounded-full flex-shrink-0",
        session.isCompleted ? "bg-green-500/20" : "bg-muted"
      )}>
        {session.isCompleted ? (
          <CheckCircle2 className="w-4 h-4 text-green-600 dark:text-green-400" />
        ) : (
          <Icon className={cn("w-4 h-4", cfg.color)} />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={cn(
          "text-sm font-medium truncate",
          session.isCompleted && "line-through text-muted-foreground"
        )}>
          {session.moduleTitle}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[11px] text-muted-foreground">{session.focusAreaTopic}</span>
          <Badge variant="outline" className="text-[10px] py-0 h-4 capitalize">{cfg.label}</Badge>
        </div>
      </div>

      {/* Duration + action */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <div className="flex items-center gap-1 text-muted-foreground">
          <Timer className="w-3 h-3" />
          <span className="text-xs">{session.durationMinutes}m</span>
        </div>
        {!session.isCompleted && (
          <Button
            variant={today ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => onComplete(session.id)}
          >
            Done
          </Button>
        )}
      </div>
    </div>
  );
};

const DayGroup = ({
  date,
  sessions,
  onComplete,
}: {
  date: string;
  sessions: MicroSession[];
  onComplete: (id: string) => void;
}) => {
  const [expanded, setExpanded] = useState(
    isToday(parseISO(date)) || !sessions.every(s => s.isCompleted)
  );
  const totalMin = sessions.reduce((s, c) => s + c.durationMinutes, 0);
  const completedCount = sessions.filter(s => s.isCompleted).length;
  const today = isToday(parseISO(date));
  const past = isBefore(parseISO(date), startOfDay(new Date()));

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "flex items-center justify-between w-full text-left px-3 py-2 rounded-lg transition-colors",
          today ? "bg-primary/10" : "hover:bg-muted/50"
        )}
      >
        <div className="flex items-center gap-2">
          {expanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
          <CalendarDays className={cn("w-4 h-4", today ? "text-primary" : "text-muted-foreground")} />
          <span className={cn("text-sm font-medium", today && "text-primary")}>
            {today ? "Today" : format(parseISO(date), "EEE, MMM d")}
          </span>
          {today && <Badge className="text-[10px] py-0 h-4 bg-primary text-primary-foreground">Today</Badge>}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">{completedCount}/{sessions.length}</span>
          <span className="text-xs text-muted-foreground">{totalMin} min</span>
          {completedCount === sessions.length && sessions.length > 0 && (
            <CheckCircle2 className="w-4 h-4 text-green-500" />
          )}
          {past && completedCount < sessions.length && (
            <Badge variant="outline" className="text-[10px] py-0 h-4 text-destructive border-destructive/30">Overdue</Badge>
          )}
        </div>
      </button>
      {expanded && (
        <div className="ml-6 mt-1 space-y-1.5">
          {sessions.map(s => (
            <SessionCard key={s.id} session={s} onComplete={onComplete} />
          ))}
        </div>
      )}
    </div>
  );
};

export const MicrolearningScheduler = ({ className }: Props) => {
  const schedule = useMicrolearningSchedule(className);
  const [showConfig, setShowConfig] = useState(false);
  const [dailyMin, setDailyMin] = useState(30);
  const [skipWeekends, setSkipWeekends] = useState(true);

  const handleGenerate = () => {
    schedule.generateSchedule({
      dailyMinutes: dailyMin,
      skipWeekends,
      startDate: new Date(),
    });
  };

  // Group sessions by date
  const byDate = new Map<string, MicroSession[]>();
  schedule.sessions.forEach(s => {
    if (!byDate.has(s.date)) byDate.set(s.date, []);
    byDate.get(s.date)!.push(s);
  });

  const progressPct = schedule.totalSessions > 0
    ? Math.round((schedule.completedSessions / schedule.totalSessions) * 100)
    : 0;

  return (
    <Card className="p-6 border-border">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <CalendarClock className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Microlearning Schedule</h3>
            <p className="text-xs text-muted-foreground">
              Bite-sized daily sessions to prevent overwhelm
            </p>
          </div>
        </div>
        {schedule.sessions.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={schedule.clearSchedule}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        )}
      </div>

      {schedule.sessions.length === 0 ? (
        <div className="space-y-4">
          <div className="text-center py-4">
            <CalendarClock className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-50" />
            <p className="text-sm text-muted-foreground mb-1">No microlearning sessions scheduled</p>
            <p className="text-xs text-muted-foreground mb-4">
              Break your study plan into manageable daily sessions
            </p>
          </div>

          {/* Configuration */}
          <div className="space-y-4 p-4 rounded-lg bg-muted/30 border border-border">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Daily study time</Label>
                <span className="text-sm font-bold text-primary">{dailyMin} min</span>
              </div>
              <Slider
                value={[dailyMin]}
                onValueChange={([v]) => setDailyMin(v)}
                min={15}
                max={90}
                step={5}
                className="w-full"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>15 min</span>
                <span>90 min</span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Label className="text-sm">Skip weekends</Label>
              <Switch checked={skipWeekends} onCheckedChange={setSkipWeekends} />
            </div>
          </div>

          <Button
            className="w-full gap-2"
            onClick={handleGenerate}
            disabled={schedule.isScheduling}
          >
            {schedule.isScheduling ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            {schedule.isScheduling ? "Scheduling..." : "Generate Microlearning Schedule"}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Stats row */}
          <div className="grid grid-cols-4 gap-2">
            <div className="rounded-lg bg-muted/50 p-2.5 text-center">
              <p className="text-lg font-bold text-foreground">{schedule.totalSessions}</p>
              <p className="text-[10px] text-muted-foreground">Sessions</p>
            </div>
            <div className="rounded-lg bg-green-500/10 p-2.5 text-center">
              <p className="text-lg font-bold text-green-600 dark:text-green-400">{schedule.completedSessions}</p>
              <p className="text-[10px] text-muted-foreground">Completed</p>
            </div>
            <div className="rounded-lg bg-primary/10 p-2.5 text-center">
              <p className="text-lg font-bold text-primary">{schedule.todaySessions.length}</p>
              <p className="text-[10px] text-muted-foreground">Today</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-2.5 text-center">
              <p className="text-lg font-bold text-foreground">{schedule.remainingMinutes}m</p>
              <p className="text-[10px] text-muted-foreground">Remaining</p>
            </div>
          </div>

          {/* Progress */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">Schedule Progress</span>
              <span className="text-sm font-bold text-primary">{progressPct}%</span>
            </div>
            <Progress value={progressPct} className="h-2" />
          </div>

          {/* Today's sessions highlight */}
          {schedule.todaySessions.length > 0 && (
            <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-3">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold text-primary">Today's Focus</span>
                <span className="text-xs text-muted-foreground ml-auto">
                  {schedule.todaySessions.reduce((s, c) => s + c.durationMinutes, 0)} min total
                </span>
              </div>
              <div className="space-y-1">
                {schedule.todaySessions.map(s => (
                  <SessionCard key={s.id} session={s} onComplete={schedule.completeSession} />
                ))}
              </div>
            </div>
          )}

          {/* Full schedule by date */}
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {Array.from(byDate.entries()).map(([date, daySessions]) => (
              <DayGroup
                key={date}
                date={date}
                sessions={daySessions}
                onComplete={schedule.completeSession}
              />
            ))}
          </div>

          {/* Reschedule button */}
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-2"
            onClick={() => setShowConfig(!showConfig)}
          >
            <CalendarClock className="w-4 h-4" />
            Reschedule
          </Button>

          {showConfig && (
            <div className="space-y-3 p-4 rounded-lg bg-muted/30 border border-border">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm">Daily study time</Label>
                  <span className="text-sm font-bold text-primary">{dailyMin} min</span>
                </div>
                <Slider
                  value={[dailyMin]}
                  onValueChange={([v]) => setDailyMin(v)}
                  min={15}
                  max={90}
                  step={5}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-sm">Skip weekends</Label>
                <Switch checked={skipWeekends} onCheckedChange={setSkipWeekends} />
              </div>
              <Button
                className="w-full gap-2"
                onClick={handleGenerate}
                disabled={schedule.isScheduling}
              >
                {schedule.isScheduling ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Regenerate Schedule
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
};

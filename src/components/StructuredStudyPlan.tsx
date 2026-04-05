import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Target, BookOpen, CheckCircle2, Loader2, Lock, Unlock,
  ChevronRight, Lightbulb, PenTool, GraduationCap, Zap,
  Clock, Trophy, ArrowRight, FileQuestion, AlertTriangle,
  RotateCcw, XCircle,
} from "lucide-react";
import { useStructuredStudyPlan, FocusArea, StudyModule, getScoreTier } from "@/hooks/useStructuredStudyPlan";
import { MiniQuiz } from "@/components/MiniQuiz";
import { MathText } from "@/components/MathText";
import { LessonRenderer } from "@/components/LessonRenderer";
import { PracticeRenderer } from "@/components/PracticeRenderer";
import { cn } from "@/lib/utils";

interface StructuredStudyPlanProps {
  className: string;
  learningStyles: string[];
}

const moduleTypeConfig: Record<string, { icon: typeof BookOpen; label: string; color: string }> = {
  lesson: { icon: Lightbulb, label: "Lesson", color: "text-amber-500" },
  practice: { icon: PenTool, label: "Practice", color: "text-blue-500" },
  quiz: { icon: FileQuestion, label: "Benchmark Quiz", color: "text-purple-500" },
};

export const StructuredStudyPlan = ({ className, learningStyles }: StructuredStudyPlanProps) => {
  const plan = useStructuredStudyPlan(className, learningStyles);
  const [openModuleId, setOpenModuleId] = useState<string | null>(null);
  const [quizGateOpen, setQuizGateOpen] = useState(false);
  const [quizGateAreaId, setQuizGateAreaId] = useState<string | null>(null);
  const [reviewContent, setReviewContent] = useState<string | null>(null);
  const [showReviewDialog, setShowReviewDialog] = useState(false);
  const [topicPlacementOpen, setTopicPlacementOpen] = useState(false);
  const [topicPlacementAreaId, setTopicPlacementAreaId] = useState<string | null>(null);
  const [topicPlacementQuestions, setTopicPlacementQuestions] = useState<any>(null);

  const activeArea = plan.focusAreas.find(a => a.id === plan.activeFocusAreaId);
  const openModule = activeArea?.modules.find(m => m.id === openModuleId) || null;

  const handleOpenModule = async (mod: StudyModule, topic: string) => {
    if (mod.module_type === "quiz") {
      // Open quiz gate instead of content dialog
      const area = plan.focusAreas.find(a => a.modules.some(m => m.id === mod.id));
      if (area) {
        setQuizGateAreaId(area.id);
        setQuizGateOpen(true);
      }
      return;
    }
    setOpenModuleId(mod.id);
    if (!mod.content) {
      await plan.loadModuleContent(mod, topic);
    }
  };

  const handleCompleteModule = async (moduleId: string) => {
    await plan.completeModule(moduleId);
  };

  const handleQuizComplete = async (areaId: string, score: number, total: number, missedConcepts?: string[]) => {
    setQuizGateOpen(false);
    await plan.passQuizGate(areaId, score, total, missedConcepts);
    setQuizGateAreaId(null);
  };

  const handleShowReview = async (areaId: string, missedConcepts: string[]) => {
    setShowReviewDialog(true);
    const content = await plan.generateReviewLesson(areaId, missedConcepts);
    if (content) setReviewContent(content);
  };

  const handleRetryQuiz = async (areaId: string) => {
    await plan.resetQuizForRetry(areaId);
    setShowReviewDialog(false);
    setReviewContent(null);
    // Re-open the quiz
    setQuizGateAreaId(areaId);
    setQuizGateOpen(true);
  };

  const handleStartTopicPlacement = async (areaId: string) => {
    setTopicPlacementAreaId(areaId);
    const data = await plan.takeTopicPlacement(areaId);
    if (data?.questions) {
      setTopicPlacementQuestions(data);
      setTopicPlacementOpen(true);
    }
  };

  const handleTopicPlacementComplete = async (score: number, total: number) => {
    if (topicPlacementAreaId) {
      setTopicPlacementOpen(false);
      await plan.handleTopicPlacementResult(topicPlacementAreaId, score, total);
      setTopicPlacementAreaId(null);
      setTopicPlacementQuestions(null);
    }
  };

  const isModuleUnlocked = (mod: StudyModule, area: FocusArea): boolean => {
    if (mod.module_type === "lesson") return true;
    if (mod.module_type === "practice") {
      const lesson = area.modules.find(m => m.module_type === "lesson");
      return !!lesson?.is_completed;
    }
    if (mod.module_type === "quiz") {
      return plan.allModulesComplete(area);
    }
    return false;
  };

  // No gate — adaptive learning works from syllabus topics directly

  // Empty state
  if (!plan.isLoading && plan.focusAreas.length === 0) {
    return (
      <Card className="p-6 border-border shadow-[var(--shadow-soft)]">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 rounded-lg bg-primary/10">
            <GraduationCap className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Adaptive Learning</h3>
            <p className="text-sm text-muted-foreground">Module-based learning path from your syllabus</p>
          </div>
        </div>
        <div className="text-center py-8">
          <Target className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-50" />
          <p className="text-muted-foreground mb-4">Generate a structured learning path based on your syllabus topics</p>
          <Button onClick={plan.generatePlan} disabled={plan.isGenerating}>
            {plan.isGenerating ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generating Plan...</>
            ) : (
              <><Zap className="w-4 h-4 mr-2" />Generate Study Plan</>
            )}
          </Button>
        </div>
      </Card>
    );
  }

  if (plan.isLoading) {
    return (
      <Card className="p-6 border-border shadow-[var(--shadow-soft)]">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span className="ml-3 text-muted-foreground">Loading study plan...</span>
        </div>
      </Card>
    );
  }

  return (
    <>
      <Card className="p-6 border-border shadow-[var(--shadow-soft)]">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <GraduationCap className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">Adaptive Learning</h3>
              <p className="text-sm text-muted-foreground">
                {plan.focusAreas.length} Focus Areas • ~{plan.estimatedWeeks} weeks
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-medium text-foreground">{plan.overallProgress}% Complete</p>
              <p className="text-xs text-muted-foreground">{plan.completedModules}/{plan.totalModules} steps</p>
            </div>
            <Button variant="outline" size="sm" onClick={plan.generatePlan} disabled={plan.isGenerating}>
              {plan.isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : "Regenerate"}
            </Button>
          </div>
        </div>

        {/* Overall Progress */}
        <div className="mb-6">
          <Progress value={plan.overallProgress} className="h-3" />
          <div className="flex justify-between mt-2">
            <span className="text-xs text-muted-foreground">{plan.completedAreas}/{plan.focusAreas.length} areas completed</span>
            <span className="text-xs text-muted-foreground">Est. completion: {plan.estimatedWeeks} weeks</span>
          </div>
        </div>

        {/* Focus Areas Grid */}
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Focus Area List */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <Target className="w-4 h-4 text-primary" />
              Learning Path
            </h4>
            <ScrollArea className="h-[400px] pr-2">
              <div className="space-y-2">
                {plan.focusAreas.map((area, idx) => {
                  const progress = plan.getFocusAreaProgress(area);
                  const isActive = area.id === plan.activeFocusAreaId;
                  const isLocked = !area.is_unlocked;
                  const isComplete = area.quiz_passed;
                  const step = plan.getModuleStep(area);
                  const failed = area.quiz_score !== null && area.quiz_score < 70 && !area.quiz_passed;

                  return (
                    <div
                      key={area.id}
                      className={cn(
                        "p-3 rounded-lg border transition-all cursor-pointer",
                        isLocked && "opacity-50 cursor-not-allowed bg-muted/30 border-border",
                        isActive && !isLocked && "border-primary bg-primary/5 shadow-sm",
                        isComplete && "border-green-500/30 bg-green-500/5",
                        failed && !isActive && "border-destructive/30 bg-destructive/5",
                        !isActive && !isLocked && !isComplete && !failed && "border-border hover:border-primary/50 bg-card"
                      )}
                      onClick={() => !isLocked && plan.setActiveFocusAreaId(area.id)}
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0",
                          isComplete ? "bg-green-500 text-white" :
                          failed ? "bg-destructive/10 text-destructive" :
                          isLocked ? "bg-muted text-muted-foreground" :
                          isActive ? "bg-primary text-primary-foreground" :
                          "bg-muted text-foreground"
                        )}>
                          {isComplete ? <CheckCircle2 className="w-4 h-4" /> :
                           failed ? <XCircle className="w-4 h-4" /> :
                           isLocked ? <Lock className="w-3 h-3" /> :
                           idx + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className={cn("text-sm font-medium truncate",
                              isComplete ? "text-green-600" :
                              failed ? "text-destructive" :
                              isLocked ? "text-muted-foreground" : "text-foreground"
                            )}>
                              {area.topic}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <Progress value={progress} className="h-1.5 flex-1" />
                            <span className="text-xs text-muted-foreground whitespace-nowrap">
                              {isComplete ? "✓" : step === "lesson" ? "Lesson" : step === "practice" ? "Practice" : step === "quiz" ? "Quiz" : `${progress}%`}
                            </span>
                          </div>
                        </div>
                        {isComplete && <Trophy className="w-4 h-4 text-green-500 flex-shrink-0" />}
                        {failed && <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0" />}
                        {!isLocked && !isComplete && !failed && <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>

          {/* Active Focus Area Detail */}
          <div>
            {activeArea ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-primary" />
                    {activeArea.topic}
                  </h4>
                  {activeArea.estimated_time_minutes && (
                    <Badge variant="outline" className="text-xs">
                      <Clock className="w-3 h-3 mr-1" />
                      ~{activeArea.estimated_time_minutes} min
                    </Badge>
                  )}
                </div>

                {/* Topic Placement Quiz — skip if already mastered */}
                {!activeArea.quiz_passed && activeArea.quiz_score === null && (
                  <div className="p-3 rounded-lg border border-dashed border-primary/30 bg-primary/5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileQuestion className="w-4 h-4 text-primary" />
                        <div>
                          <p className="text-xs font-medium text-foreground">Already know this topic?</p>
                          <p className="text-xs text-muted-foreground">Take a quick placement quiz to skip ahead</p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={plan.topicPlacementLoading === activeArea.id}
                        onClick={() => handleStartTopicPlacement(activeArea.id)}
                      >
                        {plan.topicPlacementLoading === activeArea.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <>
                            <Zap className="w-3 h-3 mr-1" />
                            Test
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Module Steps: Lesson → Practice → Quiz */}
                <ScrollArea className="h-[320px] pr-2">
                  <div className="space-y-2">
                    {activeArea.modules.map((mod) => {
                      const config = moduleTypeConfig[mod.module_type] || moduleTypeConfig.lesson;
                      const Icon = config.icon;
                      const unlocked = isModuleUnlocked(mod, activeArea);

                      return (
                        <div
                          key={mod.id}
                          className={cn(
                            "p-3 rounded-lg border transition-all",
                            mod.is_completed ? "bg-green-500/5 border-green-500/20" :
                            unlocked ? "bg-card border-border hover:border-primary/50 cursor-pointer" :
                            "opacity-50 bg-muted/30 border-border cursor-not-allowed"
                          )}
                          onClick={() => unlocked && !mod.is_completed && handleOpenModule(mod, activeArea.topic)}
                        >
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
                              mod.is_completed ? "bg-green-500/10" :
                              unlocked ? "bg-primary/10" :
                              "bg-muted"
                            )}>
                              {mod.is_completed ? (
                                <CheckCircle2 className="w-4 h-4 text-green-500" />
                              ) : !unlocked ? (
                                <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                              ) : (
                                <Icon className={cn("w-4 h-4", config.color)} />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={cn("text-sm font-medium",
                                mod.is_completed ? "text-green-600" : "text-foreground"
                              )}>
                                {mod.title}
                              </p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <Badge variant="outline" className="text-xs py-0">
                                  {config.label}
                                </Badge>
                                {mod.estimated_time_minutes && (
                                  <span className="text-xs text-muted-foreground">{mod.estimated_time_minutes} min</span>
                                )}
                              </div>
                            </div>
                            {mod.is_completed && mod.module_type !== "quiz" && (
                              <Button variant="ghost" size="sm" className="h-6 text-xs px-2"
                                onClick={(e) => { e.stopPropagation(); plan.uncompleteModule(mod.id); }}>
                                Undo
                              </Button>
                            )}
                            {unlocked && !mod.is_completed && (
                              <ArrowRight className="w-4 h-4 text-primary flex-shrink-0" />
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* Failed Quiz Review Banner */}
                    {activeArea.quiz_score !== null && activeArea.quiz_score < 70 && !activeArea.quiz_passed && (
                      <div className="p-4 rounded-lg border-2 border-dashed border-destructive/50 bg-destructive/5 mt-3">
                        <div className="flex items-center gap-2 mb-2">
                          <AlertTriangle className="w-5 h-5 text-destructive" />
                          <span className="font-semibold text-sm text-destructive">
                            Quiz Failed — {activeArea.quiz_score}% (Need 70%)
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mb-3">
                          Review the missed concepts before retrying the quiz.
                        </p>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleShowReview(activeArea.id, plan.reviewMissedConcepts.length > 0 ? plan.reviewMissedConcepts : [activeArea.topic])}
                          >
                            <BookOpen className="w-4 h-4 mr-1" />
                            Review Lesson
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleRetryQuiz(activeArea.id)}
                          >
                            <RotateCcw className="w-4 h-4 mr-1" />
                            Retry Quiz
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Passed with Review Banner */}
                    {activeArea.quiz_passed && activeArea.quiz_score !== null && activeArea.quiz_score < 100 && (
                      <div className="p-4 rounded-lg border border-amber-500/30 bg-amber-500/5 mt-3">
                        <div className="flex items-center gap-2 mb-2">
                          <CheckCircle2 className="w-5 h-5 text-amber-500" />
                          <span className="font-semibold text-sm text-amber-600">
                            Passed — {activeArea.quiz_score}%
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mb-2">
                          You passed but missed some concepts. Review them to strengthen understanding.
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleShowReview(activeArea.id, plan.reviewMissedConcepts.length > 0 ? plan.reviewMissedConcepts : [activeArea.topic])}
                        >
                          <BookOpen className="w-4 h-4 mr-1" />
                          Review Missed Concepts
                        </Button>
                      </div>
                    )}

                    {/* Perfect Score Banner */}
                    {activeArea.quiz_passed && activeArea.quiz_score === 100 && (
                      <div className="p-4 rounded-lg border border-green-500/30 bg-green-500/5 mt-3 text-center">
                        <Trophy className="w-8 h-8 text-green-500 mx-auto mb-2" />
                        <span className="font-semibold text-sm text-green-600">
                          Perfect Score! 🎉
                        </span>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            ) : (
              <div className="flex items-center justify-center h-[400px] text-muted-foreground">
                <p className="text-sm">Select a focus area to view modules</p>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Module Content Dialog (Lesson / Practice) */}
      <Dialog open={!!openModuleId} onOpenChange={() => setOpenModuleId(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {openModule && (() => {
                const config = moduleTypeConfig[openModule.module_type] || moduleTypeConfig.lesson;
                const Icon = config.icon;
                return <Icon className={cn("w-5 h-5", config.color)} />;
              })()}
              {openModule?.title}
            </DialogTitle>
            <DialogDescription>
              {openModule && (moduleTypeConfig[openModule.module_type]?.label || "Module")}
              {openModule?.estimated_time_minutes && ` • ~${openModule.estimated_time_minutes} min`}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[55vh] pr-4">
            {plan.loadingModuleContent === openModule?.id ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground">
                    Generating {openModule?.module_type === "lesson" ? "lesson" : "practice problems"}...
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Adapting to your learning style
                  </p>
                </div>
              </div>
            ) : openModule?.content ? (
              openModule.module_type === "practice" ? (
                <PracticeRenderer
                  content={openModule.content}
                  onComplete={() => { handleCompleteModule(openModule.id); setOpenModuleId(null); }}
                />
              ) : (
                <LessonRenderer content={openModule.content} moduleType={openModule.module_type} />
              )
            ) : (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <BookOpen className="w-8 h-8 text-muted-foreground opacity-50" />
                <p className="text-sm text-muted-foreground">Content not available. Try reopening this module.</p>
              </div>
            )}
          </ScrollArea>
          {openModule && !openModule.is_completed && (
            <div className="flex justify-end pt-4 border-t border-border">
              <Button onClick={() => { handleCompleteModule(openModule.id); setOpenModuleId(null); }}>
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Mark as Complete
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Targeted Review Dialog */}
      <Dialog open={showReviewDialog} onOpenChange={setShowReviewDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Targeted Review
            </DialogTitle>
            <DialogDescription>
              Focused review on concepts you missed
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[55vh] pr-4">
            {plan.isGeneratingReview ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <span className="ml-2 text-muted-foreground">Generating targeted review...</span>
              </div>
            ) : reviewContent ? (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <div className="whitespace-pre-wrap text-foreground">
                  <MathText text={reviewContent} />
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">No review content available.</p>
            )}
          </ScrollArea>
          {reviewContent && plan.reviewAreaId && (
            <div className="flex justify-end gap-2 pt-4 border-t border-border">
              <Button variant="outline" onClick={() => setShowReviewDialog(false)}>
                Close
              </Button>
              <Button onClick={() => handleRetryQuiz(plan.reviewAreaId!)}>
                <RotateCcw className="w-4 h-4 mr-2" />
                Retry Quiz
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Quiz Gate Modal */}
      {quizGateAreaId && (() => {
        const gateArea = plan.focusAreas.find(a => a.id === quizGateAreaId);
        if (!gateArea) return null;
        return (
          <MiniQuiz
            isOpen={quizGateOpen}
            onClose={(score?: number, total?: number, missed?: string[]) => {
              if (score !== undefined && total !== undefined) {
                handleQuizComplete(quizGateAreaId, score, total, missed && missed.length > 0 ? missed : [gateArea.topic]);
              } else {
                setQuizGateOpen(false);
                setQuizGateAreaId(null);
              }
            }}
            className={className}
            weakAreas={[gateArea.topic]}
            learningStyles={learningStyles}
            onQuizComplete={(score, total, missed) => {
              handleQuizComplete(quizGateAreaId, score, total, missed && missed.length > 0 ? missed : [gateArea.topic]);
            }}
          />
        );
      })()}

      {/* Topic Placement Quiz Modal */}
      {topicPlacementAreaId && topicPlacementQuestions && (() => {
        const placementArea = plan.focusAreas.find(a => a.id === topicPlacementAreaId);
        if (!placementArea) return null;
        return (
          <MiniQuiz
            isOpen={topicPlacementOpen}
            onClose={(score?: number, total?: number) => {
              if (score !== undefined && total !== undefined) {
                handleTopicPlacementComplete(score, total);
              } else {
                setTopicPlacementOpen(false);
                setTopicPlacementAreaId(null);
                setTopicPlacementQuestions(null);
              }
            }}
            className={className}
            weakAreas={[placementArea.topic]}
            learningStyles={learningStyles}
            preloadedQuestions={topicPlacementQuestions.questions}
            onQuizComplete={(score, total) => {
              handleTopicPlacementComplete(score, total);
            }}
          />
        );
      })()}
    </>
  );
};

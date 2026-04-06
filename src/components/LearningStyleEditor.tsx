import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Eye, Ear, Hand, BookOpen, PenTool, Sparkles, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface LearningStyleEditorProps {
  currentStyles: string[];
  onUpdate: (styles: string[]) => void;
  onSave: () => Promise<boolean>;
}

const styleOptions = [
  { value: "visual", label: "Visual", description: "Diagrams, charts, and videos", icon: Eye, color: "text-blue-500" },
  { value: "auditory", label: "Auditory", description: "Lectures, discussions, and audio", icon: Ear, color: "text-purple-500" },
  { value: "kinesthetic", label: "Kinesthetic", description: "Hands-on practice and activities", icon: Hand, color: "text-green-500" },
  { value: "reading", label: "Reading/Writing", description: "Textbooks, notes, and articles", icon: BookOpen, color: "text-amber-500" },
  { value: "writing", label: "Writing", description: "Summaries, essays, and note-taking", icon: PenTool, color: "text-rose-500" },
];

export const LearningStyleEditor = ({ currentStyles, onUpdate, onSave }: LearningStyleEditorProps) => {
  const [editOpen, setEditOpen] = useState(false);
  const [pendingStyles, setPendingStyles] = useState<string[]>(currentStyles);
  const [saving, setSaving] = useState(false);
  const [showWarning, setShowWarning] = useState(false);

  const handleOpen = () => {
    setPendingStyles([...currentStyles]);
    setEditOpen(true);
    setShowWarning(false);
  };

  const toggleStyle = (style: string) => {
    setPendingStyles(prev => {
      if (prev.includes(style)) {
        return prev.filter(s => s !== style);
      }
      // Max 2 styles
      if (prev.length >= 2) {
        return [prev[1], style];
      }
      return [...prev, style];
    });
  };

  const handleSave = async () => {
    if (pendingStyles.length < 1) return;

    // Show warning if styles are different
    const changed = JSON.stringify(pendingStyles.sort()) !== JSON.stringify([...currentStyles].sort());
    if (changed && !showWarning) {
      setShowWarning(true);
      return;
    }

    setSaving(true);
    onUpdate(pendingStyles);
    // Small delay to let state propagate before saving
    await new Promise(r => setTimeout(r, 50));
    const saved = await onSave();
    setSaving(false);

    if (saved) {
      setEditOpen(false);
      setShowWarning(false);
    }
  };

  return (
    <>
      <Card className="p-6 shadow-[var(--shadow-medium)]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground">Learning Style</h2>
              <p className="text-xs text-muted-foreground">
                Your learning preferences shape how content is personalized
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleOpen}>
            Edit
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {currentStyles.length === 0 ? (
            <p className="text-sm text-muted-foreground">No learning styles set</p>
          ) : (
            currentStyles.map(style => {
              const opt = styleOptions.find(o => o.value === style);
              if (!opt) return null;
              const Icon = opt.icon;
              return (
                <div key={style} className="flex items-center gap-2 p-3 rounded-lg border border-border bg-card">
                  <div className={cn("p-1.5 rounded-md bg-primary/10", opt.color)}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{opt.label}</p>
                    <p className="text-xs text-muted-foreground">{opt.description}</p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <p className="text-xs text-muted-foreground mt-3">
          Changing your learning style will update lesson delivery, practice difficulty, and content recommendations across all courses.
        </p>
      </Card>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Learning Style</DialogTitle>
            <DialogDescription>
              Select up to 2 learning styles. This will recalibrate your personalized content.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 pt-2">
            {styleOptions.map(opt => {
              const isSelected = pendingStyles.includes(opt.value);
              const Icon = opt.icon;
              return (
                <div
                  key={opt.value}
                  onClick={() => toggleStyle(opt.value)}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-xl border-2 transition-all cursor-pointer",
                    isSelected ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
                  )}
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleStyle(opt.value)}
                    className="border-2"
                  />
                  <div className={cn("p-2 rounded-lg bg-primary/10", opt.color)}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <Label className="cursor-pointer font-medium">{opt.label}</Label>
                    <p className="text-xs text-muted-foreground">{opt.description}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {showWarning && (
            <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/5 mt-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-amber-600">This will affect your learning experience</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Changing your learning style will update how lessons are delivered, practice questions are generated, and content difficulty is calibrated across all your courses. Click save again to confirm.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-between items-center pt-2">
            <span className="text-xs text-muted-foreground">
              {pendingStyles.length}/2 selected
            </span>
            <Button
              onClick={handleSave}
              disabled={pendingStyles.length < 1 || saving}
            >
              {saving ? "Saving..." : showWarning ? "Confirm & Save" : "Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

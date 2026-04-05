import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { BookOpen, CheckCircle2, ListChecks } from "lucide-react";

interface ChapterSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  className: string;
  topics: string[];
  onConfirm: (selectedTopics: string[]) => void;
}

export const ChapterSelectionDialog = ({
  open, onOpenChange, className, topics, onConfirm,
}: ChapterSelectionDialogProps) => {
  const [selected, setSelected] = useState<Set<string>>(new Set(topics));

  useEffect(() => {
    setSelected(new Set(topics));
  }, [topics]);

  const toggleTopic = (topic: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(topic)) next.delete(topic);
      else next.add(topic);
      return next;
    });
  };

  const handleSelectAll = () => setSelected(new Set(topics));
  const handleDeselectAll = () => setSelected(new Set());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListChecks className="w-5 h-5 text-primary" />
            Select Chapters to Cover
          </DialogTitle>
          <DialogDescription>
            Choose which chapters your class will actually cover for <span className="font-medium text-foreground">{className}</span>. Only selected chapters will be used for adaptive learning and content generation.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {selected.size} of {topics.length} selected
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={handleSelectAll}>
              Select All
            </Button>
            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={handleDeselectAll}>
              Deselect All
            </Button>
          </div>
        </div>

        <ScrollArea className="max-h-[350px] pr-2">
          <div className="space-y-1">
            {topics.map((topic, idx) => {
              const isChecked = selected.has(topic);
              return (
                <div
                  key={idx}
                  className="flex items-center gap-3 p-2.5 rounded-lg border border-border hover:bg-muted/30 transition-colors cursor-pointer"
                  onClick={() => toggleTopic(topic)}
                >
                  <Checkbox
                    id={`chapter-${idx}`}
                    checked={isChecked}
                    onCheckedChange={() => toggleTopic(topic)}
                  />
                  <Label
                    htmlFor={`chapter-${idx}`}
                    className="flex-1 cursor-pointer text-sm font-medium text-foreground"
                  >
                    {topic}
                  </Label>
                  <Badge variant="outline" className="text-xs text-muted-foreground">
                    Ch. {idx + 1}
                  </Badge>
                </div>
              );
            })}
          </div>
        </ScrollArea>

        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Skip
          </Button>
          <Button
            onClick={() => {
              onConfirm(Array.from(selected));
              onOpenChange(false);
            }}
            disabled={selected.size === 0}
          >
            <CheckCircle2 className="w-4 h-4 mr-1" />
            Confirm ({selected.size})
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

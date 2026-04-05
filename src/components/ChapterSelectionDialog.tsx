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

interface TopicMapping {
  topic: string;
  textbookChapter?: string;
  textbookTitle?: string;
}

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
  const [mappings, setMappings] = useState<TopicMapping[]>([]);

  useEffect(() => {
    setSelected(new Set(topics));
    // Load textbook mapping from localStorage
    try {
      const raw = localStorage.getItem(`textbook-mapping-${className}`);
      if (raw) setMappings(JSON.parse(raw));
    } catch { /* ignore */ }
  }, [topics, className]);

  const getMapping = (topic: string) => mappings.find(m => m.topic === topic);

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
              const mapping = getMapping(topic);
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
                  <div className="flex-1 min-w-0">
                    <Label
                      htmlFor={`chapter-${idx}`}
                      className="cursor-pointer text-sm font-medium text-foreground block"
                    >
                      {topic}
                    </Label>
                    {mapping?.textbookChapter && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <BookOpen className="w-3 h-3 shrink-0" />
                        {mapping.textbookChapter}
                        {mapping.textbookTitle ? ` — ${mapping.textbookTitle}` : ""}
                      </span>
                    )}
                  </div>
                  <Badge variant="outline" className="text-xs text-muted-foreground shrink-0">
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
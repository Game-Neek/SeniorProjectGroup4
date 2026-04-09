import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronDown, ChevronRight, Trash2, Eye, EyeOff, Sparkles, BookOpen, Target } from "lucide-react";
import type { Rubric, AssignmentExample } from "@/hooks/useRubrics";

const qualityColors: Record<string, string> = {
  exemplary: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  proficient: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  developing: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  beginning: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

const statusConfig: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-muted text-muted-foreground" },
  published: { label: "Published", className: "bg-primary/10 text-primary" },
};

interface RubricCardProps {
  rubric: Rubric;
  examples: AssignmentExample[];
  onDelete: (id: string) => void;
  onToggleStatus: (id: string, status: string) => void;
}

export function RubricCard({ rubric, examples, onDelete, onToggleStatus }: RubricCardProps) {
  const [criteriaOpen, setCriteriaOpen] = useState(false);
  const [examplesOpen, setExamplesOpen] = useState(false);

  const status = statusConfig[rubric.status] || statusConfig.draft;

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-lg">{rubric.title}</CardTitle>
              <Badge className={status.className} variant="outline">{status.label}</Badge>
              {rubric.source === "ai" && (
                <Badge variant="outline" className="bg-accent/50 text-accent-foreground gap-1">
                  <Sparkles className="h-3 w-3" /> AI Generated
                </Badge>
              )}
              {rubric.bloom_level && (
                <Badge variant="outline" className="bg-secondary text-secondary-foreground">
                  {rubric.bloom_level}
                </Badge>
              )}
            </div>
            <CardDescription className="mt-1">{rubric.description}</CardDescription>
          </div>
          <div className="flex gap-1 shrink-0">
            <Button
              variant="ghost" size="icon"
              onClick={() => onToggleStatus(rubric.id, rubric.status === "published" ? "draft" : "published")}
              aria-label={rubric.status === "published" ? "Unpublish rubric" : "Publish rubric"}
            >
              {rubric.status === "published" ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => onDelete(rubric.id)} aria-label="Delete rubric">
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        </div>

        {rubric.learning_objectives?.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {rubric.learning_objectives.slice(0, 3).map((obj, i) => (
              <Badge key={i} variant="outline" className="text-xs font-normal max-w-[200px] truncate">
                <Target className="h-3 w-3 mr-1 shrink-0" />
                {obj}
              </Badge>
            ))}
            {rubric.learning_objectives.length > 3 && (
              <Badge variant="outline" className="text-xs">+{rubric.learning_objectives.length - 3} more</Badge>
            )}
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Criteria Table */}
        <Collapsible open={criteriaOpen} onOpenChange={setCriteriaOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between px-2 h-9">
              <span className="text-sm font-medium flex items-center gap-2">
                <Target className="h-4 w-4" />
                Rubric Criteria ({rubric.criteria?.length || 0})
              </span>
              {criteriaOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            {rubric.criteria && rubric.criteria.length > 0 ? (
              <div className="mt-2 overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[150px]">Criterion</TableHead>
                      <TableHead className="w-[60px] text-center">Weight</TableHead>
                      <TableHead className="text-center text-green-700 dark:text-green-400">Exemplary (4)</TableHead>
                      <TableHead className="text-center text-blue-700 dark:text-blue-400">Proficient (3)</TableHead>
                      <TableHead className="text-center text-yellow-700 dark:text-yellow-400">Developing (2)</TableHead>
                      <TableHead className="text-center text-red-700 dark:text-red-400">Beginning (1)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rubric.criteria.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">
                          <div>{c.criterion_name}</div>
                          {c.description && <div className="text-xs text-muted-foreground mt-0.5">{c.description}</div>}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline">{c.weight}%</Badge>
                        </TableCell>
                        {(c.performance_levels || []).map((pl, idx) => (
                          <TableCell key={idx} className="text-xs align-top">
                            {pl.description}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground p-2">No criteria defined yet.</p>
            )}
          </CollapsibleContent>
        </Collapsible>

        {/* Assignment Examples */}
        {examples.length > 0 && (
          <Collapsible open={examplesOpen} onOpenChange={setExamplesOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between px-2 h-9">
                <span className="text-sm font-medium flex items-center gap-2">
                  <BookOpen className="h-4 w-4" />
                  Assignment Examples ({examples.length})
                </span>
                {examplesOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-2 space-y-3">
                {examples.map((ex) => (
                  <Card key={ex.id} className="border-dashed">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-medium text-sm">{ex.title}</span>
                        <Badge className={qualityColors[ex.quality_level] || qualityColors.proficient}>
                          {ex.quality_level}
                        </Badge>
                      </div>
                      {ex.description && <p className="text-sm text-muted-foreground mb-2">{ex.description}</p>}
                      <div className="bg-muted/50 rounded-md p-3 text-sm whitespace-pre-wrap">{ex.example_content}</div>
                      {ex.annotations?.length > 0 && (
                        <div className="mt-3 space-y-1">
                          <p className="text-xs font-medium text-muted-foreground">Annotations:</p>
                          {ex.annotations.map((a, i) => (
                            <div key={i} className="text-xs bg-primary/5 rounded p-2 border-l-2 border-primary">
                              <span className="font-medium">"{a.text}"</span>
                              <span className="text-muted-foreground"> — {a.feedback}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  );
}

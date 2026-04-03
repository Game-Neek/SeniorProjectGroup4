import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Upload, FileText, Trash2, Calendar, Loader2, 
  ClipboardList, Target, Sparkles, Brain, BarChart3,
  ChevronDown, ChevronUp
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Assignment {
  id: string;
  class_name: string;
  assignment_title: string;
  file_name: string;
  file_path: string;
  due_date: string | null;
  learning_objectives: string[] | null;
  uploaded_at: string;
  assessment_type: string | null;
  assessment_metadata: unknown;
  difficulty_level: string | null;
  irt_parameters: any;
  knowledge_dependencies: string[] | null;
  difficulty_analyzed_at: string | null;
}

interface Syllabus {
  id: string;
  class_name: string;
}

interface AssignmentUploadProps {
  learningStyles: string[];
  courseName?: string;
  onAssignmentParsed?: (assignment: Assignment) => void;
}

export const AssignmentUpload = ({ learningStyles, courseName, onAssignmentParsed }: AssignmentUploadProps) => {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [syllabi, setSyllabi] = useState<Syllabus[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState<Set<string>>(new Set());
  const [expandedDifficulty, setExpandedDifficulty] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedClass, setSelectedClass] = useState(courseName || "");
  const [assignmentTitle, setAssignmentTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchAssignments();
    fetchSyllabi();
  }, []);

  const fetchAssignments = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    let query = supabase
      .from('assignments')
      .select('*')
      .eq('user_id', session.user.id)
      .order('uploaded_at', { ascending: false });

    if (courseName) {
      query = query.eq('class_name', courseName);
    }

    const { data, error } = await query;

    if (!error && data) {
      setAssignments(data);
    }
  };

  const fetchSyllabi = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data, error } = await supabase
      .from('syllabi')
      .select('id, class_name')
      .eq('user_id', session.user.id);

    if (!error && data) {
      setSyllabi(data);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const validTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
      if (!validTypes.includes(file.type)) {
        toast({
          title: "Invalid file type",
          description: "Please upload a PDF or Word document.",
          variant: "destructive",
        });
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: "Maximum file size is 10MB.",
          variant: "destructive",
        });
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !selectedClass || !assignmentTitle) {
      toast({
        title: "Missing information",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const filePath = `${session.user.id}/${Date.now()}_${selectedFile.name}`;
      
      // Upload file to storage
      const { error: uploadError } = await supabase.storage
        .from('assignments')
        .upload(filePath, selectedFile);

      if (uploadError) throw uploadError;

      // Create assignment record
      const { data: assignment, error: dbError } = await supabase
        .from('assignments')
        .insert({
          user_id: session.user.id,
          class_name: selectedClass,
          assignment_title: assignmentTitle,
          file_name: selectedFile.name,
          file_path: filePath,
          file_size: selectedFile.size,
          due_date: dueDate || null,
        })
        .select()
        .single();

      if (dbError) throw dbError;

      toast({
        title: "Assignment uploaded",
        description: "Now parsing to extract learning objectives...",
      });

      setDialogOpen(false);
      resetForm();
      fetchAssignments();

      // Parse assignment in background
      if (assignment) {
        parseAssignment(assignment);
      }
    } catch (error) {
      console.error("Upload error:", error);
      toast({
        title: "Upload failed",
        description: "Failed to upload assignment. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const parseAssignment = async (assignment: Assignment) => {
    setIsParsing(true);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Get file URL for parsing
      const { data: urlData } = await supabase.storage
        .from('assignments')
        .createSignedUrl(assignment.file_path, 3600);

      if (!urlData?.signedUrl) throw new Error("Could not get file URL");

      // Call edge function to parse and extract objectives
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agent-b-chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            messages: [{
              role: "user",
              content: `Parse this assignment and extract learning objectives: ${assignment.assignment_title} for ${assignment.class_name}`
            }],
            learningStyles,
            requestType: "parse-assignment",
            assignmentId: assignment.id,
            assignmentTitle: assignment.assignment_title,
            className: assignment.class_name,
            fileUrl: urlData.signedUrl,
          }),
        }
      );

      if (!response.ok) throw new Error("Failed to parse assignment");

      const data = await response.json();
      
      // Update assignment with parsed content and assessment classification
      if (data.learningObjectives) {
        const updatePayload: Record<string, unknown> = {
          learning_objectives: data.learningObjectives,
          parsed_content: data.parsedContent,
        };
        if (data.assessmentType) {
          updatePayload.assessment_type = data.assessmentType;
        }
        if (data.assessmentMetadata) {
          updatePayload.assessment_metadata = data.assessmentMetadata;
        }
        await supabase
          .from('assignments')
          .update(updatePayload)
          .eq('id', assignment.id);

        fetchAssignments();
        
        toast({
          title: "Assignment analyzed",
          description: `Extracted ${data.learningObjectives.length} learning objectives. Analyzing difficulty...`,
        });

        if (onAssignmentParsed) {
          onAssignmentParsed({ ...assignment, learning_objectives: data.learningObjectives });
        }

        // Auto-trigger difficulty analysis
        analyzeDifficulty(assignment.id);
      }
    } catch (error) {
      console.error("Parse error:", error);
      toast({
        title: "Analysis incomplete",
        description: "Could not fully analyze assignment. You can still use it.",
        variant: "destructive",
      });
    } finally {
      setIsParsing(false);
    }
  };

  const analyzeDifficulty = async (assignmentId: string) => {
    setIsAnalyzing((prev) => new Set(prev).add(assignmentId));
    try {
      const { data, error } = await supabase.functions.invoke("analyze-difficulty", {
        body: { assignmentId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      await fetchAssignments();
      toast({
        title: "Difficulty analyzed",
        description: `Level: ${data.difficultyLevel} — ${data.rationale?.slice(0, 80)}...`,
      });
    } catch (error) {
      console.error("Difficulty analysis error:", error);
      toast({
        title: "Difficulty analysis incomplete",
        description: error instanceof Error ? error.message : "Could not analyze difficulty.",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing((prev) => {
        const next = new Set(prev);
        next.delete(assignmentId);
        return next;
      });
    }
  };

  const handleDelete = async (assignment: Assignment) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Delete from storage
      await supabase.storage
        .from('assignments')
        .remove([assignment.file_path]);

      // Delete from database
      await supabase
        .from('assignments')
        .delete()
        .eq('id', assignment.id);

      toast({
        title: "Assignment deleted",
        description: "The assignment has been removed.",
      });

      fetchAssignments();
    } catch (error) {
      console.error("Delete error:", error);
      toast({
        title: "Delete failed",
        description: "Could not delete assignment.",
        variant: "destructive",
      });
    }
  };

  const resetForm = () => {
    setSelectedFile(null);
    setSelectedClass("");
    setAssignmentTitle("");
    setDueDate("");
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <Card className="p-6 shadow-[var(--shadow-soft)] border-border">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-accent/10">
            <ClipboardList className="w-6 h-6 text-accent" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Assignments</h3>
            <p className="text-sm text-muted-foreground">
              Upload assignments to generate aligned study content
            </p>
          </div>
        </div>
        
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[image:var(--gradient-primary)] hover:opacity-90">
              <Upload className="w-4 h-4 mr-2" />
              Upload Assignment
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Upload Assignment</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              {!courseName && (
              <div className="space-y-2">
                <Label htmlFor="class">Class *</Label>
                <Select value={selectedClass} onValueChange={setSelectedClass}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a class" />
                  </SelectTrigger>
                  <SelectContent>
                    {syllabi.map((s) => (
                      <SelectItem key={s.id} value={s.class_name}>
                        {s.class_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {syllabi.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Upload a syllabus first to add assignments
                  </p>
                )}
              </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="title">Assignment Title *</Label>
                <Input
                  id="title"
                  value={assignmentTitle}
                  onChange={(e) => setAssignmentTitle(e.target.value)}
                  placeholder="e.g., Chapter 5 Problem Set"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="due">Due Date (optional)</Label>
                <Input
                  id="due"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="file">Assignment File (PDF or Word) *</Label>
                <Input
                  id="file"
                  type="file"
                  accept=".pdf,.doc,.docx"
                  onChange={handleFileChange}
                />
                {selectedFile && (
                  <p className="text-sm text-muted-foreground">
                    Selected: {selectedFile.name}
                  </p>
                )}
              </div>

              <Button 
                onClick={handleUpload} 
                disabled={isUploading || !selectedFile || !selectedClass || !assignmentTitle}
                className="w-full"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Upload & Analyze
                  </>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isParsing && (
        <div className="flex items-center gap-2 mb-4 p-3 rounded-lg bg-primary/5 border border-primary/20">
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
          <span className="text-sm text-primary">Analyzing assignment...</span>
        </div>
      )}

      <ScrollArea className="h-[200px]">
        {assignments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <FileText className="w-12 h-12 text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">No assignments uploaded yet</p>
            <p className="text-sm text-muted-foreground/70">
              Upload assignments to get personalized study content
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {assignments.map((assignment) => (
              <div
                key={assignment.id}
                className="p-3 rounded-lg border border-border bg-card hover:border-primary/30 transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-foreground truncate">
                        {assignment.assignment_title}
                      </span>
                      <Badge variant="secondary" className="text-xs flex-shrink-0">
                        {assignment.class_name}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <FileText className="w-3 h-3" />
                        {assignment.file_name}
                      </span>
                      {assignment.due_date && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          Due: {formatDate(assignment.due_date)}
                        </span>
                      )}
                    </div>
                    {assignment.assessment_type && (
                      <Badge 
                        variant="outline" 
                        className={`text-xs ${
                          assignment.assessment_type === 'summative' ? 'border-destructive/50 text-destructive' :
                          assignment.assessment_type === 'formative' ? 'border-primary/50 text-primary' :
                          assignment.assessment_type === 'pre_assessment' ? 'border-accent/50 text-accent' :
                          'border-muted-foreground/50 text-muted-foreground'
                        }`}
                      >
                        {assignment.assessment_type === 'pre_assessment' ? 'Pre-Assessment' : 
                         assignment.assessment_type.charAt(0).toUpperCase() + assignment.assessment_type.slice(1)}
                      </Badge>
                    )}
                    {assignment.learning_objectives && assignment.learning_objectives.length > 0 && (
                      <div className="mt-2 flex items-center gap-1">
                        <Target className="w-3 h-3 text-primary" />
                        <span className="text-xs text-primary">
                          {assignment.learning_objectives.length} objectives extracted
                        </span>
                        <Sparkles className="w-3 h-3 text-primary" />
                      </div>
                    )}
                    {/* Difficulty Analysis Section */}
                    {isAnalyzing.has(assignment.id) && (
                      <div className="mt-2 flex items-center gap-1.5">
                        <Loader2 className="w-3 h-3 animate-spin text-primary" />
                        <span className="text-xs text-primary">Analyzing difficulty...</span>
                      </div>
                    )}
                    {assignment.difficulty_level && assignment.irt_parameters && (
                      <div className="mt-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedDifficulty((prev) => {
                              const next = new Set(prev);
                              next.has(assignment.id) ? next.delete(assignment.id) : next.add(assignment.id);
                              return next;
                            });
                          }}
                          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Brain className="w-3 h-3" />
                          <DifficultyBadge level={assignment.difficulty_level} />
                          <span>IRT b={Number(assignment.irt_parameters.difficulty ?? 0).toFixed(1)}</span>
                          <span>·</span>
                          <span>{assignment.irt_parameters.bloomLevel}</span>
                          {expandedDifficulty.has(assignment.id) ? (
                            <ChevronUp className="w-3 h-3" />
                          ) : (
                            <ChevronDown className="w-3 h-3" />
                          )}
                        </button>
                        {expandedDifficulty.has(assignment.id) && (
                          <div className="mt-2 p-3 rounded-lg bg-muted/30 border border-border text-xs space-y-2">
                            <div className="grid grid-cols-3 gap-2">
                              <div>
                                <span className="text-muted-foreground block">Discrimination (a)</span>
                                <span className="font-medium text-foreground">{Number(assignment.irt_parameters.discrimination ?? 0).toFixed(2)}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground block">Difficulty (b)</span>
                                <span className="font-medium text-foreground">{Number(assignment.irt_parameters.difficulty ?? 0).toFixed(2)}</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground block">Guessing (c)</span>
                                <span className="font-medium text-foreground">{Number(assignment.irt_parameters.guessing ?? 0).toFixed(2)}</span>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <span className="text-muted-foreground block">Cognitive Load</span>
                                <span className="font-medium text-foreground">{assignment.irt_parameters.cognitiveLoad}/10</span>
                              </div>
                              <div>
                                <span className="text-muted-foreground block">Est. Time</span>
                                <span className="font-medium text-foreground">{assignment.irt_parameters.estimatedMinutes} min</span>
                              </div>
                            </div>
                            {assignment.knowledge_dependencies && assignment.knowledge_dependencies.length > 0 && (
                              <div>
                                <span className="text-muted-foreground block mb-1">Prerequisites (KST)</span>
                                <div className="flex flex-wrap gap-1">
                                  {assignment.knowledge_dependencies.map((dep, i) => (
                                    <Badge key={i} variant="outline" className="text-[10px] py-0">{dep}</Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                    {!assignment.difficulty_level && !isAnalyzing.has(assignment.id) && assignment.learning_objectives && assignment.learning_objectives.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-1 h-6 text-xs gap-1 text-muted-foreground hover:text-primary"
                        onClick={(e) => { e.stopPropagation(); analyzeDifficulty(assignment.id); }}
                      >
                        <BarChart3 className="w-3 h-3" />
                        Analyze Difficulty
                      </Button>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(assignment)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </Card>
  );
};

function DifficultyBadge({ level }: { level: string }) {
  const styles: Record<string, string> = {
    novice: "bg-green-500/10 text-green-600 border-green-500/30",
    intermediate: "bg-yellow-500/10 text-yellow-600 border-yellow-500/30",
    advanced: "bg-orange-500/10 text-orange-600 border-orange-500/30",
    expert: "bg-red-500/10 text-red-600 border-red-500/30",
  };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${styles[level] || styles.intermediate}`}>
      {level.charAt(0).toUpperCase() + level.slice(1)}
    </span>
  );
}
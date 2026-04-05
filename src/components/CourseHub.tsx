import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  GraduationCap, BookOpen, Archive, ArchiveRestore, ChevronRight, 
  AlertCircle, Loader2, Trash2 
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface UserClass {
  id: string;
  class_name: string;
  professor: string | null;
  semester: string | null;
  year: number | null;
  is_archived: boolean;
}

const MAX_ACTIVE_COURSES = 3;

interface CourseHubProps {
  refreshTrigger?: number;
}

export const CourseHub = ({ refreshTrigger = 0 }: CourseHubProps) => {
  const [classes, setClasses] = useState<UserClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<UserClass | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    fetchClasses();
  }, [refreshTrigger]);

  const fetchClasses = async () => {
    const { data, error } = await supabase
      .from("user_classes")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching classes:", error);
    } else {
      setClasses((data as unknown as UserClass[]) || []);
    }
    setLoading(false);
  };

  const activeCourses = classes.filter((c) => !c.is_archived);
  const archivedCourses = classes.filter((c) => c.is_archived);

  const handleArchive = async (classItem: UserClass) => {
    const { error } = await supabase
      .from("user_classes")
      .update({ is_archived: true } as never)
      .eq("id", classItem.id);

    if (error) {
      toast({ title: "Error", description: "Failed to archive course", variant: "destructive" });
      return;
    }
    toast({ title: "Course archived", description: `${classItem.class_name} has been archived` });
    fetchClasses();
  };

  const handleUnarchive = async (classItem: UserClass) => {
    if (activeCourses.length >= MAX_ACTIVE_COURSES) {
      toast({
        title: "Limit reached",
        description: `You can only have ${MAX_ACTIVE_COURSES} active courses. Archive a course first.`,
        variant: "destructive",
      });
      return;
    }
    const { error } = await supabase
      .from("user_classes")
      .update({ is_archived: false } as never)
      .eq("id", classItem.id);

    if (error) {
      toast({ title: "Error", description: "Failed to restore course", variant: "destructive" });
      return;
    }
    toast({ title: "Course restored", description: `${classItem.class_name} is now active` });
    fetchClasses();
  };

  const handleDeleteCourse = async () => {
    if (!deleteTarget) return;
    const className = deleteTarget.class_name;

    const deletes = [
      supabase.from("user_classes").delete().eq("id", deleteTarget.id),
      supabase.from("syllabi").delete().eq("class_name", className),
      supabase.from("course_content").delete().eq("class_name", className),
      supabase.from("assignments").delete().eq("class_name", className),
      supabase.from("quiz_results").delete().eq("class_name", className),
      supabase.from("study_focus_areas").delete().eq("class_name", className),
      supabase.from("course_textbooks").delete().eq("class_name", className),
      supabase.from("practice_history").delete().eq("class_name", className),
      supabase.from("learning_events").delete().eq("class_name", className),
      supabase.from("weekly_performance_snapshots").delete().eq("class_name", className),
    ];

    const results = await Promise.all(deletes);
    const hasError = results.some((r) => r.error);

    if (hasError) {
      toast({ title: "Error", description: "Some course data could not be deleted", variant: "destructive" });
    } else {
      toast({ title: "Course deleted", description: `${className} and all related data have been permanently removed` });
    }
    setDeleteTarget(null);
    fetchClasses();
  };

  if (loading) {
    return (
      <Card className="p-6 shadow-[var(--shadow-soft)] border-border">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 shadow-[var(--shadow-soft)] border-border">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <GraduationCap className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Course Hub</h3>
            <p className="text-sm text-muted-foreground">
              {activeCourses.length}/{MAX_ACTIVE_COURSES} active courses
            </p>
          </div>
        </div>
        {activeCourses.length >= MAX_ACTIVE_COURSES && (
          <Badge variant="outline" className="text-muted-foreground">
            <AlertCircle className="w-3 h-3 mr-1" />
            Max courses reached — archive one to add more
          </Badge>
        )}
      </div>

      {/* Active Courses */}
      <div className="space-y-3 mb-6">
        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Courses
        </h4>
        {activeCourses.length === 0 ? (
          <div className="text-center py-10 rounded-xl bg-muted/30 border border-dashed border-border">
            <BookOpen className="w-10 h-10 mx-auto mb-3 text-muted-foreground/50" />
            <p className="text-muted-foreground font-medium">No current courses</p>
            <p className="text-sm text-muted-foreground mt-1">
              Upload a syllabus above to add a course
            </p>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            {activeCourses.map((course) => (
              <div
                key={course.id}
                className="group relative p-4 rounded-xl border border-border bg-card hover:border-primary/50 hover:shadow-[var(--shadow-medium)] transition-all cursor-pointer"
                onClick={() => navigate(`/course/${encodeURIComponent(course.class_name)}`)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <BookOpen className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleArchive(course);
                      }}
                      title="Archive course"
                    >
                      <Archive className="w-4 h-4 text-muted-foreground" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget(course);
                      }}
                      title="Delete course"
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                <h4 className="font-semibold text-foreground mb-1 group-hover:text-primary transition-colors">
                  {course.class_name}
                </h4>
                {course.professor && (
                  <p className="text-xs text-muted-foreground mb-1">
                    Prof. {course.professor}
                  </p>
                )}
                {course.semester && course.year && (
                  <Badge variant="secondary" className="text-xs">
                    {course.semester} {course.year}
                  </Badge>
                )}
                <div className="flex items-center gap-1 mt-3 text-xs text-primary font-medium">
                  View Course <ChevronRight className="w-3 h-3" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Archived Courses */}
      {archivedCourses.length > 0 && (
        <div className="pt-6 border-t border-border">
          <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Review Old Courses
          </h4>
          <div className="space-y-2">
            {archivedCourses.map((course) => (
              <div
                key={course.id}
                className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border"
              >
                <div className="flex items-center gap-3">
                  <Archive className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">
                      {course.class_name}
                    </p>
                    {course.semester && course.year && (
                      <p className="text-xs text-muted-foreground/70">
                        {course.semester} {course.year}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      navigate(`/course/${encodeURIComponent(course.class_name)}`)
                    }
                  >
                    Review
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleUnarchive(course)}
                  >
                    <ArchiveRestore className="w-3 h-3 mr-1" />
                    Restore
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDeleteTarget(course)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="w-3 h-3 mr-1" />
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTarget?.class_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Deleting this course will permanently remove all associated data including syllabi, lessons, quizzes, assignments, study plans, practice history, and performance reports. You will not be able to reference anything for this course in the future.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteCourse}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};

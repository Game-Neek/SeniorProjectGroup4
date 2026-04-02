import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Book, Plus, Trash2, Edit2, Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Textbook {
  id: string;
  title: string;
  author: string | null;
  isbn: string | null;
  requirement_type: string;
  source: string;
}

interface CourseTextbooksProps {
  className: string;
}

export const CourseTextbooks = ({ className }: CourseTextbooksProps) => {
  const [textbooks, setTextbooks] = useState<Textbook[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Textbook | null>(null);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [isbn, setIsbn] = useState("");
  const [reqType, setReqType] = useState("required");
  const { toast } = useToast();

  useEffect(() => {
    loadTextbooks();
  }, [className]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.className === className) {
        loadTextbooks();
      }
    };
    window.addEventListener("syllabus-reparsed", handler);
    return () => window.removeEventListener("syllabus-reparsed", handler);
  }, [className]);

  const loadTextbooks = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLoading(false); return; }

    // Fetch existing textbooks from DB
    const { data: existing } = await supabase
      .from("course_textbooks" as any)
      .select("*")
      .eq("user_id", session.user.id)
      .eq("class_name", className)
      .order("created_at", { ascending: true });

    if (existing && (existing as any[]).length > 0) {
      setTextbooks(existing as unknown as Textbook[]);
      setLoading(false);
      return;
    }

    // If none exist, try to extract from syllabus required_materials
    const { data: syllabus } = await supabase
      .from("syllabi")
      .select("required_materials")
      .eq("class_name", className)
      .eq("user_id", session.user.id)
      .order("uploaded_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (syllabus?.required_materials && syllabus.required_materials.length > 0) {
      const toInsert = syllabus.required_materials.map((mat: string) => {
        // Try to detect if "recommended" is mentioned
        const isRecommended = mat.toLowerCase().includes("recommended") || mat.toLowerCase().includes("optional");
        return {
          user_id: session.user.id,
          class_name: className,
          title: mat.replace(/\s*\(recommended\)\s*/gi, "").replace(/\s*\(optional\)\s*/gi, "").trim(),
          requirement_type: isRecommended ? "recommended" : "required",
          source: "parsed",
        };
      });

      const { data: inserted, error } = await supabase
        .from("course_textbooks" as any)
        .insert(toInsert as any)
        .select();

      if (!error && inserted) {
        setTextbooks(inserted as unknown as Textbook[]);
      }
    }

    setLoading(false);
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast({ title: "Title required", variant: "destructive" });
      return;
    }
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    if (editing) {
      const { error } = await supabase
        .from("course_textbooks" as any)
        .update({ title: title.trim(), author: author.trim() || null, isbn: isbn.trim() || null, requirement_type: reqType } as any)
        .eq("id", editing.id);
      if (error) {
        toast({ title: "Failed to update", variant: "destructive" });
        return;
      }
    } else {
      const { error } = await supabase
        .from("course_textbooks" as any)
        .insert({
          user_id: session.user.id,
          class_name: className,
          title: title.trim(),
          author: author.trim() || null,
          isbn: isbn.trim() || null,
          requirement_type: reqType,
          source: "manual",
        } as any);
      if (error) {
        toast({ title: "Failed to add", variant: "destructive" });
        return;
      }
    }

    toast({ title: editing ? "Textbook updated" : "Textbook added" });
    resetDialog();
    loadTextbooks();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("course_textbooks" as any).delete().eq("id", id);
    if (error) {
      toast({ title: "Failed to delete", variant: "destructive" });
      return;
    }
    toast({ title: "Textbook removed" });
    loadTextbooks();
  };

  const startEdit = (tb: Textbook) => {
    setEditing(tb);
    setTitle(tb.title);
    setAuthor(tb.author || "");
    setIsbn(tb.isbn || "");
    setReqType(tb.requirement_type);
    setDialogOpen(true);
  };

  const resetDialog = () => {
    setDialogOpen(false);
    setEditing(null);
    setTitle("");
    setAuthor("");
    setIsbn("");
    setReqType("required");
  };

  if (loading) {
    return (
      <Card className="p-6 border-border shadow-[var(--shadow-soft)]">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 border-border shadow-[var(--shadow-soft)]">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Book className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Course Textbooks</h3>
            <p className="text-sm text-muted-foreground">{textbooks.length} material{textbooks.length !== 1 ? "s" : ""}</p>
          </div>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) resetDialog(); else setDialogOpen(true); }}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="w-4 h-4 mr-1" />
              Add
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Textbook" : "Add Textbook"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Title *</Label>
                <Input placeholder="e.g., Calculus: Early Transcendentals" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Author</Label>
                <Input placeholder="e.g., James Stewart" value={author} onChange={(e) => setAuthor(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>ISBN</Label>
                <Input placeholder="e.g., 978-1285741550" value={isbn} onChange={(e) => setIsbn(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={reqType} onValueChange={setReqType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="required">Required</SelectItem>
                    <SelectItem value="recommended">Recommended</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button className="w-full" onClick={handleSave}>
                {editing ? "Update" : "Add Textbook"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {textbooks.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground">
          <Book className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No textbooks detected</p>
          <p className="text-xs mt-1">Parse your syllabus or add them manually</p>
        </div>
      ) : (
        <div className="space-y-2">
          {textbooks.map((tb) => (
            <div key={tb.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border">
              <div className="flex items-center gap-3 min-w-0">
                <Book className="w-4 h-4 text-primary flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{tb.title}</p>
                  {tb.author && <p className="text-xs text-muted-foreground truncate">{tb.author}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {tb.source === "parsed" && (
                  <span title="Auto-detected from syllabus"><Sparkles className="w-3 h-3 text-primary" /></span>
                )}
                <Badge
                  variant="outline"
                  className={`text-xs capitalize ${
                    tb.requirement_type === "required"
                      ? "border-primary/30 text-primary"
                      : "border-muted-foreground/30 text-muted-foreground"
                  }`}
                >
                  {tb.requirement_type}
                </Badge>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(tb)}>
                  <Edit2 className="w-3 h-3" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(tb.id)}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};

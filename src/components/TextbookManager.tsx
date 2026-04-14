import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Book, Plus, Edit2, Trash2, CheckCircle2, X } from "lucide-react";

interface Textbook {
  id: string;
  syllabus_id: string;
  title: string;
  author: string | null;
  edition: string | null;
  isbn: string | null;
  is_required: boolean;
}

interface TextbookManagerProps {
  syllabusId: string;
}

type TextbookFormState = {
  title: string;
  author: string;
  edition: string;
  isbn: string;
  is_required: boolean;
};

const blankForm = (overrides?: Partial<TextbookFormState>): TextbookFormState => ({
  title: "",
  author: "",
  edition: "",
  isbn: "",
  is_required: false,
  ...overrides,
});

const mapTextbookToForm = (tb: Textbook): TextbookFormState => ({
  title: tb.title ?? "",
  author: tb.author ?? "",
  edition: tb.edition ?? "",
  isbn: tb.isbn ?? "",
  is_required: !!tb.is_required,
});

const toNullableTrimmed = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

export const TextbookManager = ({ syllabusId }: TextbookManagerProps) => {
  const [textbooks, setTextbooks] = useState<Textbook[]>([]);
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const [formData, setFormData] = useState<TextbookFormState>(() => blankForm());

  useEffect(() => {
    fetchTextbooks();
  }, [syllabusId]);

  const fetchTextbooks = async () => {
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!session) {
        setTextbooks([]);
        return;
      }

      const { data, error } = await supabase
        .from("course_textbooks")
        .select("*")
        .eq("syllabus_id", syllabusId)
        .order("is_required", { ascending: false });

      if (error) throw error;
      setTextbooks((data ?? []) as Textbook[]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast({ title: "Error", description: `Failed to load textbooks: ${msg}`, variant: "destructive" });
    }
  };

  const handleSave = async () => {
    if (!formData.title.trim()) {
      toast({ title: "Title Required", description: "Please enter a textbook title", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!session) {
        toast({ title: "Signed out", description: "Please sign in again to save textbooks.", variant: "destructive" });
        return;
      }

      const payload = {
        syllabus_id: syllabusId,
        user_id: session.user.id,
        title: formData.title.trim(),
        author: toNullableTrimmed(formData.author),
        edition: toNullableTrimmed(formData.edition),
        isbn: toNullableTrimmed(formData.isbn),
        is_required: !!formData.is_required,
      };

      if (isEditing) {
        const { error } = await supabase.from("course_textbooks").update(payload).eq("id", isEditing);
        if (error) throw error;
        toast({ title: "Success", description: "Textbook updated" });
        setIsEditing(null);
      } else {
        const { error } = await supabase.from("course_textbooks").insert([payload]);
        if (error) throw error;
        toast({ title: "Success", description: "Textbook added" });
        setIsAdding(false);
      }

      await fetchTextbooks();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast({ title: "Error", description: `Save failed: ${msg}`, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    setIsLoading(true);
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!session) {
        toast({ title: "Signed out", description: "Please sign in again to delete textbooks.", variant: "destructive" });
        return;
      }

      const { error } = await supabase.from("course_textbooks").delete().eq("id", id);
      if (error) throw error;
      toast({ title: "Deleted", description: "Textbook removed" });
      await fetchTextbooks();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast({ title: "Error", description: `Delete failed: ${msg}`, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const startEdit = (tb: Textbook) => {
    setFormData(mapTextbookToForm(tb));
    setIsEditing(tb.id);
    setIsAdding(false);
  };

  const startAdd = () => {
    setFormData(blankForm({ is_required: true }));
    setIsAdding(true);
    setIsEditing(null);
  };

  const cancelForm = () => {
    setFormData(blankForm());
    setIsAdding(false);
    setIsEditing(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-border pb-2">
        <div className="flex items-center gap-2">
          <Book className="w-5 h-5 text-primary" />
          <h4 className="text-lg font-semibold text-foreground">Course Texts & Materials</h4>
        </div>
        {!isAdding && !isEditing && (
          <Button variant="outline" size="sm" onClick={startAdd} className="h-8" disabled={isLoading}>
            <Plus className="w-4 h-4 mr-1" /> Add
          </Button>
        )}
      </div>

      {textbooks.length === 0 && !isAdding && !isEditing ? (
        <div className="text-center p-6 bg-muted/30 rounded-xl border border-dashed border-border text-muted-foreground">
          <p className="text-sm">No textbooks found for this course.</p>
          <Button variant="link" onClick={startAdd} className="mt-2 text-primary p-0 h-auto">Add one manually</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {textbooks.map(tb => (
            isEditing === tb.id ? null : (
              <div key={tb.id} className="p-3 rounded-lg border border-border bg-card shadow-sm flex items-start justify-between group">
                <div className="flex-1 min-w-0 pr-4">
                  <div className="flex items-center gap-2 mb-1">
                    <h5 className="font-semibold text-foreground truncate">{tb.title}</h5>
                    {tb.is_required ? (
                      <Badge variant="default" className="text-[10px] uppercase font-bold tracking-wider">Required</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px] uppercase font-bold tracking-wider">Recommended</Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
                    {tb.author && <span><span className="font-medium mr-1 text-foreground/70">Author:</span>{tb.author}</span>}
                    {tb.edition && <span><span className="font-medium mr-1 text-foreground/70">Edition:</span>{tb.edition}</span>}
                    {tb.isbn && <span><span className="font-medium mr-1 text-foreground/70">ISBN:</span>{tb.isbn}</span>}
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="icon" onClick={() => startEdit(tb)} className="h-8 w-8 text-muted-foreground hover:text-primary">
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(tb.id)}
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    disabled={isLoading}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )
          ))}

          {(isAdding || isEditing) && (
            <Card className="p-4 border-2 border-primary/20 bg-muted/10">
              <h5 className="font-medium text-sm mb-3">{isEditing ? "Edit Textbook" : "Add Textbook"}</h5>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">Title <span className="text-destructive">*</span></Label>
                  <Input 
                    value={formData.title || ""} 
                    onChange={e => setFormData({...formData, title: e.target.value})} 
                    placeholder="e.g. Calculus Early Transcendentals"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Author</Label>
                    <Input 
                      value={formData.author || ""} 
                      onChange={e => setFormData({...formData, author: e.target.value})} 
                      placeholder="e.g. James Stewart"
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Edition</Label>
                    <Input 
                      value={formData.edition || ""} 
                      onChange={e => setFormData({...formData, edition: e.target.value})} 
                      placeholder="e.g. 9th"
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">ISBN</Label>
                  <Input 
                    value={formData.isbn || ""} 
                    onChange={e => setFormData({...formData, isbn: e.target.value})} 
                    placeholder="e.g. 978-1337613927"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="flex items-center space-x-2 pt-1">
                  <Checkbox 
                    id="required" 
                    checked={!!formData.is_required} 
                    onCheckedChange={(c) => setFormData({...formData, is_required: !!c})}
                  />
                  <Label htmlFor="required" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    This textbook is required
                  </Label>
                </div>
                <div className="flex justify-end gap-2 pt-2 border-t border-border mt-3">
                  <Button variant="ghost" size="sm" onClick={cancelForm} disabled={isLoading}>Cancel</Button>
                  <Button size="sm" onClick={handleSave} disabled={isLoading || !formData.title.trim()}>
                    <CheckCircle2 className="w-4 h-4 mr-1" /> {isEditing ? "Save Changes" : "Save"}
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
};

import { useState, useEffect, useCallback, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Book, Plus, Trash2, Edit2, Loader2, Sparkles, Upload, Download, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { validateFile, uploadFile } from "@/lib/uploadEngine";
import type { FileValidationOptions } from "@/lib/uploadEngine";

const TEXTBOOK_VALIDATION: FileValidationOptions = {
  allowedExtensions: [".pdf", ".docx", ".epub", ".txt"],
  maxSizeBytes: 20 * 1024 * 1024,
};

interface Textbook {
  id: string;
  title: string;
  author: string | null;
  isbn: string | null;
  requirement_type: string;
  source: string;
  file_path: string | null;
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
  const [mode, setMode] = useState<"manual" | "upload">("manual");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const validation = validateFile(file, TEXTBOOK_VALIDATION);
    if (!validation.valid) {
      toast({ title: validation.error, variant: "destructive" });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setSelectedFile(file);
    if (!title.trim()) {
      setTitle(file.name.replace(/\.[^.]+$/, "").replace(/[_-]/g, " "));
    }
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
      toast({ title: "Textbook updated" });
    } else if (mode === "upload" && selectedFile) {
      setUploading(true);
      try {
        const { filePath } = await uploadFile("textbooks", session.user.id, selectedFile);
        const { error } = await supabase
          .from("course_textbooks" as any)
          .insert({
            user_id: session.user.id,
            class_name: className,
            title: title.trim(),
            author: author.trim() || null,
            isbn: isbn.trim() || null,
            requirement_type: reqType,
            source: "uploaded",
            file_path: filePath,
          } as any);
        if (error) {
          toast({ title: "Failed to save textbook record", variant: "destructive" });
          setUploading(false);
          return;
        }
        toast({ title: "Textbook uploaded" });
      } catch (err) {
        toast({ title: "Upload failed", description: err instanceof Error ? err.message : String(err), variant: "destructive" });
        setUploading(false);
        return;
      }
      setUploading(false);
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
      toast({ title: "Textbook added" });
    }

    resetDialog();
    loadTextbooks();
  };

  const handleDelete = async (tb: Textbook) => {
    // Delete file from storage if exists
    if (tb.file_path) {
      await supabase.storage.from("textbooks").remove([tb.file_path]);
    }
    const { error } = await supabase.from("course_textbooks" as any).delete().eq("id", tb.id);
    if (error) {
      toast({ title: "Failed to delete", variant: "destructive" });
      return;
    }
    toast({ title: "Textbook removed" });
    loadTextbooks();
  };

  const handleDownload = async (tb: Textbook) => {
    if (!tb.file_path) return;
    const { data, error } = await supabase.storage.from("textbooks").createSignedUrl(tb.file_path, 60);
    if (error || !data?.signedUrl) {
      toast({ title: "Could not generate download link", variant: "destructive" });
      return;
    }
    window.open(data.signedUrl, "_blank");
  };

  const startEdit = (tb: Textbook) => {
    setEditing(tb);
    setTitle(tb.title);
    setAuthor(tb.author || "");
    setIsbn(tb.isbn || "");
    setReqType(tb.requirement_type);
    setMode("manual");
    setDialogOpen(true);
  };

  const resetDialog = () => {
    setDialogOpen(false);
    setEditing(null);
    setTitle("");
    setAuthor("");
    setIsbn("");
    setReqType("required");
    setMode("manual");
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
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

            {!editing && (
              <Tabs value={mode} onValueChange={(v) => setMode(v as "manual" | "upload")} className="mt-2">
                <TabsList className="w-full">
                  <TabsTrigger value="manual" className="flex-1 gap-1.5">
                    <Edit2 className="w-3.5 h-3.5" /> Manual
                  </TabsTrigger>
                  <TabsTrigger value="upload" className="flex-1 gap-1.5">
                    <Upload className="w-3.5 h-3.5" /> Upload File
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="upload" className="space-y-4 pt-2">
                  <div className="space-y-2">
                    <Label>File (.pdf, .docx, .epub, .txt)</Label>
                    <Input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.docx,.epub,.txt"
                      onChange={handleFileSelect}
                    />
                    {selectedFile && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <FileText className="w-3 h-3" />
                        {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(1)} MB)
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label>Title *</Label>
                    <Input placeholder="Auto-filled from filename" value={title} onChange={(e) => setTitle(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Author</Label>
                    <Input placeholder="e.g., James Stewart" value={author} onChange={(e) => setAuthor(e.target.value)} />
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
                  <Button className="w-full" onClick={handleSave} disabled={uploading || !selectedFile}>
                    {uploading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Uploading...</> : "Upload & Save"}
                  </Button>
                </TabsContent>

                <TabsContent value="manual" className="space-y-4 pt-2">
                  <ManualForm title={title} setTitle={setTitle} author={author} setAuthor={setAuthor} isbn={isbn} setIsbn={setIsbn} reqType={reqType} setReqType={setReqType} onSave={handleSave} label="Add Textbook" />
                </TabsContent>
              </Tabs>
            )}

            {editing && (
              <div className="space-y-4 pt-2">
                <ManualForm title={title} setTitle={setTitle} author={author} setAuthor={setAuthor} isbn={isbn} setIsbn={setIsbn} reqType={reqType} setReqType={setReqType} onSave={handleSave} label="Update" />
              </div>
            )}
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
                {tb.file_path && (
                  <Button variant="ghost" size="icon" className="h-7 w-7" title="Download file" onClick={() => handleDownload(tb)}>
                    <Download className="w-3 h-3" />
                  </Button>
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
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(tb)}>
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

function ManualForm({ title, setTitle, author, setAuthor, isbn, setIsbn, reqType, setReqType, onSave, label }: {
  title: string; setTitle: (v: string) => void;
  author: string; setAuthor: (v: string) => void;
  isbn: string; setIsbn: (v: string) => void;
  reqType: string; setReqType: (v: string) => void;
  onSave: () => void; label: string;
}) {
  return (
    <>
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
      <Button className="w-full" onClick={onSave}>{label}</Button>
    </>
  );
}

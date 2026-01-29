import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileText, Trash2, BookOpen, Loader2, CheckCircle } from "lucide-react";

interface Syllabus {
  id: string;
  title: string;
  content: string;
  file_name: string | null;
  uploaded_at: string;
  processed: boolean;
  topics_extracted: string[];
  class_id: string | null;
}

interface UserClass {
  id: string;
  class_name: string;
}

export const SyllabusUpload = () => {
  const [syllabi, setSyllabi] = useState<Syllabus[]>([]);
  const [classes, setClasses] = useState<UserClass[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadTab, setUploadTab] = useState<"text" | "file">("text");
  const [newSyllabus, setNewSyllabus] = useState({
    title: "",
    content: "",
    class_id: "",
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchSyllabi();
    fetchClasses();
  }, []);

  const fetchSyllabi = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data, error } = await supabase
      .from("syllabi")
      .select("*")
      .eq("user_id", session.user.id)
      .order("uploaded_at", { ascending: false });

    if (error) {
      console.error("Error fetching syllabi:", error);
    } else {
      setSyllabi((data || []).map(s => ({
        ...s,
        topics_extracted: Array.isArray(s.topics_extracted) 
          ? (s.topics_extracted as unknown as string[]) 
          : []
      })));
    }
  };

  const fetchClasses = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data, error } = await supabase
      .from("user_classes")
      .select("id, class_name")
      .eq("user_id", session.user.id)
      .order("class_name");

    if (error) {
      console.error("Error fetching classes:", error);
    } else {
      setClasses(data || []);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Read file content
    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      setNewSyllabus(prev => ({
        ...prev,
        title: file.name.replace(/\.[^/.]+$/, ""),
        content: content,
      }));
    };
    reader.readAsText(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setIsLoading(false);
      return;
    }

    const { error } = await supabase.from("syllabi").insert({
      user_id: session.user.id,
      title: newSyllabus.title,
      content: newSyllabus.content,
      class_id: newSyllabus.class_id || null,
      file_name: uploadTab === "file" ? newSyllabus.title : null,
      processed: false,
      topics_extracted: [],
    });

    if (error) {
      toast({
        title: "Error",
        description: "Failed to upload syllabus",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Success",
        description: "Syllabus uploaded! Agent B will analyze it for quiz content.",
      });
      setNewSyllabus({ title: "", content: "", class_id: "" });
      setIsDialogOpen(false);
      fetchSyllabi();
    }
    setIsLoading(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase
      .from("syllabi")
      .delete()
      .eq("id", id);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to delete syllabus",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Deleted",
        description: "Syllabus removed successfully",
      });
      fetchSyllabi();
    }
  };

  return (
    <Card className="p-6 shadow-[var(--shadow-soft)] border-border">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <BookOpen className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Course Syllabi</h3>
            <p className="text-sm text-muted-foreground">Upload syllabi to generate personalized quizzes</p>
          </div>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-[image:var(--gradient-primary)]">
              <Upload className="mr-2 h-4 w-4" />
              Upload Syllabus
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Upload Course Syllabus</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Tabs value={uploadTab} onValueChange={(v) => setUploadTab(v as "text" | "file")}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="text">Paste Text</TabsTrigger>
                  <TabsTrigger value="file">Upload File</TabsTrigger>
                </TabsList>
                <TabsContent value="text" className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">Syllabus Title</Label>
                    <Input
                      id="title"
                      placeholder="e.g., Calculus I - Fall 2025"
                      value={newSyllabus.title}
                      onChange={(e) => setNewSyllabus({ ...newSyllabus, title: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="content">Syllabus Content</Label>
                    <Textarea
                      id="content"
                      placeholder="Paste your syllabus content here..."
                      className="min-h-[200px]"
                      value={newSyllabus.content}
                      onChange={(e) => setNewSyllabus({ ...newSyllabus, content: e.target.value })}
                      required
                    />
                  </div>
                </TabsContent>
                <TabsContent value="file" className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label>Upload File</Label>
                    <div 
                      className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <FileText className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                      <p className="text-sm text-muted-foreground">
                        Click to upload or drag and drop
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Supports .txt, .md, .doc files
                      </p>
                      <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        accept=".txt,.md,.doc,.docx"
                        onChange={handleFileUpload}
                      />
                    </div>
                    {newSyllabus.content && (
                      <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
                        <CheckCircle className="w-4 h-4 text-primary" />
                        <span className="text-sm text-foreground">File loaded: {newSyllabus.title}</span>
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>

              <div className="space-y-2">
                <Label>Link to Class (Optional)</Label>
                <Select
                  value={newSyllabus.class_id}
                  onValueChange={(value) => setNewSyllabus({ ...newSyllabus, class_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a class" />
                  </SelectTrigger>
                  <SelectContent>
                    {classes.map((cls) => (
                      <SelectItem key={cls.id} value={cls.id}>
                        {cls.class_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button type="submit" className="w-full bg-[image:var(--gradient-primary)]" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Upload Syllabus
                  </>
                )}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {syllabi.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No syllabi uploaded yet</p>
          <p className="text-sm mt-1">Upload a syllabus to start generating personalized quizzes</p>
        </div>
      ) : (
        <div className="space-y-3">
          {syllabi.map((syllabus) => (
            <div 
              key={syllabus.id} 
              className="flex items-start justify-between p-4 rounded-xl bg-muted/50 border border-border"
            >
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-primary" />
                  <h4 className="font-medium text-foreground">{syllabus.title}</h4>
                  {syllabus.processed ? (
                    <Badge variant="secondary" className="text-xs">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Processed
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs">Pending</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {syllabus.content.substring(0, 150)}...
                </p>
                <p className="text-xs text-muted-foreground">
                  Uploaded {new Date(syllabus.uploaded_at).toLocaleDateString()}
                </p>
                {syllabus.topics_extracted.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {syllabus.topics_extracted.slice(0, 5).map((topic, i) => (
                      <Badge key={i} variant="outline" className="text-xs">
                        {topic}
                      </Badge>
                    ))}
                    {syllabus.topics_extracted.length > 5 && (
                      <Badge variant="outline" className="text-xs">
                        +{syllabus.topics_extracted.length - 5} more
                      </Badge>
                    )}
                  </div>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleDelete(syllabus.id)}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};

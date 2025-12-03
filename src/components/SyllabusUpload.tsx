import { useState, useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Upload, FileText, Trash2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Syllabus {
  id: string;
  class_name: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  uploaded_at: string;
}

interface SyllabusUploadProps {
  onUploadComplete?: () => void;
}

export const SyllabusUpload = ({ onUploadComplete }: SyllabusUploadProps) => {
  const [syllabi, setSyllabi] = useState<Syllabus[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [className, setClassName] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const getCurrentSemester = () => {
    const month = new Date().getMonth();
    if (month >= 0 && month <= 4) return "Spring";
    if (month >= 5 && month <= 7) return "Summer";
    return "Fall";
  };

  useEffect(() => {
    fetchSyllabi();
  }, []);

  const fetchSyllabi = async () => {
    const { data, error } = await supabase
      .from("syllabi")
      .select("*")
      .order("uploaded_at", { ascending: false });

    if (error) {
      console.error("Error fetching syllabi:", error);
      return;
    }
    setSyllabi(data || []);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleSubmit = async () => {
    if (!selectedFile) {
      toast({
        title: "No file selected",
        description: "Please select a syllabus file to upload",
        variant: "destructive",
      });
      return;
    }

    if (!className.trim()) {
      toast({
        title: "Class name required",
        description: "Please enter a class name before uploading",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const filePath = `${user.id}/${Date.now()}-${selectedFile.name}`;

      // Upload file to storage
      const { error: uploadError } = await supabase.storage
        .from("syllabi")
        .upload(filePath, selectedFile);

      if (uploadError) throw uploadError;

      // Save metadata to database
      const { error: dbError } = await supabase.from("syllabi").insert({
        user_id: user.id,
        class_name: className.trim(),
        file_name: selectedFile.name,
        file_path: filePath,
        file_size: selectedFile.size,
      });

      if (dbError) throw dbError;

      // Also create a class entry if it doesn't exist
      const { data: existingClass } = await supabase
        .from("user_classes")
        .select("id")
        .eq("user_id", user.id)
        .eq("class_name", className.trim())
        .maybeSingle();

      if (!existingClass) {
        await supabase.from("user_classes").insert({
          user_id: user.id,
          class_name: className.trim(),
          semester: getCurrentSemester(),
          year: new Date().getFullYear(),
        });
      }

      toast({
        title: "Syllabus uploaded",
        description: `${selectedFile.name} has been uploaded successfully`,
      });

      setClassName("");
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      fetchSyllabi();
      onUploadComplete?.();
    } catch (error) {
      console.error("Upload error:", error);
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Failed to upload syllabus",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (syllabus: Syllabus) => {
    try {
      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from("syllabi")
        .remove([syllabus.file_path]);

      if (storageError) throw storageError;

      // Delete from database
      const { error: dbError } = await supabase
        .from("syllabi")
        .delete()
        .eq("id", syllabus.id);

      if (dbError) throw dbError;

      toast({
        title: "Syllabus deleted",
        description: `${syllabus.file_name} has been removed`,
      });

      fetchSyllabi();
    } catch (error) {
      console.error("Delete error:", error);
      toast({
        title: "Delete failed",
        description: "Failed to delete syllabus",
        variant: "destructive",
      });
    }
  };

  const handleDownload = async (syllabus: Syllabus) => {
    const { data, error } = await supabase.storage
      .from("syllabi")
      .download(syllabus.file_path);

    if (error) {
      toast({
        title: "Download failed",
        description: "Failed to download syllabus",
        variant: "destructive",
      });
      return;
    }

    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = syllabus.file_name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "Unknown size";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Card className="p-6 shadow-[var(--shadow-soft)] border-border">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg bg-primary/10">
          <FileText className="w-6 h-6 text-primary" />
        </div>
        <h3 className="text-lg font-semibold text-foreground">Class Syllabi</h3>
      </div>

      {/* Upload Form */}
      <div className="space-y-4 mb-6 p-4 rounded-xl bg-muted/30 border border-border">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="className">Class Name</Label>
            <Input
              id="className"
              placeholder="e.g., Calculus II"
              value={className}
              onChange={(e) => setClassName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="syllabus">Syllabus File (PDF)</Label>
            <Input
              id="syllabus"
              type="file"
              accept=".pdf,.doc,.docx"
              ref={fileInputRef}
              onChange={handleFileSelect}
              disabled={isUploading}
              className="file:mr-4 file:py-1 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
            />
          </div>
        </div>
        {selectedFile && (
          <p className="text-sm text-muted-foreground">
            Selected: {selectedFile.name}
          </p>
        )}
        <Button 
          onClick={handleSubmit} 
          disabled={isUploading || !selectedFile || !className.trim()}
          className="w-full md:w-auto"
        >
          {isUploading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
              Uploading...
            </>
          ) : (
            <>
              <Upload className="w-4 h-4 mr-2" />
              Upload Syllabus
            </>
          )}
        </Button>
      </div>

      {/* Uploaded Syllabi List */}
      <div className="space-y-3">
        {syllabi.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Upload className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p>No syllabi uploaded yet</p>
            <p className="text-sm">Upload your class syllabi to help Agent B understand your courses</p>
          </div>
        ) : (
          syllabi.map((syllabus) => (
            <div
              key={syllabus.id}
              className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border"
            >
              <div className="flex items-center gap-3 min-w-0">
                <FileText className="w-5 h-5 text-primary flex-shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium text-foreground truncate">{syllabus.class_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{syllabus.file_name}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Badge variant="secondary" className="text-xs">
                  {formatFileSize(syllabus.file_size)}
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDownload(syllabus)}
                >
                  View
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDelete(syllabus)}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
};

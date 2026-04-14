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
import { Upload, FileText, Trash2, BookOpen, Loader2, CheckCircle, Sparkles, Archive, ArrowRight, X, AlertTriangle } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import { useNavigate } from "react-router-dom";
// @ts-expect-error mammoth browser subpath has no local TS declaration in this setup
import mammoth from "mammoth/mammoth.browser";
// @ts-expect-error Vite ?url import provides resolved worker path at runtime
import pdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

interface Syllabus {
  id: string;
  title: string;
  content: string;
  file_name: string | null;
  uploaded_at: string;
  processed: boolean;
  topics_extracted: string[];
  class_id: string | null;
  is_archived: boolean;
}

interface UserClass {
  id: string;
  class_name: string;
}

export const SyllabusUpload = () => {
  const SUPPORTED_FILE_EXTENSIONS = new Set(["txt", "md", "docx", "pdf"]);
  const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

  const [syllabi, setSyllabi] = useState<Syllabus[]>([]);
  const [classes, setClasses] = useState<UserClass[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [parsingSyllabusId, setParsingSyllabusId] = useState<string | null>(null);
  const [uploadTab, setUploadTab] = useState<"text" | "file">("text");
  const [confirmSyllabusId, setConfirmSyllabusId] = useState<string | null>(null);
  const [confirmCourseName, setConfirmCourseName] = useState("");
  const [parseElapsed, setParseElapsed] = useState(0);
  const parseAbortRef = useRef<AbortController | null>(null);
  const parseTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [newSyllabus, setNewSyllabus] = useState({
    title: "",
    content: "",
    class_id: "",
  });
  const [uploadedFileName, setUploadedFileName] = useState("");
  const [isDragActive, setIsDragActive] = useState(false);
  const [confirmLowQualityExtraction, setConfirmLowQualityExtraction] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

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

  const readTextFile = async (file: File): Promise<string> => {
    const reader = new FileReader();
    return new Promise((resolve, reject) => {
      reader.onload = (event) => resolve(event.target?.result as string);
      reader.onerror = (error) => reject(error);
      reader.readAsText(file);
    });
  };

  const normalizeExtractedText = (text: string): string => {
    return text
      .split("\0")
      .join("")
      .split("\n")
      .map(line => line.trimEnd())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  };

  const extractRawTextFromFile = async (file: File): Promise<string> => {
    const fileType = file.name.split(".").pop()?.toLowerCase();

    if (!fileType || !SUPPORTED_FILE_EXTENSIONS.has(fileType)) {
      throw new Error("Unsupported file type. Please upload .txt, .md, .docx, or .pdf.");
    }

    if (file.size > MAX_UPLOAD_SIZE_BYTES) {
      throw new Error("File is too large. Please upload a file smaller than 10MB.");
    }

    if (fileType === "pdf") {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = "";

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();

        // Preserve basic structure signals:
        // - line breaks (group PDF text items by similar Y position)
        // - "heading" candidates (approximate heading-ness via text item height)
        const items = textContent.items as Array<{
          str?: string;
          transform?: number[];
          height?: number;
        }>;

        const heights = items
          .map((it) => (typeof it.height === "number" ? it.height : null))
          .filter((v): v is number => v !== null)
          .sort((a, b) => a - b);
        const medianHeight =
          heights.length > 0 ? heights[Math.floor(heights.length / 2)] : 0;

        const yThreshold = medianHeight > 0 ? medianHeight * 0.6 : 3;
        const headingThreshold = medianHeight > 0 ? medianHeight * 1.25 : 0;

        const lines: Array<{ y: number; maxHeight: number; parts: string[] }> = [];
        let current: { y: number; maxHeight: number; parts: string[] } | null = null;

        for (const item of items) {
          const str = item.str ?? "";
          if (!str.trim()) continue;

          const y = item.transform?.[5];
          const h = typeof item.height === "number" ? item.height : 0;
          if (typeof y !== "number") continue;

          if (!current) {
            current = { y, maxHeight: h, parts: [str] };
            continue;
          }

          if (Math.abs(y - current.y) <= yThreshold) {
            current.maxHeight = Math.max(current.maxHeight, h);
            current.parts.push(str);
          } else {
            lines.push(current);
            current = { y, maxHeight: h, parts: [str] };
          }
        }
        if (current) lines.push(current);

        const pageText = lines
          .map((line) => {
            const isHeading = headingThreshold > 0 ? line.maxHeight >= headingThreshold : false;
            const prefix = isHeading ? "[[HEADING]] " : "";
            return prefix + line.parts.join(" ");
          })
          .join("\n");

        fullText += pageText + "\n";
      }
      return normalizeExtractedText(fullText);
    }

    if (fileType === "docx") {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      return normalizeExtractedText(result.value || "");
    }

    const rawText = await readTextFile(file);
    return normalizeExtractedText(rawText);
  };

  const analyzeExtractedTextQuality = (text: string) => {
    const alphanumericChars = (text.match(/[a-zA-Z0-9]/g) || []).length;
    const nonWhitespaceChars = (text.match(/\S/g) || []).length;
    const noiseRatio = nonWhitespaceChars === 0 ? 1 : 1 - (alphanumericChars / nonWhitespaceChars);
    const isTooShort = text.length < 300;
    const isLikelyNoisy = noiseRatio > 0.45;
    const looksLowQuality = isTooShort || isLikelyNoisy;

    let reason = "";
    if (isTooShort) {
      reason = "Very little text was extracted. The source may be image-based or scanned.";
    } else if (isLikelyNoisy) {
      reason = "Extracted text appears noisy. Please verify formatting before upload.";
    }

    return {
      looksLowQuality,
      reason,
      noiseRatio,
    };
  };

  const processUploadedFile = async (file: File) => {
    const title = file.name.replace(/\.[^/.]+$/, "");

    try {
      const content = await extractRawTextFromFile(file);
      if (!content) {
        throw new Error("No text could be extracted from this file.");
      }

      setUploadedFileName(file.name);
      setConfirmLowQualityExtraction(false);
      setNewSyllabus(prev => ({
        ...prev,
        title,
        content,
      }));
      toast({
        title: "File Loaded",
        description: "Raw text extracted successfully.",
      });
    } catch (err) {
      console.error("Error reading file:", err);
      const errMsg = err instanceof Error ? err.message : "Unknown error";
      toast({
        title: "File Read Error",
        description: `Could not read the uploaded file: ${errMsg}`,
        variant: "destructive",
      });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processUploadedFile(file);
    e.target.value = "";
  };

  const handleDropZoneDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragActive(true);
  };

  const handleDropZoneDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragActive(false);
  };

  const handleDropZoneDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    await processUploadedFile(file);
  };

  const parseSyllabus = async (syllabusId: string) => {
    setParsingSyllabusId(syllabusId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase.functions.invoke("parse-syllabus", {
        body: { syllabusId },
      });

      if (error) throw error;
      if (data && typeof data === "object" && "success" in data && (data as { success?: boolean }).success === false) {
        const parseError = (data as { error?: string }).error || "Unknown parser error";
        throw new Error(parseError);
      }
      if (data && typeof data === "object" && "warning" in data) {
        const parsed = data as {
          warning?: string;
          fallback_layout_type?: string;
          inserted_topic_count?: number;
            fallback_debug_summary?: string;
          fallback_preview?: Array<{ title: string; week_number: number | null; module_title: string | null }>;
        };
        const preview = parsed.fallback_preview?.slice(0, 3) ?? [];
        const previewText = preview
          .map((t) => {
            const week = typeof t.week_number === "number" ? `Week ${t.week_number}` : "";
            const mod = t.module_title ? t.module_title : "";
            const prefix = [week, mod].filter(Boolean).join(" · ");
            return prefix ? `${prefix}: ${t.title}` : t.title;
          })
          .join("; ");
        toast({
          title: "Parsed with fallback",
          description: `${parsed.warning || "Used fallback parser."}${
            parsed.fallback_layout_type ? ` (layout: ${parsed.fallback_layout_type})` : ""
          }${typeof parsed.inserted_topic_count === "number" ? ` — Inserted topics: ${parsed.inserted_topic_count}` : ""}${
            parsed.fallback_debug_summary ? ` — Debug: ${parsed.fallback_debug_summary}` : ""
          }${
            previewText ? ` — Preview: ${previewText}` : ""
          }`,
        });
      }

      toast({
        title: "Topics Extracted!",
        description: `Successfully extracted topics and events from the syllabus.`,
      });
      fetchSyllabi();
      // Open the confirmation dialog with the syllabus ID and default title
      const titleToConfirm = newSyllabus.title || "Untitled Course";
      setConfirmCourseName(titleToConfirm);
      setConfirmSyllabusId(syllabusId);
    } catch (err) {
      console.error("Parse error:", err);
      const errMsg = err instanceof Error ? err.message : "Unknown error";
      toast({
        title: "Parsing Failed",
        description: `Could not extract topics: ${errMsg}. You can retry later.`,
        variant: "destructive",
      });
    } finally {
      setParsingSyllabusId(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setIsLoading(false);
      return;
    }

    const activeCoursesCount = syllabi.filter(s => !s.is_archived).length;
    if (activeCoursesCount >= 3) {
      toast({
        title: "Upload Limit Reached",
        description: "You've reached the maximum limit of 3 active courses. Please archive a course before uploading a new one.",
        variant: "destructive",
      });
      setIsLoading(false);
      return;
    }

    const isDuplicate = syllabi.some(s => 
      s.title.toLowerCase().trim() === newSyllabus.title.toLowerCase().trim() || 
      (s.content && newSyllabus.content && s.content.trim() === newSyllabus.content.trim()) ||
      (uploadTab === "file" && uploadedFileName && s.file_name === uploadedFileName)
    );

    if (isDuplicate) {
      toast({
        title: "Duplicate Syllabus Detected",
        description: "This syllabus (either by name, file, or content) has already been uploaded.",
        variant: "destructive",
      });
      setIsLoading(false);
      return;
    }

    // Save the title before we clear form state
    const savedTitle = newSyllabus.title;

    const { data, error } = await supabase.from("syllabi").insert({
      user_id: session.user.id,
      title: newSyllabus.title,
      content: newSyllabus.content,
      class_id: null,
      file_name: uploadTab === "file" ? uploadedFileName || null : null,
      processed: false,
      topics_extracted: [],
    }).select().single();

    if (error) {
      toast({
        title: "Error",
        description: "Failed to upload syllabus",
        variant: "destructive",
      });
      setIsLoading(false);
      return;
    }

    toast({
      title: "Success",
      description: "Syllabus uploaded! Parsing topics in background...",
    });
    setNewSyllabus({ title: "", content: "", class_id: "" });
    setUploadedFileName("");
    setConfirmLowQualityExtraction(false);
    setIsDialogOpen(false);
    fetchSyllabi();
    setIsLoading(false);

    // Trigger AI parsing in the background — uses savedTitle for the confirm dialog
    if (data?.id) {
      const abortController = new AbortController();
      parseAbortRef.current = abortController;
      setParsingSyllabusId(data.id);
      setParseElapsed(0);
      parseTimerRef.current = setInterval(() => setParseElapsed(prev => prev + 1), 1000);

      try {
        const { data: parseData, error: parseError } = await supabase.functions.invoke("parse-syllabus", {
          body: { syllabusId: data.id },
        });
        if (abortController.signal.aborted) return;
        if (parseError) throw parseError;
        if (
          parseData &&
          typeof parseData === "object" &&
          "success" in parseData &&
          (parseData as { success?: boolean }).success === false
        ) {
          throw new Error((parseData as { error?: string }).error || "Unknown parser error");
        }
        if (parseData && typeof parseData === "object" && "warning" in parseData) {
          const parsed = parseData as {
            warning?: string;
            fallback_layout_type?: string;
            inserted_topic_count?: number;
            fallback_debug_summary?: string;
            fallback_preview?: Array<{ title: string; week_number: number | null; module_title: string | null }>;
          };
          const preview = parsed.fallback_preview?.slice(0, 3) ?? [];
          const previewText = preview
            .map((t) => {
              const week = typeof t.week_number === "number" ? `Week ${t.week_number}` : "";
              const mod = t.module_title ? t.module_title : "";
              const prefix = [week, mod].filter(Boolean).join(" · ");
              return prefix ? `${prefix}: ${t.title}` : t.title;
            })
            .join("; ");
          toast({
            title: "Parsed with fallback",
            description: `${parsed.warning || "Used fallback parser."}${
              parsed.fallback_layout_type ? ` (layout: ${parsed.fallback_layout_type})` : ""
            }${typeof parsed.inserted_topic_count === "number" ? ` — Inserted topics: ${parsed.inserted_topic_count}` : ""}${
              parsed.fallback_debug_summary ? ` — Debug: ${parsed.fallback_debug_summary}` : ""
            }${
              previewText ? ` — Preview: ${previewText}` : ""
            }`,
          });
        }
        toast({ title: "Topics Extracted!", description: "Successfully parsed your syllabus." });
        fetchSyllabi();
        setConfirmCourseName(savedTitle || "Untitled Course");
        setConfirmSyllabusId(data.id);
      } catch (err) {
        if (abortController.signal.aborted) return;
        console.error("Parse error:", err);
        const errMsg = err instanceof Error ? err.message : "Unknown error";
        toast({ title: "Parsing Issue", description: `Could not auto-extract topics: ${errMsg}. You can retry from the course page.`, variant: "destructive" });
        fetchSyllabi();
      } finally {
        setParsingSyllabusId(null);
        setParseElapsed(0);
        if (parseTimerRef.current) clearInterval(parseTimerRef.current);
        parseAbortRef.current = null;
      }
    }
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
      fetchSyllabi();
    }
  };

  const handleArchive = async (id: string, isArchived: boolean) => {
    const { error } = await supabase
      .from("syllabi")
      .update({ is_archived: isArchived })
      .eq("id", id);
      
    if (error) {
      toast({ title: "Error", description: `Failed to ${isArchived ? 'archive' : 'unarchive'} course`, variant: "destructive" });
    } else {
      toast({ title: "Success", description: `Course ${isArchived ? 'archived' : 'unarchived'} successfully` });
      fetchSyllabi();
    }
  };

  const handleConfirmCourse = async () => {
    if (!confirmSyllabusId) return;
    setIsLoading(true);
    const { error } = await supabase
      .from("syllabi")
      .update({ title: confirmCourseName })
      .eq("id", confirmSyllabusId);

    if (error) {
      toast({ title: "Error", description: "Failed to confirm course", variant: "destructive" });
    } else {
      toast({ title: "Success", description: "Course created successfully!" });
      setConfirmSyllabusId(null);
      fetchSyllabi();
    }
    setIsLoading(false);
  };

  const handleDiscardCourse = async () => {
    if (confirmSyllabusId) {
      await handleDelete(confirmSyllabusId);
      setConfirmSyllabusId(null);
    }
  };

  const activeSyllabiCount = syllabi.filter(s => !s.is_archived).length;
  const isUploadDisabled = activeSyllabiCount >= 3;
  const extractedTextQuality = analyzeExtractedTextQuality(newSyllabus.content);

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
        <div className="flex flex-col items-end gap-2">
          <Dialog open={isDialogOpen} onOpenChange={(open) => {
            if (open && isUploadDisabled) {
              toast({
                title: "Upload Limit Reached",
                description: "You've reached the maximum limit of 3 active courses. Please archive an older course before uploading a new one.",
                variant: "destructive",
              });
              return;
            }
            setIsDialogOpen(open);
          }}>
            <DialogTrigger asChild>
              <Button className="bg-[image:var(--gradient-primary)]" disabled={isUploadDisabled}>
                <Upload className="mr-2 h-4 w-4" />
                Upload Syllabus
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Upload Course Syllabus</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <Tabs value={uploadTab} onValueChange={(v) => {
                setUploadTab(v as "text" | "file");
                if (v === "text") {
                  setUploadedFileName("");
                  setConfirmLowQualityExtraction(false);
                }
              }}>
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
                      className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                        isDragActive
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      }`}
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={handleDropZoneDragOver}
                      onDragLeave={handleDropZoneDragLeave}
                      onDrop={handleDropZoneDrop}
                    >
                      <FileText className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
                      <p className="text-sm text-muted-foreground">
                        Click to upload or drag and drop
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Supports .txt, .md, .docx, .pdf files (max 10MB)
                      </p>
                      <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        accept=".txt,.md,.docx,.pdf"
                        onChange={handleFileUpload}
                      />
                    </div>
                    {newSyllabus.content && (
                      <div className="space-y-2 p-3 bg-muted/50 rounded-lg">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 text-primary" />
                            <span className="text-sm text-foreground">File loaded: {uploadedFileName || newSyllabus.title}</span>
                          </div>
                          <span className="text-xs text-muted-foreground">{newSyllabus.content.length} chars extracted</span>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Raw Text Preview</Label>
                          <Textarea
                            value={newSyllabus.content.slice(0, 1200)}
                            className="min-h-[120px] text-xs bg-background"
                            readOnly
                          />
                          {newSyllabus.content.length > 1200 && (
                            <p className="text-[11px] text-muted-foreground">Preview truncated to first 1,200 characters.</p>
                          )}
                        </div>
                        {extractedTextQuality.looksLowQuality && (
                          <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 space-y-2">
                            <div className="flex items-start gap-2">
                              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5" />
                              <p className="text-xs text-amber-800">
                                {extractedTextQuality.reason}
                              </p>
                            </div>
                            <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                              <input
                                type="checkbox"
                                checked={confirmLowQualityExtraction}
                                onChange={(e) => setConfirmLowQualityExtraction(e.target.checked)}
                              />
                              I reviewed the extracted text and want to continue anyway.
                            </label>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>

              <Button
                type="submit"
                className="w-full bg-[image:var(--gradient-primary)]"
                disabled={
                  isLoading ||
                  !newSyllabus.content.trim() ||
                  !newSyllabus.title.trim() ||
                  (uploadTab === "file" &&
                    extractedTextQuality.looksLowQuality &&
                    !confirmLowQualityExtraction)
                }
              >
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
      </div>
      
      {/* Pending Syllabi Section (Processing) */}
      {syllabi.filter(s => !s.processed).length > 0 && (
        <div className="space-y-3 mb-6 bg-muted/30 p-4 rounded-xl border border-dashed border-border">
          <h4 className="text-sm font-semibold text-muted-foreground mb-2">Processing Course Documents</h4>
          {syllabi.filter(s => !s.processed).map(syllabus => (
            <div key={syllabus.id} className="p-3 rounded-lg bg-card border border-border space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {parsingSyllabusId === syllabus.id ? (
                    <Loader2 className="w-4 h-4 text-primary animate-spin" />
                  ) : (
                    <FileText className="w-4 h-4 text-muted-foreground" />
                  )}
                  <span className="text-sm font-medium">{syllabus.title}</span>
                  {parsingSyllabusId === syllabus.id && parseElapsed > 0 && (
                    <span className="text-xs text-muted-foreground">({parseElapsed}s)</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {parsingSyllabusId === syllabus.id ? (
                    <Button variant="outline" size="sm" className="h-7 text-xs text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => {
                      if (parseAbortRef.current) parseAbortRef.current.abort();
                      setParsingSyllabusId(null);
                      setParseElapsed(0);
                      if (parseTimerRef.current) clearInterval(parseTimerRef.current);
                      toast({ title: "Parsing Cancelled", description: "You can retry parsing later from the course page." });
                    }}>
                      <X className="w-3 h-3 mr-1" /> Cancel
                    </Button>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={() => parseSyllabus(syllabus.id)} className="h-8">
                      <Sparkles className="w-3 h-3 mr-1" /> Retry Parsing
                    </Button>
                  )}
                </div>
              </div>
              {parsingSyllabusId === syllabus.id && parseElapsed >= 10 && (
                <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded-md">
                  ⏳ Parsing is taking longer than expected. This can happen with large syllabi or when the AI service is under heavy load. You can cancel and retry later.
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="space-y-8">
        {/* Active Courses */}
        <div>
          <h3 className="text-lg font-semibold mb-4 text-foreground">Active Courses</h3>
          
          {activeSyllabiCount === 0 ? (
            <div className="text-center py-8 bg-muted/10 rounded-xl border border-dashed border-border text-muted-foreground">
              <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-20 text-foreground" />
              <p className="font-medium text-foreground">No current courses</p>
              <p className="text-sm mt-1">Upload a syllabus to create your first course.</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {syllabi.filter(s => !s.is_archived && s.processed).map(course => (
                <Card key={course.id} className="flex flex-col overflow-hidden border-border shadow-sm hover:shadow-md transition-shadow cursor-pointer group" onClick={() => navigate(`/course/${course.id}`)}>
                  <div className="p-5 flex-1 space-y-3">
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="p-1.5 rounded-lg bg-primary/10 shrink-0">
                          <BookOpen className="w-4 h-4 text-primary" />
                        </div>
                        <h4 className="font-bold text-base leading-tight text-foreground truncate">{course.title}</h4>
                      </div>
                      <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleArchive(course.id, true); }} className="h-6 w-6 text-muted-foreground hover:text-orange-500 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" title="Archive Course">
                        <Archive className="w-3.5 h-3.5" />
                      </Button>
                    </div>

                    <p className="text-xs text-muted-foreground">
                      Uploaded {new Date(course.uploaded_at).toLocaleDateString()}
                    </p>

                    {course.topics_extracted.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {course.topics_extracted.slice(0, 3).map((topic, i) => (
                          <Badge key={i} variant="secondary" className="text-[10px]">{topic}</Badge>
                        ))}
                        {course.topics_extracted.length > 3 && (
                          <Badge variant="outline" className="text-[10px]">+{course.topics_extracted.length - 3} more</Badge>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="p-3 bg-muted/30 border-t border-border mt-auto">
                    <Button
                      className="w-full h-8 text-xs font-semibold"
                      onClick={(e) => { e.stopPropagation(); navigate(`/course/${course.id}`); }}
                    >
                      Open Course
                      <ArrowRight className="w-3 h-3 ml-1" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Archived Courses */}
        {syllabi.filter(s => s.is_archived).length > 0 && (
          <div className="pt-6 border-t border-border">
            <h3 className="text-lg font-semibold mb-4 text-foreground">Archived Courses</h3>
            <div className="space-y-2">
              {syllabi.filter(s => s.is_archived).map(course => (
                <div key={course.id} className="flex items-center justify-between p-3 rounded-lg bg-card border border-border group hover:bg-muted/50 transition-colors">
                  <span className="text-sm font-medium text-muted-foreground group-hover:text-foreground">{course.title}</span>
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="sm" onClick={() => handleArchive(course.id, false)} className="h-7 text-xs">
                      Unarchive
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => navigate(`/course/${course.id}`)} className="h-7 text-xs text-primary">
                      Review Old Course <ArrowRight className="w-3 h-3 ml-1" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={!!confirmSyllabusId} onOpenChange={(open) => {
        if (!open) handleDiscardCourse();
      }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Confirm Course Details</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="confirmCourseName">Course Name</Label>
              <Input 
                id="confirmCourseName" 
                value={confirmCourseName} 
                onChange={(e) => setConfirmCourseName(e.target.value)} 
                placeholder="Name your course..."
              />
            </div>
            <p className="text-sm text-muted-foreground">
              We've successfully extracted the syllabus dates, textbooks, and topics. Please review the course name above and confirm to create your dedicated course workspace.
            </p>
          </div>
          <div className="flex justify-end gap-3 mt-6">
            <Button variant="outline" onClick={handleDiscardCourse} disabled={isLoading}>
              Discard
            </Button>
            <Button onClick={handleConfirmCourse} disabled={isLoading || !confirmCourseName.trim()}>
              Confirm & Create Course
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

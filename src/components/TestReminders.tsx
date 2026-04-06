import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Bell, Calendar, Plus, Loader2, Sparkles, Clock, AlertTriangle, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format, differenceInDays, isPast, isToday } from "date-fns";

interface TestEvent {
  id: string;
  title: string;
  event_date: string;
  event_type: string;
  description: string | null;
  start_time: string | null;
}

interface Syllabus {
  id: string;
  class_name: string;
  file_path: string;
}

export const TestReminders = () => {
  const [tests, setTests] = useState<TestEvent[]>([]);
  const [syllabi, setSyllabi] = useState<Syllabus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isAddingManually, setIsAddingManually] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [manualForm, setManualForm] = useState({
    title: "",
    date: "",
    time: "",
    className: "",
    description: "",
  });
  const { toast } = useToast();

  useEffect(() => {
    fetchTests();
    fetchSyllabi();
  }, []);

  const fetchTests = async () => {
    setIsLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setIsLoading(false); return; }

    // Fetch only exam-type calendar events
    const examTypes = ["exam", "test", "quiz", "midterm", "final"];
    const { data, error } = await supabase
      .from("calendar_events")
      .select("*")
      .eq("user_id", session.user.id)
      .in("event_type", examTypes)
      .order("event_date", { ascending: true });

    if (error) {
      console.error("Error fetching tests:", error);
    } else {
      setTests(data || []);
    }
    setIsLoading(false);
  };

  const fetchSyllabi = async () => {
    const { data, error } = await supabase
      .from("syllabi")
      .select("id, class_name, file_path");

    if (!error && data) {
      setSyllabi(data);
    }
  };

  const extractTestsFromSyllabus = async (syllabusId: string) => {
    setIsExtracting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const syllabus = syllabi.find(s => s.id === syllabusId);
      if (!syllabus) throw new Error("Syllabus not found");

      // Download syllabus content
      const { data: fileData, error: downloadError } = await supabase.storage
        .from("syllabi")
        .download(syllabus.file_path);

      if (downloadError) throw downloadError;

      // Convert to text (for PDF, we'll send to AI to extract)
      const text = await fileData.text();

      // Call AI to extract test dates
      const { data, error } = await supabase.functions.invoke("agent-b-chat", {
        body: {
          messages: [
            {
              role: "user",
              content: `Extract all test, exam, quiz, midterm, and final exam dates from this syllabus for ${syllabus.class_name}. Return ONLY a JSON array of objects with fields: title, date (YYYY-MM-DD format), time (HH:MM format or null), description. If no dates found, return empty array. Here's the content:\n\n${text.substring(0, 8000)}`,
            },
          ],
          requestType: "extract-tests",
          learningStyles: [],
        },
      });

      if (error) throw error;

      // Parse the response
      let extractedTests: Array<{ title: string; date: string; time?: string; description?: string }> = [];
      try {
        const responseText = typeof data === "string" ? data : data.content || data.response || "";
        const jsonMatch = responseText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          extractedTests = JSON.parse(jsonMatch[0]);
        }
      } catch (parseError) {
        console.error("Failed to parse AI response:", parseError);
      }

      if (extractedTests.length === 0) {
        toast({
          title: "No tests found",
          description: "Could not extract any test dates from this syllabus. Try adding them manually.",
        });
        return;
      }

      // Save extracted tests to calendar
      let addedCount = 0;
      for (const test of extractedTests) {
        if (!test.date || !test.title) continue;

        const { error: insertError } = await supabase.from("calendar_events").insert({
          user_id: user.id,
          title: `${syllabus.class_name}: ${test.title}`,
          event_date: test.date,
          start_time: test.time || null,
          event_type: test.title.toLowerCase().includes("final") ? "final" :
                      test.title.toLowerCase().includes("midterm") ? "midterm" :
                      test.title.toLowerCase().includes("quiz") ? "quiz" : "exam",
          description: test.description || `Extracted from ${syllabus.class_name} syllabus`,
        });

        if (!insertError) addedCount++;
      }

      toast({
        title: "Tests extracted",
        description: `Added ${addedCount} test reminder(s) from ${syllabus.class_name} syllabus`,
      });

      fetchTests();
    } catch (error) {
      console.error("Extract error:", error);
      toast({
        title: "Extraction failed",
        description: error instanceof Error ? error.message : "Failed to extract test dates",
        variant: "destructive",
      });
    } finally {
      setIsExtracting(false);
    }
  };

  const handleAddManually = async () => {
    if (!manualForm.title || !manualForm.date) {
      toast({
        title: "Missing information",
        description: "Please enter a title and date",
        variant: "destructive",
      });
      return;
    }

    setIsAddingManually(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase.from("calendar_events").insert({
        user_id: user.id,
        title: manualForm.className ? `${manualForm.className}: ${manualForm.title}` : manualForm.title,
        event_date: manualForm.date,
        start_time: manualForm.time || null,
        event_type: manualForm.title.toLowerCase().includes("final") ? "final" :
                    manualForm.title.toLowerCase().includes("midterm") ? "midterm" :
                    manualForm.title.toLowerCase().includes("quiz") ? "quiz" : "exam",
        description: manualForm.description || null,
      });

      if (error) throw error;

      toast({
        title: "Test added",
        description: "Test reminder has been added to your calendar",
      });

      setManualForm({ title: "", date: "", time: "", className: "", description: "" });
      setDialogOpen(false);
      fetchTests();
    } catch (error) {
      console.error("Add error:", error);
      toast({
        title: "Failed to add test",
        description: error instanceof Error ? error.message : "Could not add test reminder",
        variant: "destructive",
      });
    } finally {
      setIsAddingManually(false);
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("calendar_events").delete().eq("id", id);
    if (error) {
      toast({
        title: "Delete failed",
        description: "Could not remove test reminder",
        variant: "destructive",
      });
    } else {
      toast({ title: "Test removed" });
      fetchTests();
    }
  };

  const getUrgencyBadge = (dateStr: string) => {
    const days = differenceInDays(new Date(dateStr), new Date());
    if (isPast(new Date(dateStr)) && !isToday(new Date(dateStr))) {
      return <Badge variant="secondary" className="text-xs">Past</Badge>;
    }
    if (isToday(new Date(dateStr))) {
      return <Badge variant="destructive" className="text-xs animate-pulse">Today!</Badge>;
    }
    if (days <= 3) {
      return <Badge variant="destructive" className="text-xs">{days} day{days !== 1 ? "s" : ""}</Badge>;
    }
    if (days <= 7) {
      return <Badge className="bg-amber-500 text-white text-xs">{days} days</Badge>;
    }
    return <Badge variant="outline" className="text-xs">{days} days</Badge>;
  };

  const upcomingTests = tests.filter(t => !isPast(new Date(t.event_date)) || isToday(new Date(t.event_date)));
  const pastTests = tests.filter(t => isPast(new Date(t.event_date)) && !isToday(new Date(t.event_date)));

  return (
    <Card className="p-6 shadow-[var(--shadow-soft)] border-border">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-destructive/10">
            <Bell className="w-6 h-6 text-destructive" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">Test Reminders</h3>
          {upcomingTests.length > 0 && (
            <Badge variant="secondary">{upcomingTests.length} upcoming</Badge>
          )}
        </div>
        <div className="flex gap-2">
          {syllabi.length > 0 && (
            <Select onValueChange={extractTestsFromSyllabus} disabled={isExtracting}>
              <SelectTrigger className="w-auto">
                <div className="flex items-center gap-2">
                  {isExtracting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  <span className="hidden sm:inline">Extract from Syllabus</span>
                </div>
              </SelectTrigger>
              <SelectContent>
                {syllabi.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.class_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Plus className="w-4 h-4 mr-1" />
                Add Test
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Test Reminder</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Test Name *</Label>
                  <Input
                    placeholder="e.g., Midterm Exam"
                    value={manualForm.title}
                    onChange={(e) => setManualForm({ ...manualForm, title: e.target.value })}
                  />
                </div>
                <div className="grid gap-4 grid-cols-2">
                  <div className="space-y-2">
                    <Label>Date *</Label>
                    <Input
                      type="date"
                      value={manualForm.date}
                      onChange={(e) => setManualForm({ ...manualForm, date: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Time (optional)</Label>
                    <Input
                      type="time"
                      value={manualForm.time}
                      onChange={(e) => setManualForm({ ...manualForm, time: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Class (optional)</Label>
                  <Select
                    value={manualForm.className}
                    onValueChange={(v) => setManualForm({ ...manualForm, className: v })}
                  >
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
                </div>
                <div className="space-y-2">
                  <Label>Notes (optional)</Label>
                  <Input
                    placeholder="e.g., Chapters 1-5"
                    value={manualForm.description}
                    onChange={(e) => setManualForm({ ...manualForm, description: e.target.value })}
                  />
                </div>
                <Button onClick={handleAddManually} disabled={isAddingManually} className="w-full">
                  {isAddingManually ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <Calendar className="w-4 h-4 mr-2" />
                  )}
                  Add Reminder
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : tests.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Calendar className="w-10 h-10 mx-auto mb-2 opacity-50" />
          <p>No test reminders yet</p>
          <p className="text-sm">Add tests manually or extract them from your syllabi</p>
        </div>
      ) : (
        <div className="space-y-4">
          {upcomingTests.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Upcoming Tests
              </h4>
              <div className="space-y-2">
                {upcomingTests.map((test) => (
                  <div
                    key={test.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-gradient-to-r from-destructive/5 to-transparent border border-destructive/20"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Calendar className="w-5 h-5 text-destructive flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="font-medium text-foreground truncate">{test.title}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{format(new Date(test.event_date), "EEE, MMM d, yyyy")}</span>
                          {test.start_time && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {test.start_time}
                            </span>
                          )}
                        </div>
                        {test.description && (
                          <p className="text-xs text-muted-foreground mt-1 truncate">{test.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {getUrgencyBadge(test.event_date)}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(test.id)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {pastTests.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">Past Tests</h4>
              <div className="space-y-2 opacity-60">
                {pastTests.slice(0, 3).map((test) => (
                  <div
                    key={test.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-muted/30"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground truncate">{test.title}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(test.event_date), "MMM d")}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(test.id)}
                        className="h-6 w-6"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
};

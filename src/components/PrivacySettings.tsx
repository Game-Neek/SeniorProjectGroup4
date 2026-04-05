import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Shield, Trash2, Download, ScrollText, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useConsent } from "@/hooks/useConsent";
import { useAuditLog } from "@/hooks/useAuditLog";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

export const PrivacySettings = () => {
  const { hasConsented, revokeConsent, grantConsent, consentVersion } = useConsent();
  const { log } = useAuditLog();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleExportData = async () => {
    setExporting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const userId = session.user.id;

      // Fetch all user data in parallel
      const [profiles, classes, syllabi, assignments, quizResults, practiceHistory, calendarEvents, consent, auditLogs] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", userId),
        supabase.from("user_classes").select("*").eq("user_id", userId),
        supabase.from("syllabi").select("*").eq("user_id", userId),
        supabase.from("assignments").select("*").eq("user_id", userId),
        supabase.from("quiz_results").select("*").eq("user_id", userId),
        supabase.from("practice_history").select("*").eq("user_id", userId),
        supabase.from("calendar_events").select("*").eq("user_id", userId),
        supabase.from("consent_records").select("*").eq("user_id", userId) as any,
        supabase.from("audit_logs").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(100) as any,
      ]);

      const exportData = {
        exportedAt: new Date().toISOString(),
        profile: profiles.data,
        classes: classes.data,
        syllabi: syllabi.data,
        assignments: assignments.data,
        quizResults: quizResults.data,
        practiceHistory: practiceHistory.data,
        calendarEvents: calendarEvents.data,
        consentRecords: consent.data,
        recentAuditLogs: auditLogs.data,
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `agentb-data-export-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);

      await log("data_export", "all_data", userId, { format: "json" });

      toast({ title: "Data exported", description: "Your data has been downloaded as a JSON file." });
    } catch (error) {
      toast({ title: "Export failed", description: "Unable to export data. Please try again.", variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteAllData = async () => {
    setDeleting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const userId = session.user.id;

      // Log the deletion event first
      await log("account_delete", "all_data", userId, { reason: "user_requested" });

      // Delete all user data in order (respecting potential dependencies)
      await Promise.all([
        supabase.from("practice_history").delete().eq("user_id", userId),
        supabase.from("quiz_results").delete().eq("user_id", userId),
        supabase.from("calendar_events").delete().eq("user_id", userId),
        supabase.from("course_textbooks").delete().eq("user_id", userId),
        (supabase.from("learning_events") as any).delete().eq("user_id", userId),
        (supabase.from("weekly_performance_snapshots") as any).delete().eq("user_id", userId),
      ]);

      // Delete files from storage
      const { data: syllabiData } = await supabase.from("syllabi").select("file_path").eq("user_id", userId);
      const { data: assignmentsData } = await supabase.from("assignments").select("file_path").eq("user_id", userId);

      if (syllabiData?.length) {
        await supabase.storage.from("syllabi").remove(syllabiData.map((s) => s.file_path));
      }
      if (assignmentsData?.length) {
        await supabase.storage.from("assignments").remove(assignmentsData.map((a) => a.file_path));
      }

      await Promise.all([
        supabase.from("syllabi").delete().eq("user_id", userId),
        supabase.from("assignments").delete().eq("user_id", userId),
        supabase.from("user_classes").delete().eq("user_id", userId),
      ]);

      // Sign out
      await supabase.auth.signOut();

      toast({ title: "Data deleted", description: "All your data has been permanently removed." });
      navigate("/auth");
    } catch (error) {
      toast({ title: "Deletion failed", description: "Unable to delete all data. Please contact support.", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Card className="p-6 shadow-[var(--shadow-medium)]">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg bg-primary/10">
          <Shield className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-foreground">Privacy & Compliance</h2>
          <p className="text-xs text-muted-foreground">GDPR & FERPA controls</p>
        </div>
      </div>

      <div className="space-y-5">
        {/* Consent status */}
        <div className="flex items-center justify-between p-4 rounded-lg border border-border">
          <div className="flex items-center gap-3">
            <ScrollText className="w-4 h-4 text-muted-foreground" />
            <div>
              <Label className="text-sm font-medium">Data Processing Consent</Label>
              <p className="text-xs text-muted-foreground">Version {consentVersion}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={hasConsented ? "default" : "destructive"}>
              {hasConsented ? "Active" : "Not given"}
            </Badge>
            <Switch
              checked={hasConsented || false}
              onCheckedChange={async (checked) => {
                if (checked) await grantConsent();
                else await revokeConsent();
              }}
            />
          </div>
        </div>

        {/* Export data */}
        <div className="flex items-center justify-between p-4 rounded-lg border border-border">
          <div className="flex items-center gap-3">
            <Download className="w-4 h-4 text-muted-foreground" />
            <div>
              <Label className="text-sm font-medium">Export My Data</Label>
              <p className="text-xs text-muted-foreground">Download all your data as JSON (GDPR Art. 20)</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleExportData} disabled={exporting}>
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Export"}
          </Button>
        </div>

        {/* Delete account */}
        <div className="flex items-center justify-between p-4 rounded-lg border border-destructive/30 bg-destructive/5">
          <div className="flex items-center gap-3">
            <Trash2 className="w-4 h-4 text-destructive" />
            <div>
              <Label className="text-sm font-medium text-destructive">Delete All Data</Label>
              <p className="text-xs text-muted-foreground">Permanently remove all data (GDPR Art. 17 / FERPA)</p>
            </div>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" disabled={deleting}>
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete ALL your data including:
                  classes, syllabi, assignments, quiz results, practice history,
                  calendar events, and uploaded files. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDeleteAllData} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Delete Everything
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </Card>
  );
};

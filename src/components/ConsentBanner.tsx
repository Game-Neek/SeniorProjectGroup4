import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, FileCheck, Lock, Brain, BarChart3 } from "lucide-react";
import { useConsent } from "@/hooks/useConsent";
import { useBehavioralTracking } from "@/hooks/useBehavioralTracking";
import { useToast } from "@/hooks/use-toast";

export const ConsentBanner = () => {
  const { hasConsented, loading, grantConsent } = useConsent();
  const { grantBehavioralConsent } = useBehavioralTracking();
  const { toast } = useToast();

  if (loading || hasConsented !== false) return null;

  const handleAccept = async () => {
    const success = await grantConsent();
    if (success) {
      // Also grant behavioral tracking by default (user can revoke in Privacy Settings)
      await grantBehavioralConsent();
      toast({ title: "Consent recorded", description: "Your preferences have been saved securely." });
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <Card className="max-w-lg w-full p-6 shadow-[var(--shadow-elevated)] space-y-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10">
            <Shield className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">Data Processing Consent</h2>
            <p className="text-xs text-muted-foreground">GDPR & FERPA Compliant</p>
          </div>
          <Badge variant="secondary" className="ml-auto">v1.0</Badge>
        </div>

        <p className="text-sm text-muted-foreground">
          AgentB processes your educational data to provide personalized learning experiences.
          By continuing, you agree to the following data processing activities:
        </p>

        <div className="space-y-3">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
            <Brain className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">AI-Powered Analysis</p>
              <p className="text-xs text-muted-foreground">
                Your syllabi and assignments are parsed by AI to extract learning objectives,
                generate quizzes, and create personalized study plans. AI processing includes
                algorithmic bias safeguards to ensure fair and equitable educational content.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
            <BarChart3 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">Behavioral Tracking</p>
              <p className="text-xs text-muted-foreground">
                Time-on-task and study session duration are tracked to personalize reminders
                and coaching. This data is stored securely, scoped to your account, and
                anonymized at semester end. You can disable this anytime in Privacy Settings.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
            <Lock className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">Data Security</p>
              <p className="text-xs text-muted-foreground">
                All data is encrypted at rest and in transit. Your information is never shared
                with third parties and is only used to improve your learning experience.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
            <FileCheck className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">Your Rights</p>
              <p className="text-xs text-muted-foreground">
                You can request data deletion, export your data, or revoke consent at any time
                from your Profile settings. All tracking actions are logged in an audit trail
                for full transparency (GDPR Art. 13/14, FERPA §99.32).
              </p>
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-1">
          <Button className="flex-1 bg-[image:var(--gradient-primary)]" onClick={handleAccept}>
            I Agree & Continue
          </Button>
        </div>

        <p className="text-[10px] text-muted-foreground text-center">
          This consent is recorded with a timestamp and can be revoked at any time.
          Behavioral tracking can be independently disabled in Privacy Settings.
          For questions, contact your institution's data protection officer.
        </p>
      </Card>
    </div>
  );
};

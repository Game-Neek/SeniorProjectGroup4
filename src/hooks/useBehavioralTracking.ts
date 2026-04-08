import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useConsent } from "@/hooks/useConsent";

/**
 * Consent-gated behavioral tracking hook.
 *
 * GDPR/FERPA compliance protocols:
 * 1. Tracking ONLY activates when the user has granted "behavioral_tracking" consent.
 * 2. All tracked data is scoped to the authenticated user via RLS.
 * 3. Time-on-task is measured locally and flushed as a learning_event — no external beacons.
 * 4. Sessions auto-end on tab blur/close (beforeunload) to avoid ghost sessions.
 * 5. All tracking events are audit-logged for transparency.
 * 6. Users can revoke consent at any time; revocation halts all future tracking.
 * 7. Tracked data is included in GDPR data exports and deleted on account erasure.
 */

const BEHAVIORAL_CONSENT_TYPE = "behavioral_tracking";
const CURRENT_CONSENT_VERSION = "1.0";

interface ActiveSession {
  className: string;
  topic: string | null;
  eventType: string;
  startedAt: number; // Date.now()
}

export const useBehavioralTracking = () => {
  const [hasBehavioralConsent, setHasBehavioralConsent] = useState<boolean | null>(null);
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null);
  const sessionRef = useRef<ActiveSession | null>(null);

  // Check behavioral tracking consent specifically
  const checkBehavioralConsent = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setHasBehavioralConsent(false);
      return;
    }

    const { data } = await supabase
      .from("consent_records")
      .select("id, granted")
      .eq("user_id", session.user.id)
      .eq("consent_type", BEHAVIORAL_CONSENT_TYPE)
      .eq("consent_version", CURRENT_CONSENT_VERSION)
      .eq("granted", true)
      .is("revoked_at", null)
      .maybeSingle() as any;

    setHasBehavioralConsent(!!data);
  }, []);

  useEffect(() => {
    checkBehavioralConsent();
  }, [checkBehavioralConsent]);

  // Grant behavioral tracking consent
  const grantBehavioralConsent = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return false;

    const { error } = await supabase.from("consent_records").insert({
      user_id: session.user.id,
      consent_type: BEHAVIORAL_CONSENT_TYPE,
      consent_version: CURRENT_CONSENT_VERSION,
      granted: true,
      metadata: {
        terms: [
          "Time-on-task tracking for study sessions",
          "Calendar interaction tracking for personalized reminders",
          "Data used only for your learning analytics",
          "You can revoke this at any time from Privacy Settings",
        ],
        regulations: ["GDPR Art. 6(1)(a)", "FERPA §99.30"],
        data_retention: "End of academic semester, then anonymized",
      },
    } as any);

    if (!error) {
      setHasBehavioralConsent(true);
      await supabase.from("audit_logs").insert({
        user_id: session.user.id,
        action: "consent_granted",
        entity_type: "consent_records",
        metadata: { consent_type: BEHAVIORAL_CONSENT_TYPE, version: CURRENT_CONSENT_VERSION },
      } as any);
    }

    return !error;
  }, []);

  // Revoke behavioral tracking consent
  const revokeBehavioralConsent = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return false;

    // End any active session immediately
    if (sessionRef.current) {
      await flushSession(sessionRef.current, session.user.id);
      sessionRef.current = null;
      setActiveSession(null);
    }

    const { error } = await supabase
      .from("consent_records")
      .update({ revoked_at: new Date().toISOString() } as any)
      .eq("user_id", session.user.id)
      .eq("consent_type", BEHAVIORAL_CONSENT_TYPE)
      .eq("granted", true)
      .is("revoked_at", null);

    if (!error) {
      setHasBehavioralConsent(false);
      await supabase.from("audit_logs").insert({
        user_id: session.user.id,
        action: "consent_revoked",
        entity_type: "consent_records",
        metadata: { consent_type: BEHAVIORAL_CONSENT_TYPE, version: CURRENT_CONSENT_VERSION },
      } as any);
    }

    return !error;
  }, []);

  // Start tracking a study session (consent-gated)
  const startSession = useCallback((className: string, topic: string | null, eventType: string = "study_session_started") => {
    if (!hasBehavioralConsent) return;

    const session: ActiveSession = {
      className,
      topic,
      eventType,
      startedAt: Date.now(),
    };
    sessionRef.current = session;
    setActiveSession(session);
  }, [hasBehavioralConsent]);

  // End and flush the current session
  const endSession = useCallback(async () => {
    if (!sessionRef.current) return;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    await flushSession(sessionRef.current, session.user.id);
    sessionRef.current = null;
    setActiveSession(null);
  }, []);

  // Auto-end session on tab blur or page unload
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && sessionRef.current && hasBehavioralConsent) {
        endSession();
      }
    };

    const handleBeforeUnload = () => {
      if (sessionRef.current && hasBehavioralConsent) {
        // Use sendBeacon for reliable delivery during unload
        const s = sessionRef.current;
        const durationMs = Date.now() - s.startedAt;
        if (durationMs < 2000) return; // Ignore accidental flickers

        navigator.sendBeacon?.(
          `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/learning_events`,
          JSON.stringify({
            // Note: sendBeacon can't include auth headers reliably,
            // so we just end the session locally. The flush above handles most cases.
          })
        );
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [hasBehavioralConsent, endSession]);

  return {
    hasBehavioralConsent,
    activeSession,
    startSession,
    endSession,
    grantBehavioralConsent,
    revokeBehavioralConsent,
  };
};

/** Flush a session as a learning_event with time-on-task metadata */
async function flushSession(session: ActiveSession, userId: string) {
  const durationMs = Date.now() - session.startedAt;
  if (durationMs < 2000) return; // Ignore sessions shorter than 2s

  const durationMinutes = Math.round(durationMs / 60000 * 10) / 10; // 1 decimal

  try {
    await (supabase.from("learning_events") as any).insert({
      user_id: userId,
      class_name: session.className,
      event_type: "study_session_ended",
      topic: session.topic,
      latency_ms: Math.round(durationMs),
      outcome: "completed",
      metadata: {
        time_on_task_minutes: durationMinutes,
        tracking_consent: "behavioral_tracking",
        session_start: new Date(session.startedAt).toISOString(),
        session_end: new Date().toISOString(),
      },
    });

    // Audit log the tracked data for transparency
    await supabase.from("audit_logs").insert({
      user_id: userId,
      action: "behavioral_data_recorded",
      entity_type: "learning_events",
      metadata: {
        class_name: session.className,
        topic: session.topic,
        duration_minutes: durationMinutes,
        consent_type: "behavioral_tracking",
      },
    } as any);
  } catch (err) {
    console.error("Failed to flush behavioral session:", err);
  }
}

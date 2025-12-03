import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Profile {
  full_name: string | null;
  email: string | null;
  university_id: string | null;
}

export const useProfile = () => {
  const [profile, setProfile] = useState<Profile>({ full_name: null, email: null, university_id: null });
  const [isLoading, setIsLoading] = useState(true);
  const [hasChanges, setHasChanges] = useState(false);
  const [originalProfile, setOriginalProfile] = useState<Profile | null>(null);

  const fetchProfile = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setIsLoading(false);
        return;
      }

      const { data: profileData, error } = await supabase
        .from("profiles")
        .select("full_name, email, university_id")
        .eq("id", session.user.id)
        .single();

      if (profileData && !error) {
        setProfile(profileData);
        setOriginalProfile(profileData);
      }
    } catch (error) {
      console.error("Error fetching profile:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // Track changes
  useEffect(() => {
    if (originalProfile) {
      const changed = 
        profile.full_name !== originalProfile.full_name ||
        profile.university_id !== originalProfile.university_id;
      setHasChanges(changed);
    }
  }, [profile, originalProfile]);

  const updateProfile = useCallback((updates: Partial<Profile>) => {
    setProfile(prev => ({ ...prev, ...updates }));
  }, []);

  const saveProfile = useCallback(async (): Promise<boolean> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return false;

      // Only save if there are changes
      if (!hasChanges) return true;

      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: profile.full_name,
          university_id: profile.university_id,
        })
        .eq("id", session.user.id);

      if (error) {
        console.error("Error saving profile:", error);
        return false;
      }

      setOriginalProfile(profile);
      setHasChanges(false);
      return true;
    } catch (error) {
      console.error("Error saving profile:", error);
      return false;
    }
  }, [profile, hasChanges]);

  return {
    profile,
    isLoading,
    hasChanges,
    updateProfile,
    saveProfile,
    fetchProfile,
  };
};

import { corsHeaders } from "@supabase/supabase-js/cors";
import { createClient } from "@supabase/supabase-js";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { oldData, newData, className, syllabusId, userId } = await req.json();

    if (!oldData || !newData || !className || !userId) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const changes: { type: string; description: string }[] = [];

    // Compare grading policy
    const oldGrading = JSON.stringify(oldData.grading_policy || null);
    const newGrading = JSON.stringify(newData.grading_policy || null);
    if (oldGrading !== newGrading && newData.grading_policy) {
      changes.push({
        type: "policy_change",
        description: `Grading policy updated for ${className}`,
      });
    }

    // Compare weekly schedule
    const oldSchedule = JSON.stringify(oldData.weekly_schedule || null);
    const newSchedule = JSON.stringify(newData.weekly_schedule || null);
    if (oldSchedule !== newSchedule && newData.weekly_schedule) {
      changes.push({
        type: "content_change",
        description: `Weekly schedule updated for ${className}`,
      });
    }

    // Compare learning objectives
    const oldObj = JSON.stringify(oldData.learning_objectives || []);
    const newObj = JSON.stringify(newData.learning_objectives || []);
    if (oldObj !== newObj && newData.learning_objectives?.length) {
      const oldCount = (oldData.learning_objectives || []).length;
      const newCount = newData.learning_objectives.length;
      if (newCount > oldCount) {
        changes.push({
          type: "content_change",
          description: `${newCount - oldCount} new learning objective(s) added for ${className}`,
        });
      } else if (newCount < oldCount) {
        changes.push({
          type: "content_change",
          description: `Learning objectives updated for ${className} (${newCount} total, was ${oldCount})`,
        });
      } else {
        changes.push({
          type: "content_change",
          description: `Learning objectives revised for ${className}`,
        });
      }
    }

    // Compare course description
    if (
      oldData.course_description !== newData.course_description &&
      newData.course_description
    ) {
      changes.push({
        type: "content_change",
        description: `Course description updated for ${className}`,
      });
    }

    // Compare required materials
    const oldMats = JSON.stringify(oldData.required_materials || []);
    const newMats = JSON.stringify(newData.required_materials || []);
    if (oldMats !== newMats && newData.required_materials?.length) {
      changes.push({
        type: "content_change",
        description: `Required materials list updated for ${className}`,
      });
    }

    // If we have changes, use AI to generate a human-readable summary
    let summary = "";
    if (changes.length > 0) {
      try {
        const apiKey = Deno.env.get("LOVABLE_API_KEY");
        if (apiKey) {
          const aiResponse = await fetch(GATEWAY_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash-lite",
              max_tokens: 200,
              messages: [
                {
                  role: "system",
                  content:
                    "You summarize syllabus changes in 1-2 concise sentences for a student notification. Be specific about what changed. Do not use markdown.",
                },
                {
                  role: "user",
                  content: `Changes detected for ${className}:\n${changes.map((c) => `- ${c.description}`).join("\n")}\n\nSummarize these changes briefly for a student notification.`,
                },
              ],
            }),
          });

          if (aiResponse.ok) {
            const aiData = await aiResponse.json();
            summary = aiData.choices?.[0]?.message?.content || "";
          }
        }
      } catch (e) {
        console.error("AI summary error:", e);
      }
    }

    // Insert notifications into the database
    if (changes.length > 0) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, serviceKey);

      for (const change of changes) {
        const title =
          change.type === "policy_change"
            ? `📋 Policy Change: ${className}`
            : `📝 Content Update: ${className}`;

        const body = summary || change.description;

        await supabase.from("notifications").insert({
          user_id: userId,
          title,
          body,
          category: "course_updates",
          source_type: change.type,
          source_id: syllabusId || null,
        });
      }
    }

    return new Response(
      JSON.stringify({ changes, summary, count: changes.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("detect-content-changes error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { contentId } = await req.json();
    if (!contentId) throw new Error("contentId is required");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase config missing");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (!user || authError) throw new Error("Unauthorized");

    // Fetch course content
    const { data: content, error: contentError } = await supabase
      .from("course_content")
      .select("*")
      .eq("id", contentId)
      .eq("user_id", user.id)
      .single();

    if (contentError || !content) throw new Error("Content not found");

    // Build audit prompt with all content
    const quizText = (content.quiz_questions || [])
      .map((q: any) => `Q: ${q.question}\nOptions: ${(q.options || []).join(", ")}\nExplanation: ${q.explanation}`)
      .join("\n\n");

    const exerciseText = (content.exercises || [])
      .map((e: any) => `Problem: ${e.problem}\nHint: ${e.hint}\nSolution: ${e.solution}`)
      .join("\n\n");

    const fullContent = `
LESSON CONTENT:
${content.lesson_content || ""}

QUIZ QUESTIONS:
${quizText}

EXERCISES:
${exerciseText}
`.trim();

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are an educational equity auditor. Analyze educational content for bias across four dimensions:

1. GENDER BIAS: Gendered pronouns, stereotypical roles, unequal representation
2. RACIAL BIAS: Cultural assumptions, Western-centric examples, stereotypical scenarios
3. SOCIOECONOMIC BIAS: Assumptions about wealth/access, class-specific references
4. LANGUAGE BIAS: Jargon inaccessible to non-native speakers, idioms, colloquialisms

Score each dimension 0-100 (100 = no bias detected). Flag specific instances with line references.
For each flag, provide a concrete debiased alternative that maintains educational value.`,
          },
          {
            role: "user",
            content: `Audit this educational content for bias:\n\n${fullContent}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "bias_audit_result",
              description: "Return structured bias audit results with scores, flags, and debiased suggestions",
              parameters: {
                type: "object",
                properties: {
                  gender_score: { type: "number", description: "0-100 score for gender equity (100 = no bias)" },
                  racial_score: { type: "number", description: "0-100 score for racial equity" },
                  socioeconomic_score: { type: "number", description: "0-100 score for socioeconomic equity" },
                  language_score: { type: "number", description: "0-100 score for language accessibility" },
                  flags: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        category: { type: "string", enum: ["gender", "racial", "socioeconomic", "language"] },
                        severity: { type: "string", enum: ["low", "medium", "high"] },
                        excerpt: { type: "string", description: "The problematic text excerpt" },
                        issue: { type: "string", description: "Description of the bias issue" },
                        suggestion: { type: "string", description: "Debiased alternative text" },
                      },
                      required: ["category", "severity", "excerpt", "issue", "suggestion"],
                    },
                  },
                },
                required: ["gender_score", "racial_score", "socioeconomic_score", "language_score", "flags"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "bias_audit_result" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Please try again." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      throw new Error("AI audit failed");
    }

    const result = await response.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in AI response");

    let auditResult;
    try {
      auditResult = typeof toolCall.function.arguments === "string"
        ? JSON.parse(toolCall.function.arguments)
        : toolCall.function.arguments;
    } catch {
      throw new Error("Failed to parse audit results");
    }

    const overall = Math.round(
      (auditResult.gender_score + auditResult.racial_score +
       auditResult.socioeconomic_score + auditResult.language_score) / 4
    );

    const hasFlags = (auditResult.flags || []).length > 0;
    const suggestions = (auditResult.flags || []).map((f: any) => ({
      category: f.category,
      original: f.excerpt,
      replacement: f.suggestion,
      issue: f.issue,
    }));

    // Save audit
    const auditData = {
      content_id: contentId,
      user_id: user.id,
      overall_score: overall,
      gender_score: auditResult.gender_score,
      racial_score: auditResult.racial_score,
      socioeconomic_score: auditResult.socioeconomic_score,
      language_score: auditResult.language_score,
      flags: auditResult.flags || [],
      suggestions,
      status: hasFlags ? "flagged" : "clean",
      auto_fixed: false,
    };

    await supabase.from("bias_audits").insert(auditData);

    // Auto-fix: apply suggestions to content if flagged
    if (hasFlags && content.lesson_content) {
      let fixedContent = content.lesson_content;
      for (const flag of auditResult.flags) {
        if (flag.excerpt && flag.suggestion) {
          fixedContent = fixedContent.replace(flag.excerpt, flag.suggestion);
        }
      }

      if (fixedContent !== content.lesson_content) {
        await supabase
          .from("course_content")
          .update({ lesson_content: fixedContent })
          .eq("id", contentId);

        auditData.auto_fixed = true;
        auditData.status = "fixed";

        // Update the audit record
        await supabase
          .from("bias_audits")
          .update({ auto_fixed: true, status: "fixed" })
          .eq("content_id", contentId)
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1);
      }
    }

    // Audit log
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: "ai_parse",
      entity_type: "bias_audit",
      entity_id: contentId,
      metadata: { overall_score: overall, flags_count: (auditResult.flags || []).length, auto_fixed: auditData.auto_fixed },
    });

    return new Response(JSON.stringify({
      success: true,
      audit: auditData,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("audit-bias error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

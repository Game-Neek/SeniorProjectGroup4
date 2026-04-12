import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (!user || authError) throw new Error("Unauthorized");

    const { contentId, className } = await req.json();
    if (!contentId || !className) {
      return new Response(JSON.stringify({ error: "contentId and className required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch lesson content
    const { data: content } = await supabase
      .from("course_content")
      .select("topic, lesson_content, quiz_questions, exercises, bloom_level")
      .eq("id", contentId)
      .single();

    if (!content) throw new Error("Content not found");

    // Fetch syllabus objectives + description
    const { data: syllabus } = await supabase
      .from("syllabi")
      .select("learning_objectives, course_description, bloom_classifications, grading_policy")
      .eq("user_id", user.id)
      .eq("class_name", className)
      .maybeSingle();

    const objectives = syllabus?.learning_objectives || [];
    const courseDesc = syllabus?.course_description || "";
    const bloomData = syllabus?.bloom_classifications || [];

    // Fetch textbooks
    const { data: textbooks } = await supabase
      .from("course_textbooks")
      .select("title, author")
      .eq("user_id", user.id)
      .eq("class_name", className);

    const textbookList = (textbooks || []).map((t: any) => `"${t.title}"${t.author ? ` by ${t.author}` : ""}`).join(", ");

    // Use AI to perform alignment check
    const response = await fetch(GATEWAY_URL, {
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
            content: `You are an instructional quality auditor. Evaluate how well the provided lesson content aligns with the course's syllabus objectives, Bloom's taxonomy targets, and organizational quality standards. Be specific and actionable.`,
          },
          {
            role: "user",
            content: `COURSE: ${className}
TOPIC: ${content.topic}
TARGET BLOOM LEVEL: ${content.bloom_level || "not specified"}

SYLLABUS OBJECTIVES:
${objectives.length > 0 ? objectives.map((o: string, i: number) => `${i + 1}. ${o}`).join("\n") : "No objectives found"}

COURSE DESCRIPTION: ${courseDesc || "None"}

BLOOM CLASSIFICATIONS FROM SYLLABUS:
${JSON.stringify(bloomData).slice(0, 1000)}

ASSIGNED TEXTBOOKS: ${textbookList || "None"}

--- LESSON CONTENT ---
${(content.lesson_content || "").slice(0, 3000)}

--- QUIZ QUESTIONS (${(content.quiz_questions || []).length} total) ---
${JSON.stringify(content.quiz_questions || []).slice(0, 1500)}

--- EXERCISES (${(content.exercises || []).length} total) ---
${JSON.stringify(content.exercises || []).slice(0, 1000)}

Evaluate this content against the organizational goals and syllabus.`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "alignment_report",
              description: "Return a structured alignment report",
              parameters: {
                type: "object",
                properties: {
                  overall_alignment_score: { type: "number", description: "1-100 alignment score" },
                  bloom_match: { type: "boolean", description: "Does content match target Bloom level?" },
                  bloom_actual: { type: "string", description: "Actual cognitive level of content" },
                  objectives_covered: {
                    type: "array",
                    items: { type: "string" },
                    description: "Which syllabus objectives this content covers",
                  },
                  objectives_missing: {
                    type: "array",
                    items: { type: "string" },
                    description: "Which relevant objectives are NOT addressed",
                  },
                  strengths: {
                    type: "array",
                    items: { type: "string" },
                    description: "2-4 specific strengths of the content",
                  },
                  gaps: {
                    type: "array",
                    items: { type: "string" },
                    description: "2-4 specific gaps or issues found",
                  },
                  recommendations: {
                    type: "array",
                    items: { type: "string" },
                    description: "3-5 actionable recommendations to improve alignment",
                  },
                  quiz_quality_score: { type: "number", description: "1-100 quiz quality score" },
                  exercise_quality_score: { type: "number", description: "1-100 exercise quality score" },
                  textbook_alignment: { type: "string", description: "How well content aligns with assigned textbooks" },
                },
                required: ["overall_alignment_score", "bloom_match", "objectives_covered", "objectives_missing", "strengths", "gaps", "recommendations"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "alignment_report" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, try again later" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("AI gateway error");
    }

    const result = await response.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No alignment report generated");

    let report;
    try {
      report = typeof toolCall.function.arguments === "string"
        ? JSON.parse(toolCall.function.arguments)
        : toolCall.function.arguments;
    } catch {
      throw new Error("Failed to parse alignment report");
    }

    // Log audit
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: "alignment_check",
      entity_type: "course_content",
      entity_id: contentId,
      metadata: { className, topic: content.topic, score: report.overall_alignment_score },
    });

    return new Response(JSON.stringify({ report }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("check-alignment error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

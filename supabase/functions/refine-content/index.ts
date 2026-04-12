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
    const { contentId, lessonContent, quizQuestions, exercises, refinementMode, studentFeedback } = await req.json();

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

    // Get user's learning styles for adaptation
    const { data: profile } = await supabase
      .from("profiles")
      .select("learning_styles")
      .eq("id", user.id)
      .single();

    const learningStyles = profile?.learning_styles || [];
    const styleHint = learningStyles.length > 0
      ? `The learner prefers: ${learningStyles.join(", ")}. Adapt tone and structure accordingly.`
      : "";

    // Build refinement prompt based on mode
    const modeInstructions: Record<string, string> = {
      clarity: `REFINEMENT GOAL: Maximize clarity and readability.
- Simplify complex sentences without losing technical accuracy
- Replace jargon with plain language (define unavoidable terms inline)
- Use active voice and direct address ("you will learn…")
- Break long paragraphs into shorter ones (3-4 sentences max)
- Add transitional phrases between sections for flow
- Ensure every example has a clear setup → action → result structure`,

      concise: `REFINEMENT GOAL: Make content concise and scannable.
- Cut filler words, redundant phrases, and unnecessary qualifiers
- Convert prose-heavy explanations into bullet points or numbered steps where appropriate
- Merge overlapping sections and remove repeated information
- Keep only the most impactful examples (quality over quantity)
- Target ~30% reduction in word count while preserving all key concepts`,

      engaging: `REFINEMENT GOAL: Make content engaging and learner-centered.
- Add real-world analogies and relatable scenarios
- Use questions to prompt reflection ("Why does this matter?")
- Include brief "Did you know?" or "Common mistake:" callouts
- Vary sentence structure to maintain reading momentum
- Frame abstract concepts with concrete, memorable examples
- Add brief motivational context ("This skill is used by engineers at…")`,

      full: `REFINEMENT GOAL: Full editorial pass — clarity, conciseness, and engagement.
- Simplify language and use active voice
- Remove redundancy, cut filler, tighten prose
- Add real-world examples and analogies
- Ensure logical flow with clear transitions
- Format for scannability (short paragraphs, lists, headers)
- Maintain technical rigor while being accessible to learners
- Target clear, concise, engaging content suitable for self-paced study`,
    };

    const mode = refinementMode || "full";
    const instructions = modeInstructions[mode] || modeInstructions.full;

    // Mark as refining
    if (contentId) {
      await supabase
        .from("course_content")
        .update({ generation_status: "refining" })
        .eq("id", contentId);
    }

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
            content: `You are an expert instructional editor. Your job is to refine educational content so instructors can focus on experience design rather than text editing.

${instructions}

${styleHint}

RULES:
- Preserve ALL mathematical notation using LaTeX dollar-sign delimiters (e.g. $f(x) = 3x^2$)
- Keep markdown formatting (headers, lists, bold)
- Do NOT add new topics or concepts — only improve how existing content is presented
- Do NOT remove any key learning points
- Maintain culturally neutral, inclusive language
- Use gender-neutral language and diverse name representations`,
          },
          {
            role: "user",
            content: JSON.stringify({
              lessonContent: lessonContent || "",
              quizQuestions: quizQuestions || [],
              exercises: exercises || [],
            }),
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "return_refined_content",
              description: "Return the refined lesson content, quiz questions, and exercises",
              parameters: {
                type: "object",
                properties: {
                  lessonContent: {
                    type: "string",
                    description: "The refined lesson content in markdown format, preserving all LaTeX math notation.",
                  },
                  quizQuestions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "number" },
                        question: { type: "string" },
                        options: { type: "array", items: { type: "string" }, minItems: 4, maxItems: 4 },
                        correctIndex: { type: "number" },
                        explanation: { type: "string" },
                      },
                      required: ["id", "question", "options", "correctIndex", "explanation"],
                    },
                  },
                  exercises: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "number" },
                        problem: { type: "string" },
                        hint: { type: "string" },
                        solution: { type: "string" },
                        difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
                      },
                      required: ["id", "problem", "hint", "solution", "difficulty"],
                    },
                  },
                  changesSummary: {
                    type: "string",
                    description: "A brief 2-3 sentence summary of the key changes made during refinement.",
                  },
                },
                required: ["lessonContent", "quizQuestions", "exercises", "changesSummary"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "return_refined_content" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      throw new Error("AI refinement failed");
    }

    const result = await response.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in AI response");

    let refined;
    try {
      refined = typeof toolCall.function.arguments === "string"
        ? JSON.parse(toolCall.function.arguments)
        : toolCall.function.arguments;
    } catch {
      throw new Error("Failed to parse refined content");
    }

    // Save refined content to database
    if (contentId) {
      await supabase
        .from("course_content")
        .update({
          lesson_content: refined.lessonContent || lessonContent,
          quiz_questions: refined.quizQuestions || quizQuestions,
          exercises: refined.exercises || exercises,
          generation_status: "complete",
          updated_at: new Date().toISOString(),
        })
        .eq("id", contentId);
    }

    // Audit log
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: "ai_refine",
      entity_type: "course_content",
      entity_id: contentId || null,
      metadata: { mode, changesSummary: refined.changesSummary },
    });

    return new Response(JSON.stringify({
      success: true,
      content: refined,
      changesSummary: refined.changesSummary,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("refine-content error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

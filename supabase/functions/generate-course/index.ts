import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BIAS_GUARDRAILS = `
ALGORITHMIC FAIRNESS DIRECTIVES (MANDATORY):
- Generate content that is culturally neutral and inclusive of diverse backgrounds
- Use gender-neutral language and diverse name representations in examples
- Avoid stereotypes in scenarios
- Assessment difficulty based ONLY on cognitive complexity, never cultural familiarity
- Ensure examples are accessible to international students and non-native English speakers
- Mathematical and scientific content must use universal notation standards`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { className, topic, topicOrder, bloomLevel, courseDescription, contentId } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase config missing");

    // Verify user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (!user || authError) throw new Error("Unauthorized");

    // Get user's learning styles
    const { data: profile } = await supabase
      .from("profiles")
      .select("learning_styles")
      .eq("id", user.id)
      .single();

    const learningStyles = profile?.learning_styles || [];
    const styleContext = learningStyles.length > 0
      ? `Adapt content for these learning styles: ${learningStyles.join(", ")}.`
      : "";

    // Mark as generating
    if (contentId) {
      await supabase
        .from("course_content")
        .update({ generation_status: "generating" })
        .eq("id", contentId);
    }

    // Generate lesson content
    const systemPrompt = `You are an expert course designer creating comprehensive, interactive educational content for a university-level course.

Course: ${className}
Topic: ${topic}
${courseDescription ? `Course Description: ${courseDescription}` : ""}
${bloomLevel ? `Bloom's Taxonomy Level: ${bloomLevel}` : ""}
${styleContext}

${BIAS_GUARDRAILS}

Generate a complete chapter/lesson for this specific topic. The content should be suitable for a "solid first draft" of an interactive course module.

IMPORTANT FORMATTING RULES:
- Use LaTeX math notation with dollar sign delimiters for ALL mathematical expressions (e.g. $f(x) = 3x^2$).
- NEVER use ASCII art, text-based diagrams, or code blocks to represent molecular structures, chemical diagrams, circuit diagrams, biological structures, or any visual/spatial concept.
- Instead, use this marker format: [STRUCTURE: clear description of what to draw]
  Examples:
  - [STRUCTURE: ethane molecule (C2H6) showing all carbon-hydrogen bonds in 3D tetrahedral geometry]
  - [STRUCTURE: ATP molecule structure with adenine base, ribose sugar, and three phosphate groups]
  - [STRUCTURE: simple series circuit with battery, resistor, and ammeter]
- The description inside [STRUCTURE: ...] should be detailed enough to generate an accurate scientific diagram.
- Do NOT wrap structures in code blocks or backticks.`;

    // Generate all content via tool calling
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Generate a complete interactive lesson for the topic "${topic}" in ${className}. Include:
1. Detailed lesson content (reading material with sections, explanations, and examples)
2. 5 practice quiz questions (multiple choice with 4 options each)
3. 3 interactive exercises (problems with hints and step-by-step solutions)
4. 4 study resources (mix of video, reading, and practice with real URLs)

Make the content rigorous, application-focused (80% problem-solving, 20% conceptual), and suitable for university students.`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "generate_course_chapter",
              description: "Generate a complete interactive course chapter with lesson content, quizzes, exercises, and resources",
              parameters: {
                type: "object",
                properties: {
                  lessonContent: {
                    type: "string",
                    description: "Comprehensive lesson content in markdown format with sections, explanations, formulas, and examples. 800-1500 words.",
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
                  studyResources: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        type: { type: "string", enum: ["video", "reading", "practice"] },
                        url: { type: "string" },
                        source: { type: "string" },
                        description: { type: "string" },
                      },
                      required: ["title", "type", "url", "source", "description"],
                    },
                  },
                },
                required: ["lessonContent", "quizQuestions", "exercises", "studyResources"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "generate_course_chapter" } },
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
      throw new Error("AI generation failed");
    }

    // Parse response - handle potential truncation
    const responseText = await response.text();
    let result;
    try {
      result = JSON.parse(responseText);
    } catch {
      throw new Error("Failed to parse AI response");
    }

    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in AI response");

    let generatedContent;
    try {
      let args = toolCall.function.arguments;
      // Handle truncated JSON
      if (typeof args === "string") {
        try {
          generatedContent = JSON.parse(args);
        } catch {
          // Try to salvage truncated JSON
          const match = args.match(/^([\s\S]*?)(?:,\s*"(?:studyResources|exercises|quizQuestions)"|\})\s*$/);
          if (match) {
            args = args + "]}";
          }
          generatedContent = JSON.parse(args);
        }
      } else {
        generatedContent = args;
      }
    } catch (e) {
      console.error("Failed to parse tool call args:", e);
      throw new Error("Failed to parse generated content");
    }

    // Save to database
    const updateData = {
      lesson_content: generatedContent.lessonContent || "",
      quiz_questions: generatedContent.quizQuestions || [],
      exercises: generatedContent.exercises || [],
      study_resources: generatedContent.studyResources || [],
      bloom_level: bloomLevel || null,
      generation_status: "complete",
      updated_at: new Date().toISOString(),
    };

    if (contentId) {
      await supabase
        .from("course_content")
        .update(updateData)
        .eq("id", contentId);
    } else {
      await supabase
        .from("course_content")
        .upsert({
          ...updateData,
          user_id: user.id,
          class_name: className,
          topic,
          topic_order: topicOrder || 0,
        }, { onConflict: "id" });
    }

    // Audit log
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: "ai_parse",
      entity_type: "course_content",
      entity_id: contentId || null,
      metadata: { className, topic, bloomLevel },
    });

    return new Response(JSON.stringify({
      success: true,
      content: generatedContent,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-course error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

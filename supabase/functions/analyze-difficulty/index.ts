import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { assignmentId } = await req.json();
    if (!assignmentId) throw new Error("assignmentId is required");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY)
      throw new Error("Supabase config missing");

    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);
    if (!user || authError) throw new Error("Unauthorized");

    // Fetch assignment
    const { data: assignment, error: aErr } = await supabase
      .from("assignments")
      .select("*")
      .eq("id", assignmentId)
      .eq("user_id", user.id)
      .single();
    if (aErr || !assignment) throw new Error("Assignment not found");

    // Fetch syllabus context for this class
    const { data: syllabus } = await supabase
      .from("syllabi")
      .select(
        "learning_objectives, weekly_schedule, bloom_classifications, course_description"
      )
      .eq("user_id", user.id)
      .eq("class_name", assignment.class_name)
      .maybeSingle();

    // Fetch existing course content for prerequisite mapping
    const { data: courseContent } = await supabase
      .from("course_content")
      .select("topic, topic_order, bloom_level")
      .eq("user_id", user.id)
      .eq("class_name", assignment.class_name)
      .eq("generation_status", "complete")
      .order("topic_order", { ascending: true });

    // Fetch student's practice history for calibration
    const { data: practiceHistory } = await supabase
      .from("practice_history")
      .select("score, total, practice_type, topics_practiced")
      .eq("user_id", user.id)
      .eq("class_name", assignment.class_name)
      .order("completed_at", { ascending: false })
      .limit(20);

    // Fetch quiz results for this class
    const { data: quizResults } = await supabase
      .from("quiz_results")
      .select("score, total_questions, weak_areas, strong_areas")
      .eq("user_id", user.id)
      .eq("class_name", assignment.class_name)
      .order("created_at", { ascending: false })
      .limit(5);

    // Build context
    const syllabusContext = syllabus
      ? {
          courseDescription: syllabus.course_description,
          learningObjectives: syllabus.learning_objectives,
          weeklySchedule: syllabus.weekly_schedule,
          bloomClassifications: syllabus.bloom_classifications,
        }
      : null;

    const topicSequence = (courseContent || []).map((c) => ({
      topic: c.topic,
      order: c.topic_order,
      bloomLevel: c.bloom_level,
    }));

    const studentPerformance = {
      practiceHistory: (practiceHistory || []).map((p) => ({
        score: p.score,
        total: p.total,
        type: p.practice_type,
        topics: p.topics_practiced,
      })),
      quizResults: (quizResults || []).map((q) => ({
        score: q.score,
        total: q.total_questions,
        weakAreas: q.weak_areas,
        strongAreas: q.strong_areas,
      })),
    };

    const systemPrompt = `You are an expert psychometrician and learning scientist. Analyze this assignment and its syllabus context to produce Item Response Theory (IRT) and Knowledge Space Theory (KST) parameters.

## IRT 3-Parameter Logistic Model
For each assignment, estimate:
- **discrimination (a)**: How well this assignment distinguishes between students of different abilities (0.5 = low, 1.0 = moderate, 2.0+ = high). Consider question specificity, solution path complexity, and partial credit opportunities.
- **difficulty (b)**: The ability level needed to have a 50% chance of success (-3.0 = very easy, 0.0 = average, +3.0 = very hard). Calibrate against the Bloom's taxonomy level, prerequisite depth, and course positioning.
- **guessing (c)**: Probability of a low-ability student answering correctly by chance (0.0 for open-ended, 0.25 for 4-choice MCQ, etc.).

## Knowledge Space Theory
Identify the specific knowledge states (prerequisite concepts) a student must have mastered before attempting this assignment. Order them from foundational to advanced, mapping to the course topic sequence.

## Cognitive Load Assessment
Estimate the cognitive load on a 1-10 scale:
- Element interactivity (how many concepts must be processed simultaneously)
- Intrinsic load (inherent complexity of the material)
- Germane load (effort needed to build new schemas)

## Context Available
- Syllabus: ${JSON.stringify(syllabusContext)}
- Course topic sequence: ${JSON.stringify(topicSequence)}
- Assignment objectives: ${JSON.stringify(assignment.learning_objectives)}
- Assessment type: ${assignment.assessment_type || "unknown"}
- Assessment metadata: ${JSON.stringify(assignment.assessment_metadata)}
- Student performance history: ${JSON.stringify(studentPerformance)}

Use the student's performance data to calibrate: if they consistently score high on prerequisites, the effective difficulty for THEM may be lower than the absolute difficulty.`;

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
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
              content: `Analyze assignment "${assignment.assignment_title}" for course "${assignment.class_name}" and produce IRT/KST parameters.

Assignment content/objectives: ${JSON.stringify(assignment.learning_objectives || [])}
Parsed content summary: ${(assignment.parsed_content || "").slice(0, 2000)}`,
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "assign_difficulty_parameters",
                description:
                  "Assign IRT and KST difficulty parameters to an assignment based on psychometric analysis",
                parameters: {
                  type: "object",
                  properties: {
                    difficultyLevel: {
                      type: "string",
                      enum: ["novice", "intermediate", "advanced", "expert"],
                      description:
                        "Human-readable overall difficulty classification",
                    },
                    irtParameters: {
                      type: "object",
                      properties: {
                        discrimination: {
                          type: "number",
                          description:
                            "IRT discrimination parameter (a), typically 0.5-2.5",
                        },
                        difficulty: {
                          type: "number",
                          description:
                            "IRT difficulty parameter (b), typically -3.0 to +3.0",
                        },
                        guessing: {
                          type: "number",
                          description:
                            "IRT guessing parameter (c), 0.0-0.5",
                        },
                        bloomLevel: {
                          type: "string",
                          enum: [
                            "Remember",
                            "Understand",
                            "Apply",
                            "Analyze",
                            "Evaluate",
                            "Create",
                          ],
                          description: "Primary Bloom's taxonomy level",
                        },
                        cognitiveLoad: {
                          type: "number",
                          description:
                            "Estimated cognitive load on 1-10 scale",
                        },
                        estimatedMinutes: {
                          type: "number",
                          description:
                            "Estimated time to complete in minutes",
                        },
                        confidenceInterval: {
                          type: "object",
                          properties: {
                            lower: { type: "number" },
                            upper: { type: "number" },
                          },
                          required: ["lower", "upper"],
                          description:
                            "95% confidence interval for difficulty (b)",
                        },
                      },
                      required: [
                        "discrimination",
                        "difficulty",
                        "guessing",
                        "bloomLevel",
                        "cognitiveLoad",
                        "estimatedMinutes",
                        "confidenceInterval",
                      ],
                    },
                    knowledgeDependencies: {
                      type: "array",
                      items: { type: "string" },
                      description:
                        "Ordered list of prerequisite knowledge states from KST, foundational → advanced",
                    },
                    rationale: {
                      type: "string",
                      description:
                        "Brief explanation of how parameters were determined from syllabus context",
                    },
                  },
                  required: [
                    "difficultyLevel",
                    "irtParameters",
                    "knowledgeDependencies",
                    "rationale",
                  ],
                },
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: "assign_difficulty_parameters" },
          },
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limited. Please try again shortly." }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add funds." }),
          {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      throw new Error("AI analysis failed");
    }

    const result = await response.json();
    const toolCall = result.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in AI response");

    let params;
    try {
      params =
        typeof toolCall.function.arguments === "string"
          ? JSON.parse(toolCall.function.arguments)
          : toolCall.function.arguments;
    } catch {
      throw new Error("Failed to parse difficulty parameters");
    }

    // Save to database
    await supabase
      .from("assignments")
      .update({
        difficulty_level: params.difficultyLevel,
        irt_parameters: params.irtParameters,
        knowledge_dependencies: params.knowledgeDependencies || [],
        difficulty_analyzed_at: new Date().toISOString(),
      })
      .eq("id", assignmentId);

    // Audit log
    await supabase.from("audit_logs").insert({
      user_id: user.id,
      action: "ai_difficulty_analysis",
      entity_type: "assignment",
      entity_id: assignmentId,
      metadata: {
        difficultyLevel: params.difficultyLevel,
        irtDifficulty: params.irtParameters?.difficulty,
        bloomLevel: params.irtParameters?.bloomLevel,
        dependencyCount: params.knowledgeDependencies?.length || 0,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        difficultyLevel: params.difficultyLevel,
        irtParameters: params.irtParameters,
        knowledgeDependencies: params.knowledgeDependencies,
        rationale: params.rationale,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("analyze-difficulty error:", e);
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

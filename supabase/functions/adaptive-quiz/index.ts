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

    const { className, topic, performanceHistory, currentDifficulty, questionCount } = await req.json();
    if (!className) {
      return new Response(JSON.stringify({ error: "className required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch syllabus context
    const { data: syllabus } = await supabase
      .from("syllabi")
      .select("learning_objectives, course_description, bloom_classifications")
      .eq("user_id", user.id)
      .eq("class_name", className)
      .maybeSingle();

    // Fetch recent practice history for adaptive calibration
    const { data: recentPractice } = await supabase
      .from("practice_history")
      .select("score, total, practice_type, topics_practiced, completed_at")
      .eq("user_id", user.id)
      .eq("class_name", className)
      .order("completed_at", { ascending: false })
      .limit(10);

    // Fetch knowledge mastery data
    const { data: masteryData } = await supabase
      .from("knowledge_mastery")
      .select("mastery_score, mastery_level, component_id, attempts")
      .eq("user_id", user.id);

    // Fetch knowledge components for this class
    const { data: components } = await supabase
      .from("knowledge_components")
      .select("id, objective, bloom_level, parent_topic")
      .eq("user_id", user.id)
      .eq("class_name", className);

    // Calculate adaptive parameters
    const history = performanceHistory || [];
    const recentScores = (recentPractice || [])
      .filter((p: any) => p.total > 0)
      .map((p: any) => (p.score / p.total) * 100);

    const avgRecent = recentScores.length > 0
      ? recentScores.reduce((a: number, b: number) => a + b, 0) / recentScores.length
      : 50;

    // IRT-inspired difficulty estimation
    // theta = estimated ability (normalized 0-100)
    let theta = avgRecent;

    // Adjust theta based on in-session performance
    if (history.length > 0) {
      const sessionCorrect = history.filter((h: any) => h.correct).length;
      const sessionRate = (sessionCorrect / history.length) * 100;
      // Exponential moving average with session performance
      theta = theta * 0.4 + sessionRate * 0.6;
    }

    // Determine target Bloom level based on mastery
    let targetBloom = "apply";
    if (theta >= 90) targetBloom = "evaluate";
    else if (theta >= 80) targetBloom = "analyze";
    else if (theta >= 60) targetBloom = "apply";
    else if (theta >= 40) targetBloom = "understand";
    else targetBloom = "remember";

    // Determine difficulty tier
    let difficultyTier = "medium";
    if (theta >= 80) difficultyTier = "hard";
    else if (theta >= 60) difficultyTier = "medium";
    else if (theta >= 40) difficultyTier = "easy";
    else difficultyTier = "foundational";

    // Identify weak components to focus on
    const weakComponents = (components || []).filter((c: any) => {
      const mastery = (masteryData || []).find((m: any) => m.component_id === c.id);
      return !mastery || mastery.mastery_score < 70;
    });

    const objectives = syllabus?.learning_objectives || [];
    const bloomData = syllabus?.bloom_classifications || [];
    const topicFocus = topic || weakComponents.map((c: any) => c.objective).slice(0, 3).join("; ") || objectives.slice(0, 3).join("; ");
    const numQuestions = questionCount || 5;

    // Fetch textbooks
    const { data: textbooks } = await supabase
      .from("course_textbooks")
      .select("title, author")
      .eq("user_id", user.id)
      .eq("class_name", className);

    const textbookList = (textbooks || []).map((t: any) => `"${t.title}"`).join(", ");

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
            content: `You are an adaptive assessment engine for "${className}". Generate quiz questions calibrated to the student's current ability level.

STUDENT ABILITY ESTIMATE (theta): ${Math.round(theta)}/100
TARGET BLOOM LEVEL: ${targetBloom}
DIFFICULTY TIER: ${difficultyTier}
RECENT PERFORMANCE: ${recentScores.length > 0 ? `avg ${Math.round(avgRecent)}% over ${recentScores.length} recent quizzes` : "no prior data"}

${history.length > 0 ? `IN-SESSION PERFORMANCE: ${history.filter((h: any) => h.correct).length}/${history.length} correct so far` : ""}

WEAK AREAS TO TARGET:
${weakComponents.slice(0, 5).map((c: any) => `- ${c.objective} (Bloom: ${c.bloom_level || "unknown"})`).join("\n") || "None identified — use general topics"}

SYLLABUS OBJECTIVES: ${objectives.slice(0, 8).join("; ")}
TEXTBOOKS: ${textbookList || "None"}

ADAPTIVE RULES:
- If difficulty is "foundational": 40% recall, 40% understand, 20% apply
- If difficulty is "easy": 20% recall, 40% apply, 40% understand
- If difficulty is "medium": 20% understand, 60% apply, 20% analyze
- If difficulty is "hard": 20% apply, 40% analyze, 40% evaluate
- Each question must have plausible distractors based on common misconceptions
- Include difficulty_value (0.0-1.0) for each question for IRT tracking
- Use LaTeX with $ delimiters for math`,
          },
          {
            role: "user",
            content: `Generate ${numQuestions} adaptive quiz questions focused on: "${topicFocus}"`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "generate_adaptive_questions",
              description: "Generate adaptive quiz questions calibrated to student ability",
              parameters: {
                type: "object",
                properties: {
                  questions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "number" },
                        question: { type: "string" },
                        options: { type: "array", items: { type: "string" }, minItems: 4, maxItems: 4 },
                        correctIndex: { type: "number" },
                        explanation: { type: "string" },
                        bloom_level: { type: "string", enum: ["remember", "understand", "apply", "analyze", "evaluate", "create"] },
                        difficulty_value: { type: "number", description: "IRT difficulty parameter 0.0 (easy) to 1.0 (hard)" },
                        misconception: { type: "string", description: "The misconception tested by the distractors" },
                        topic: { type: "string", description: "Specific sub-topic this question tests" },
                        trap_explanation: { type: "string", description: "Why the most common wrong answer is tempting" },
                      },
                      required: ["id", "question", "options", "correctIndex", "explanation", "bloom_level", "difficulty_value", "topic"],
                    },
                  },
                  estimated_theta: { type: "number", description: "Estimated student ability used for calibration" },
                  target_bloom: { type: "string" },
                  difficulty_tier: { type: "string" },
                },
                required: ["questions", "estimated_theta", "target_bloom", "difficulty_tier"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "generate_adaptive_questions" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited" }), {
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
    if (!toolCall) throw new Error("No questions generated");

    let quizData;
    try {
      quizData = typeof toolCall.function.arguments === "string"
        ? JSON.parse(toolCall.function.arguments)
        : toolCall.function.arguments;
    } catch {
      throw new Error("Failed to parse quiz data");
    }

    return new Response(JSON.stringify({
      questions: quizData.questions || [],
      adaptiveParams: {
        estimatedTheta: Math.round(theta),
        targetBloom,
        difficultyTier,
        estimatedThetaFromAI: quizData.estimated_theta,
      },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("adaptive-quiz error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

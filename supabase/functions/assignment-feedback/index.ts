import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const {
      assignmentTitle,
      className,
      parsedContent,
      learningObjectives,
      rubricCriteria,
      studentWriting,
      assessmentType,
    } = await req.json();

    if (!assignmentTitle || !className) {
      return new Response(
        JSON.stringify({ error: "Missing assignmentTitle or className" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const rubricContext = rubricCriteria?.length
      ? `\n\nRubric Criteria:\n${rubricCriteria.map((c: any) => `- ${c.criterion_name} (weight: ${c.weight}): ${c.description || ""}`).join("\n")}`
      : "";

    const objectivesContext = learningObjectives?.length
      ? `\n\nLearning Objectives:\n${learningObjectives.map((o: string, i: number) => `${i + 1}. ${o}`).join("\n")}`
      : "";

    const systemPrompt = `You are an expert university teaching assistant providing detailed, constructive "teaching-style" feedback on student writing assignments. Your feedback should feel like a supportive human instructor — specific, actionable, and encouraging.

Structure your feedback as follows:
1. **Overall Impression** — A brief, encouraging summary of the work's strengths
2. **Content & Accuracy** — How well the content addresses the assignment requirements and learning objectives
3. **Organization & Structure** — Flow, transitions, logical progression of ideas
4. **Critical Thinking** — Depth of analysis, evidence of higher-order thinking (Bloom's Taxonomy)
5. **Writing Quality** — Clarity, grammar, academic tone, citations if applicable
6. **Specific Suggestions** — 3-5 concrete, actionable improvements the student can make
7. **Rubric Alignment** — If rubric criteria are provided, evaluate against each criterion with a score estimate (1-4) and brief justification
8. **Growth Areas** — Areas where the student shows promise and can develop further

Be specific: reference exact passages or ideas from the student's work. Avoid vague praise like "good job" — instead explain WHY something works well. For improvements, explain HOW to fix the issue, not just WHAT is wrong.

Assessment type: ${assessmentType || "general"}`;

    const userMessage = `Assignment: "${assignmentTitle}" for ${className}
${objectivesContext}${rubricContext}

${parsedContent ? `Assignment Requirements:\n${parsedContent.substring(0, 3000)}` : ""}

${studentWriting ? `Student's Submission:\n${studentWriting.substring(0, 8000)}` : "Please provide general feedback guidance for this assignment based on the requirements and rubric."}`;

    const response = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        max_tokens: 2000,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "provide_feedback",
              description: "Structured teaching-style feedback on a writing assignment",
              parameters: {
                type: "object",
                properties: {
                  overallImpression: {
                    type: "string",
                    description: "Brief encouraging summary of the work's strengths",
                  },
                  contentAccuracy: {
                    type: "object",
                    properties: {
                      score: { type: "number", description: "Score 1-4" },
                      feedback: { type: "string" },
                    },
                    required: ["score", "feedback"],
                  },
                  organization: {
                    type: "object",
                    properties: {
                      score: { type: "number" },
                      feedback: { type: "string" },
                    },
                    required: ["score", "feedback"],
                  },
                  criticalThinking: {
                    type: "object",
                    properties: {
                      score: { type: "number" },
                      feedback: { type: "string" },
                    },
                    required: ["score", "feedback"],
                  },
                  writingQuality: {
                    type: "object",
                    properties: {
                      score: { type: "number" },
                      feedback: { type: "string" },
                    },
                    required: ["score", "feedback"],
                  },
                  specificSuggestions: {
                    type: "array",
                    items: { type: "string" },
                    description: "3-5 actionable improvement suggestions",
                  },
                  rubricScores: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        criterion: { type: "string" },
                        score: { type: "number" },
                        justification: { type: "string" },
                      },
                      required: ["criterion", "score", "justification"],
                    },
                  },
                  growthAreas: {
                    type: "array",
                    items: { type: "string" },
                    description: "Areas where the student shows promise",
                  },
                  overallScore: {
                    type: "number",
                    description: "Overall score estimate 1-4",
                  },
                },
                required: [
                  "overallImpression",
                  "contentAccuracy",
                  "organization",
                  "criticalThinking",
                  "writingQuality",
                  "specificSuggestions",
                  "growthAreas",
                  "overallScore",
                ],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: {
          type: "function",
          function: { name: "provide_feedback" },
        },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limited — please try again in a moment" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Add funds in Settings > Workspace > Usage." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      throw new Error("AI gateway error");
    }

    const aiData = await response.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    let feedback;
    if (toolCall?.function?.arguments) {
      feedback = JSON.parse(toolCall.function.arguments);
    } else {
      // Fallback: return raw text
      feedback = {
        overallImpression: aiData.choices?.[0]?.message?.content || "Feedback could not be generated.",
        contentAccuracy: { score: 0, feedback: "" },
        organization: { score: 0, feedback: "" },
        criticalThinking: { score: 0, feedback: "" },
        writingQuality: { score: 0, feedback: "" },
        specificSuggestions: [],
        growthAreas: [],
        overallScore: 0,
      };
    }

    return new Response(JSON.stringify(feedback), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("assignment-feedback error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

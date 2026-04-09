import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { class_name, learning_objectives, bloom_level, assignment_title } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const objectivesList = (learning_objectives || []).map((o: string, i: number) => `${i + 1}. ${o}`).join("\n");

    const systemPrompt = `You are an expert instructional designer who creates detailed, standards-aligned rubrics for higher education courses. You follow best practices in assessment design and Bloom's Taxonomy alignment.`;

    const userPrompt = `Create a detailed rubric for the course "${class_name}"${assignment_title ? ` for the assignment "${assignment_title}"` : ""}.

${bloom_level ? `Target Bloom's Taxonomy level: ${bloom_level}` : ""}

Learning objectives to align with:
${objectivesList || "Generate general course rubric criteria."}

Return a JSON object using this exact structure (use tool calling):
- title: rubric title
- description: brief description of what this rubric assesses
- criteria: array of 4-6 criteria, each with:
  - criterion_name: short name
  - description: what this criterion measures
  - weight: relative weight (all should sum to 100)
  - performance_levels: array of 4 objects with level (Exemplary/Proficient/Developing/Beginning), score (4/3/2/1), and description (specific observable behaviors for that level)
- example: an object with:
  - title: example assignment title
  - description: what a proficient submission looks like
  - example_content: a 2-3 paragraph example of proficient-level work
  - annotations: array of {text, feedback} objects highlighting key elements`;

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
          { role: "user", content: userPrompt },
        ],
        tools: [{
          type: "function",
          function: {
            name: "create_rubric",
            description: "Create a structured rubric with criteria and an assignment example",
            parameters: {
              type: "object",
              properties: {
                title: { type: "string" },
                description: { type: "string" },
                criteria: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      criterion_name: { type: "string" },
                      description: { type: "string" },
                      weight: { type: "number" },
                      performance_levels: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            level: { type: "string", enum: ["Exemplary", "Proficient", "Developing", "Beginning"] },
                            score: { type: "number" },
                            description: { type: "string" },
                          },
                          required: ["level", "score", "description"],
                        },
                      },
                    },
                    required: ["criterion_name", "description", "weight", "performance_levels"],
                  },
                },
                example: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    description: { type: "string" },
                    example_content: { type: "string" },
                    annotations: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          text: { type: "string" },
                          feedback: { type: "string" },
                        },
                        required: ["text", "feedback"],
                      },
                    },
                  },
                  required: ["title", "description", "example_content", "annotations"],
                },
              },
              required: ["title", "description", "criteria", "example"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "create_rubric" } },
      }),
    });

    if (!response.ok) {
      const status = response.status;
      const text = await response.text();
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.error("AI gateway error:", status, text);
      throw new Error(`AI gateway error: ${status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("No tool call in AI response");

    const rubricData = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(rubricData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-rubric error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

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
    const { messages, learningStyles, requestType, className } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Get user from auth header
    const authHeader = req.headers.get("Authorization");
    let syllabiContext = "";
    let userId = null;

    if (authHeader && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      
      // Verify user token
      const token = authHeader.replace("Bearer ", "");
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      
      if (user && !authError) {
        userId = user.id;
        
        // Fetch user's syllabi metadata
        const { data: syllabi, error: syllabiError } = await supabase
          .from("syllabi")
          .select("class_name, file_name")
          .eq("user_id", user.id);

        if (syllabi && syllabi.length > 0 && !syllabiError) {
          const classList = syllabi.map(s => `- ${s.class_name} (${s.file_name})`).join("\n");
          syllabiContext = `\n\nThe student has uploaded syllabi for the following classes:\n${classList}\n\nWhen the student asks about these classes, provide relevant academic support. If they ask about a specific class, focus your responses on that subject area.`;
        }
      }
    }

    const learningStyleContext = learningStyles?.length > 0 
      ? `The student's preferred learning styles are: ${learningStyles.join(", ")}. Adapt your explanations accordingly.`
      : "";

    let systemPrompt = "";
    let useToolCalling = false;

    if (requestType === "placement-quiz-interactive") {
      // Return structured JSON for interactive quiz
      useToolCalling = true;
      systemPrompt = `You are AgentB creating a placement quiz. Generate exactly 10 multiple-choice questions for: ${className || "the subject"}.

${learningStyleContext}

Requirements:
- Questions should progress from basic to advanced
- Each question must have exactly 4 options
- Include clear explanations for the correct answer
- Cover key foundational concepts for this course`;
    } else if (requestType === "placement-quiz") {
      systemPrompt = `You are AgentB, an intelligent AI tutor creating a placement quiz for a student.
      
${learningStyleContext}
${syllabiContext}

Your task is to generate a comprehensive placement quiz for the class: ${className || "the requested subject"}.

Create a placement quiz with 15-20 questions that:
1. Cover foundational concepts that students should know
2. Progress from basic to intermediate to advanced topics
3. Include a mix of question types:
   - Multiple choice (provide 4 options, mark correct with *)
   - True/False
   - Short answer
4. Test understanding, not just memorization
5. Cover key topics typically found in this course

Format your response as:
# Placement Quiz: [Class Name]

## Section 1: Fundamentals (Questions 1-5)
[Basic concept questions]

## Section 2: Core Concepts (Questions 6-12)
[Intermediate questions]

## Section 3: Advanced Topics (Questions 13-20)
[More challenging questions]

---
## Answer Key
[Provide all answers]

After the quiz, provide a brief study guide based on the topics covered.`;
    } else {
      systemPrompt = `You are AgentB, an intelligent AI campus assistant and tutor. You help students with:

1. **Chat Tutoring**: Provide clear, patient explanations of academic concepts
2. **AI Explanations**: Break down complex topics into digestible parts
3. **Discussion Threads**: Engage in Socratic dialogue to deepen understanding
4. **Personalized Follow-ups**: Ask clarifying questions and check comprehension
5. **Written Explanations**: Provide detailed text-based explanations
6. **Real-world Examples**: Connect abstract concepts to practical applications
7. **Diagrams**: Describe visual representations using text-based diagrams when helpful
8. **Pre-quizzes**: Create quick assessment questions to gauge understanding

${learningStyleContext}
${syllabiContext}

Guidelines:
- Be encouraging and supportive
- Use analogies and examples relevant to college students
- Break down complex topics step-by-step
- Ask follow-up questions to ensure understanding
- Provide practice problems when appropriate
- Use markdown formatting for clarity (headers, lists, code blocks)
- For visual learners: describe diagrams and use structured formatting
- For reading/writing learners: provide detailed written explanations
- For kinesthetic learners: suggest hands-on activities and practice
- For auditory learners: use conversational tone and verbal cues

When the user asks for a pre-quiz, create 3-5 questions with multiple choice or short answer format.
When explaining concepts, always offer to provide additional examples or practice problems.
When the user asks about their uploaded classes/syllabi, provide targeted help for those specific courses.`;
    }

    console.log(`AgentB request - Type: ${requestType || "chat"}, User: ${userId || "anonymous"}, Class: ${className || "none"}`);

    // For interactive quizzes, use tool calling to get structured output
    if (useToolCalling) {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            ...messages,
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "generate_quiz",
                description: "Generate a structured placement quiz with multiple choice questions",
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
                          options: { type: "array", items: { type: "string" } },
                          correctIndex: { type: "number", description: "Index of the correct option (0-3)" },
                          explanation: { type: "string", description: "Brief explanation of why the answer is correct" }
                        },
                        required: ["id", "question", "options", "correctIndex", "explanation"]
                      }
                    }
                  },
                  required: ["questions"]
                }
              }
            }
          ],
          tool_choice: { type: "function", function: { name: "generate_quiz" } },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("AI gateway error:", response.status, errorText);
        return new Response(JSON.stringify({ error: "Failed to generate quiz" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await response.json();
      console.log("Quiz response:", JSON.stringify(data).slice(0, 500));

      // Extract questions from tool call
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        try {
          const quizData = JSON.parse(toolCall.function.arguments);
          return new Response(JSON.stringify(quizData), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        } catch (parseError) {
          console.error("Failed to parse quiz data:", parseError);
          return new Response(JSON.stringify({ error: "Failed to parse quiz data" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      return new Response(JSON.stringify({ error: "No quiz data returned" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Standard streaming response for chat
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Usage limit reached. Please add credits to continue." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(JSON.stringify({ error: "AI service temporarily unavailable" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("Agent B chat error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

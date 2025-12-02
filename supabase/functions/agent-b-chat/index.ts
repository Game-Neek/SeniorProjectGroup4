import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, learningStyles, requestType } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const learningStyleContext = learningStyles?.length > 0 
      ? `The student's preferred learning styles are: ${learningStyles.join(", ")}. Adapt your explanations accordingly.`
      : "";

    const systemPrompt = `You are AgentB, an intelligent AI campus assistant and tutor. You help students with:

1. **Chat Tutoring**: Provide clear, patient explanations of academic concepts
2. **AI Explanations**: Break down complex topics into digestible parts
3. **Discussion Threads**: Engage in Socratic dialogue to deepen understanding
4. **Personalized Follow-ups**: Ask clarifying questions and check comprehension
5. **Written Explanations**: Provide detailed text-based explanations
6. **Real-world Examples**: Connect abstract concepts to practical applications
7. **Diagrams**: Describe visual representations using text-based diagrams when helpful
8. **Pre-quizzes**: Create quick assessment questions to gauge understanding

${learningStyleContext}

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
When explaining concepts, always offer to provide additional examples or practice problems.`;

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

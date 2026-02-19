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
    const { messages, learningStyles, requestType, className, quizResult, resourceType, resourceTitle, topic, weakAreas: requestWeakAreas, assignmentId, assignmentTitle, fileUrl } = await req.json();
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
    let toolConfig = null;

    if (requestType === "study-plan") {
      // Generate personalized study plan based on quiz results
      useToolCalling = true;
      const weakAreas = quizResult?.weakAreas?.join(", ") || "general topics";
      const strongAreas = quizResult?.strongAreas?.join(", ") || "none identified";
      const score = quizResult ? `${quizResult.score}/${quizResult.totalQuestions}` : "unknown";

      systemPrompt = `You are AgentB creating a personalized study plan for a student.

Class: ${className || "the course"}
Quiz Score: ${score}
Weak Areas: ${weakAreas}
Strong Areas: ${strongAreas}
${learningStyleContext}

Generate learning objectives that:
1. Focus primarily on weak areas identified from the quiz
2. Prioritize topics based on importance (high/medium/low)
3. Include specific, actionable goals

CRITICAL: Every resource MUST include a real, working external URL. Generate 6-8 study resources with REAL external links.

For each resource, use these URL patterns (replace TOPIC with URL-encoded topic):

VIDEO RESOURCES (use these exact URL formats):
- Crash Course: "https://www.youtube.com/results?search_query=crash+course+TOPIC"
- Khan Academy: "https://www.youtube.com/results?search_query=khan+academy+TOPIC"
- 3Blue1Brown (math): "https://www.youtube.com/results?search_query=3blue1brown+TOPIC"
- Organic Chemistry Tutor: "https://www.youtube.com/results?search_query=organic+chemistry+tutor+TOPIC"
- Professor Dave Explains: "https://www.youtube.com/results?search_query=professor+dave+explains+TOPIC"
- MIT OpenCourseWare: "https://www.youtube.com/results?search_query=MIT+opencourseware+TOPIC"

READING RESOURCES (use these exact URL formats):
- Khan Academy: "https://www.khanacademy.org/search?page_search_query=TOPIC"
- Coursera: "https://www.coursera.org/search?query=TOPIC"
- edX: "https://www.edx.org/search?q=TOPIC"
- GeeksForGeeks: "https://www.geeksforgeeks.org/TOPIC/"
- W3Schools: "https://www.w3schools.com/search/searchresult.asp?q=TOPIC"
- Brilliant.org: "https://brilliant.org/wiki/TOPIC/"

PRACTICE RESOURCES (use these exact URL formats):
- LeetCode: "https://leetcode.com/problemset/?search=TOPIC"
- HackerRank: "https://www.hackerrank.com/domains?filters%5Bskills%5D%5B%5D=TOPIC"
- Quizlet: "https://quizlet.com/search?query=TOPIC&type=sets"

NEVER use Wikipedia. ALWAYS include the url and source fields for every resource.
Match resources to learning style: ${learningStyles?.join(", ") || "visual, reading"}.
Include mix of: 2-3 videos, 2-3 reading materials, 1-2 practice resources.`;

      toolConfig = {
        tools: [
          {
            type: "function",
            function: {
              name: "generate_study_plan",
              description: "Generate personalized learning objectives and study resources with real URLs",
              parameters: {
                type: "object",
                properties: {
                  objectives: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "number" },
                        topic: { type: "string" },
                        description: { type: "string" },
                        priority: { type: "string", enum: ["high", "medium", "low"] },
                        completed: { type: "boolean" }
                      },
                      required: ["id", "topic", "description", "priority"]
                    }
                  },
                  resources: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "number" },
                        title: { type: "string" },
                        type: { type: "string", enum: ["video", "reading", "practice", "audio"] },
                        topic: { type: "string" },
                        description: { type: "string" },
                        estimatedTime: { type: "string" },
                        url: { type: "string", description: "Direct URL to YouTube search, Khan Academy, Wikipedia, etc." },
                        source: { type: "string", description: "Source name like YouTube, Khan Academy, Wikipedia" }
                      },
                      required: ["id", "title", "type", "topic", "description", "estimatedTime", "url", "source"]
                    }
                  }
                },
                required: ["objectives", "resources"]
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "generate_study_plan" } }
      };
    } else if (requestType === "mini-quiz") {
      // Generate a quick 5-question mini quiz for weak areas
      useToolCalling = true;
      const focusAreas = requestWeakAreas || [];
      systemPrompt = `You are AgentB creating a quick mini-quiz to help a student review their weak areas.

Class: ${className || "the course"}
Focus Areas: ${focusAreas.join(", ") || "general review"}
${learningStyleContext}

Generate exactly 5 multiple-choice questions that:
1. Target the specific weak areas mentioned
2. Help reinforce understanding of difficult concepts
3. Include clear explanations for each answer
4. Progress from easier to slightly harder questions

Each question must have exactly 4 options with one correct answer.`;

      toolConfig = {
        tools: [
          {
            type: "function",
            function: {
              name: "generate_quiz",
              description: "Generate a mini quiz with exactly 5 questions - no more, no less",
              parameters: {
                type: "object",
                properties: {
                  questions: {
                    type: "array",
                    minItems: 5,
                    maxItems: 5,
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "number" },
                        question: { type: "string" },
                        options: { type: "array", items: { type: "string" }, minItems: 4, maxItems: 4 },
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
        tool_choice: { type: "function", function: { name: "generate_quiz" } }
      };
    } else if (requestType === "interactive-exercises") {
      // Generate practice exercises with hints and solutions
      useToolCalling = true;
      const focusAreas = requestWeakAreas || [];
      systemPrompt = `You are AgentB creating interactive practice exercises for a student.

Class: ${className || "the course"}
Focus Areas: ${focusAreas.join(", ") || "general practice"}
${learningStyleContext}

Generate exactly 5 practice problems that:
1. Target the specific weak areas mentioned
2. Include varying difficulty levels (easy, medium, hard)
3. Provide helpful hints that guide without giving away the answer
4. Include detailed step-by-step solutions

Create problems that require working through steps, not just multiple choice.`;

      toolConfig = {
        tools: [
          {
            type: "function",
            function: {
              name: "generate_exercises",
              description: "Generate exactly 5 practice exercises with hints and solutions - no more, no less",
              parameters: {
                type: "object",
                properties: {
                  exercises: {
                    type: "array",
                    minItems: 5,
                    maxItems: 5,
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "number" },
                        problem: { type: "string", description: "The problem statement" },
                        hint: { type: "string", description: "A helpful hint without giving away the answer" },
                        solution: { type: "string", description: "Step-by-step solution" },
                        topic: { type: "string", description: "The topic this problem covers" },
                        difficulty: { type: "string", enum: ["easy", "medium", "hard"] }
                      },
                      required: ["id", "problem", "hint", "solution", "topic", "difficulty"]
                    }
                  }
                },
                required: ["exercises"]
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "generate_exercises" } }
      };
    } else if (requestType === "placement-quiz-interactive") {
      // Return structured JSON for interactive quiz
      useToolCalling = true;
      systemPrompt = `You are AgentB creating a comprehensive placement quiz. Generate exactly 20 multiple-choice questions for: ${className || "the subject"}.

${learningStyleContext}

IMPORTANT: Create a thorough assessment that covers ALL key topics from this course.

Structure the questions in 4 sections:
1. **Section 1: Fundamentals (Questions 1-5)** - Basic foundational concepts every student should know
2. **Section 2: Core Concepts (Questions 6-10)** - Essential course material and key principles  
3. **Section 3: Applied Knowledge (Questions 11-15)** - Application of concepts to real problems
4. **Section 4: Advanced Topics (Questions 16-20)** - Challenging questions testing deeper understanding

Requirements for EACH question:
- Must have exactly 4 distinct options (no duplicates, no "all of the above")
- Include a detailed explanation (2-3 sentences) that teaches the concept
- Explanations should help visual/reading learners understand WHY the answer is correct
- Cover different subtopics within the course (don't repeat the same concept)
- Questions should test understanding, not just memorization
- Include real-world applications where relevant

Topics to cover (adapt to the specific course):
- Key definitions and terminology
- Core principles and theories
- Common formulas/processes/methodologies
- Problem-solving applications
- Connections between concepts
- Edge cases and exceptions`;
    } else if (requestType === "resource-content") {
      // Generate detailed content for a study resource
      const resourceTypeGuide = {
        video: "Create a video script/lecture outline with clear sections, key points, and visual cues. Include timestamps and talking points.",
        reading: "Create comprehensive reading material with clear headings, explanations, examples, and key takeaways.",
        practice: "Create practice exercises with problems, step-by-step solutions, and tips. Include varying difficulty levels.",
        audio: "Create a podcast-style script with conversational explanations, mnemonics, and verbal cues for learning.",
      };

      systemPrompt = `You are AgentB creating detailed study content.
      
Topic: ${topic || "the subject"}
Resource Title: ${resourceTitle}
Resource Type: ${resourceType}
${learningStyleContext}

${resourceTypeGuide[resourceType as keyof typeof resourceTypeGuide] || "Create helpful educational content."}

Create comprehensive, engaging content that helps the student understand and master this topic. Use clear formatting with headers, bullet points, and examples where appropriate.`;
    } else if (requestType === "parse-assignment") {
      // Parse assignment and extract learning objectives
      useToolCalling = true;
      systemPrompt = `You are AgentB analyzing a student's assignment to extract learning objectives.

Assignment: ${assignmentTitle || "Assignment"}
Class: ${className || "the course"}
${learningStyleContext}

Analyze this assignment and extract:
1. The main learning objectives the professor expects students to master
2. Key topics and concepts covered
3. Skills being assessed

Be specific and actionable. These objectives will be used to generate personalized study content.`;

      toolConfig = {
        tools: [
          {
            type: "function",
            function: {
              name: "extract_assignment_objectives",
              description: "Extract learning objectives and key topics from an assignment",
              parameters: {
                type: "object",
                properties: {
                  learningObjectives: {
                    type: "array",
                    items: { type: "string" },
                    description: "List of specific learning objectives from the assignment"
                  },
                  keyTopics: {
                    type: "array",
                    items: { type: "string" },
                    description: "Key topics and concepts covered"
                  },
                  skillsAssessed: {
                    type: "array",
                    items: { type: "string" },
                    description: "Skills being tested or developed"
                  },
                  suggestedStudyAreas: {
                    type: "array",
                    items: { type: "string" },
                    description: "Recommended areas to focus on for this assignment"
                  },
                  parsedContent: {
                    type: "string",
                    description: "Brief summary of the assignment content"
                  }
                },
                required: ["learningObjectives", "keyTopics", "parsedContent"]
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "extract_assignment_objectives" } }
      };
    } else if (requestType === "parse-syllabus") {
      // AI-driven Outline Builder: extract key components from a syllabus
      useToolCalling = true;
      systemPrompt = `You are AgentB analyzing a course syllabus to extract its key structural components.

Class: ${className || "the course"}
${learningStyleContext}

Carefully read the syllabus content and extract:
1. **Course Description**: A concise summary of what the course covers
2. **Learning Objectives**: Specific outcomes students should achieve
3. **Weekly Schedule**: Week-by-week breakdown of topics (if available)
4. **Grading Policy**: How grades are determined (exams, homework, participation percentages)
5. **Required Materials**: Textbooks, software, or other required items

Be thorough and precise. Extract exactly what the syllabus states — do not invent information not present in the document.`;

      toolConfig = {
        tools: [
          {
            type: "function",
            function: {
              name: "extract_syllabus_outline",
              description: "Extract structured outline from a course syllabus",
              parameters: {
                type: "object",
                properties: {
                  courseDescription: {
                    type: "string",
                    description: "Concise course description summarizing what the course covers"
                  },
                  learningObjectives: {
                    type: "array",
                    items: { type: "string" },
                    description: "List of specific learning objectives from the syllabus"
                  },
                  weeklySchedule: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        week: { type: "number" },
                        topic: { type: "string" },
                        details: { type: "string" }
                      },
                      required: ["week", "topic"]
                    },
                    description: "Week-by-week topic schedule"
                  },
                  gradingPolicy: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        component: { type: "string" },
                        weight: { type: "string" }
                      },
                      required: ["component", "weight"]
                    },
                    description: "Grading breakdown (e.g., Midterm 30%, Final 40%)"
                  },
                  requiredMaterials: {
                    type: "array",
                    items: { type: "string" },
                    description: "Required textbooks, software, or materials"
                  },
                  parsedSummary: {
                    type: "string",
                    description: "Brief overall summary of the syllabus content"
                  }
                },
                required: ["courseDescription", "learningObjectives", "parsedSummary"]
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "extract_syllabus_outline" } }
      };
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

    // For tool calling requests (quizzes, study plans)
    if (useToolCalling) {
      const quizTools = {
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
        tool_choice: { type: "function", function: { name: "generate_quiz" } }
      };

      const activeToolConfig = toolConfig || quizTools;

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
          ...activeToolConfig,
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

    // Non-streaming response for resource content with caching
    if (requestType === "resource-content") {
      const sortedStyles = [...(learningStyles || [])].sort();
      
      // Check if we have cached content for this resource + learning style combo
      if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        
        const { data: cachedResource, error: cacheError } = await supabase
          .from("generated_resources")
          .select("content, id, usage_count")
          .eq("resource_type", resourceType)
          .eq("resource_title", resourceTitle)
          .eq("topic", topic)
          .contains("learning_styles", sortedStyles)
          .maybeSingle();

        if (cachedResource && !cacheError) {
          console.log(`Cache hit for resource: ${resourceTitle}, styles: ${sortedStyles.join(", ")}`);
          
          // Increment usage count
          await supabase
            .from("generated_resources")
            .update({ usage_count: (cachedResource.usage_count || 0) + 1 })
            .eq("id", cachedResource.id);

          return new Response(JSON.stringify({ content: cachedResource.content, cached: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      // Generate new content if not cached
      console.log(`Cache miss - generating content for: ${resourceTitle}, styles: ${sortedStyles.join(", ")}`);
      
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
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("AI gateway error:", response.status, errorText);
        return new Response(JSON.stringify({ error: "Failed to generate content" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "Content generation failed.";
      
      // Save to cache for future users with same learning style
      if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY && content !== "Content generation failed.") {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        
        const { error: insertError } = await supabase
          .from("generated_resources")
          .upsert({
            resource_type: resourceType,
            resource_title: resourceTitle,
            topic: topic,
            learning_styles: sortedStyles,
            content: content,
          }, {
            onConflict: "resource_type,resource_title,topic,learning_styles"
          });

        if (insertError) {
          console.error("Failed to cache resource:", insertError);
        } else {
          console.log(`Cached new resource: ${resourceTitle} for styles: ${sortedStyles.join(", ")}`);
        }
      }
      
      return new Response(JSON.stringify({ content, cached: false }), {
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

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
    const { messages, learningStyles, requestType, className, quizResult, resourceType, resourceTitle, topic, weakAreas: requestWeakAreas, assignmentId, assignmentTitle, fileUrl, moduleType, moduleTitle } = await req.json();
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

    let syllabusTopics = "";
    let textbookContext = "";

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
          .select("class_name, file_name, learning_objectives, weekly_schedule, course_description")
          .eq("user_id", user.id);

        if (syllabi && syllabi.length > 0 && !syllabiError) {
          const classList = syllabi.map(s => `- ${s.class_name} (${s.file_name})`).join("\n");
          syllabiContext = `\n\nThe student has uploaded syllabi for the following classes:\n${classList}\n\nWhen the student asks about these classes, provide relevant academic support. If they ask about a specific class, focus your responses on that subject area.`;

          // Extract topics for the specific class being quizzed
          if (className) {
            const matchedSyllabus = syllabi.find(s => s.class_name === className);
            if (matchedSyllabus) {
              const objectives = matchedSyllabus.learning_objectives || [];
              const schedule = matchedSyllabus.weekly_schedule || [];
              const courseDesc = matchedSyllabus.course_description || "";

              const weeklyTopics = Array.isArray(schedule)
                ? schedule.map((w: any) => w.topic).filter(Boolean)
                : [];

              const allTopics = [...new Set([...objectives, ...weeklyTopics])];

              if (allTopics.length > 0) {
                syllabusTopics = `\n\nACTUAL SYLLABUS TOPICS for "${className}" (use ONLY these as quiz content sources):\n${allTopics.map((t, i) => `${i + 1}. ${t}`).join("\n")}`;
                if (courseDesc) {
                  syllabusTopics += `\n\nCourse Description: ${courseDesc}`;
                }
              }
            }
          }
        }

        // Fetch assigned textbooks for the class
        if (className) {
          const { data: textbooks } = await supabase
            .from("course_textbooks")
            .select("title, author, requirement_type")
            .eq("user_id", user.id)
            .eq("class_name", className);

          if (textbooks && textbooks.length > 0) {
            const tbList = textbooks.map(tb => 
              `- "${tb.title}"${tb.author ? ` by ${tb.author}` : ""} (${tb.requirement_type})`
            ).join("\n");
            textbookContext = `\n\nASSIGNED TEXTBOOKS for "${className}":\n${tbList}\n\nIMPORTANT: When recommending study materials, ALIGN with these textbooks. Suggest supplementary resources that COMPLEMENT (not replace) the assigned textbook. Reference textbook chapters, terminology, and notation where possible.`;
          }
        }
      }
    }

    const learningStyleContext = learningStyles?.length > 0 
      ? `The student's preferred learning styles are: ${learningStyles.join(", ")}. Adapt your explanations accordingly.`
      : "";

    // AI Bias Prevention Directives (applied to all AI requests)
    const biasGuardrails = `
ALGORITHMIC FAIRNESS DIRECTIVES (MANDATORY):
- Generate content that is culturally neutral and inclusive of diverse backgrounds
- Do NOT assume student demographics, socioeconomic status, or cultural context
- Use gender-neutral language and diverse name representations in examples
- Avoid stereotypes in scenarios (e.g., do not associate specific demographics with specific fields)
- Assessment difficulty must be based ONLY on cognitive complexity, never cultural familiarity
- Ensure examples are accessible to international students and non-native English speakers
- Do not favor or penalize any learning style — adapt content equitably
- If generating scenarios, rotate cultural contexts and avoid Western-centric defaults
- Mathematical and scientific content must use universal notation standards`;

    let systemPrompt = "";
    let useToolCalling = false;
    let toolConfig = null;

    // Audit logging helper
    const logAuditEvent = async (action: string, entityType: string, entityId?: string, metadata?: Record<string, unknown>) => {
      if (userId && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
        const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        await adminClient.from("audit_logs").insert({
          user_id: userId,
          action,
          entity_type: entityType,
          entity_id: entityId || null,
          metadata: metadata || {},
        });
      }
    };

    if (requestType === "structured-study-plan") {
      // Generate structured focus areas with 3-step modules from syllabus
      useToolCalling = true;
      systemPrompt = `You are AgentB creating a STRUCTURED STUDY PLAN for "${className || "the course"}".
${learningStyleContext}
${syllabusTopics}
${textbookContext}

INSTRUCTIONS:
- Create focus areas from the ACTUAL SYLLABUS TOPICS listed above (or infer logical topics if not available)
- Order focus areas by prerequisite logic or syllabus timeline
- Convert each topic into a SHORT, CLEAN chapter name (2-5 words). Examples:
  "Identify the major energy systems used during exercise" → "Energy Systems"
  "Understanding chemical bonding and molecular structure" → "Chemical Bonding"
  "Introduction to data structures and algorithms" → "Data Structures"
- Each focus area must have EXACTLY 3 modules in this order:

MODULE TYPES (use exactly these values in this exact order):
1. "lesson" — Concept explanation adapted to learning style (visual → diagrams; practical → worked examples; conceptual → reasoning). Reference assigned textbook chapters and terminology where applicable.
2. "practice" — Guided application questions with progressive difficulty. Frame problems using textbook notation and terminology.
3. "quiz" — Benchmark quiz (assessment for mastery)

Each module title should be specific and descriptive.
Generate 4-8 focus areas depending on the course scope.`;

      toolConfig = {
        tools: [{
          type: "function",
          function: {
            name: "generate_structured_plan",
            description: "Generate structured focus areas with 3-step learning modules (Lesson → Practice → Quiz)",
            parameters: {
              type: "object",
              properties: {
                focus_areas: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      topic: { type: "string", description: "Short 2-5 word chapter name" },
                      estimated_time_minutes: { type: "number" },
                      modules: {
                        type: "array",
                        minItems: 3,
                        maxItems: 3,
                        items: {
                          type: "object",
                          properties: {
                            module_type: { type: "string", enum: ["lesson", "practice", "quiz"] },
                            title: { type: "string" },
                            description: { type: "string" },
                            estimated_time_minutes: { type: "number" },
                          },
                          required: ["module_type", "title", "description"]
                        }
                      }
                    },
                    required: ["topic", "modules"]
                  }
                }
              },
              required: ["focus_areas"]
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "generate_structured_plan" } }
      };
    } else if (requestType === "targeted-review") {
      // Generate targeted review lesson for missed concepts
      const weakTopics = requestWeakAreas || [];
      systemPrompt = `You are AgentB generating a TARGETED REVIEW LESSON.

Class: ${className || "the course"}
Topic: ${topic || "general"}
Missed Concepts: ${weakTopics.join(", ")}
${learningStyleContext}
${syllabusTopics}
${textbookContext}

${biasGuardrails}

CRITICAL RULES:
- This review is for a student who FAILED the benchmark quiz (<70%)
- Focus ONLY on the specific missed concepts listed above
- Adapt the teaching approach to the student's learning style:
  Visual → diagrams, step-by-step visuals, flowcharts
  Conceptual → clear explanations, reasoning chains, comparisons
  Practical → worked examples, real-world applications, walkthroughs
- For each missed concept:
  1. Re-explain the core idea clearly
  2. Show WHY common mistakes happen (trap answer analysis)
  3. Provide a corrected worked example
  4. Give a "try this" practice problem with solution
- Use LaTeX for math with $ delimiters
- Keep content focused and actionable — this is remediation, not a full lesson`;

    } else if (requestType === "module-content") {
      // Generate content for a specific learning module
      const learningStyleName = (learningStyles && learningStyles.length > 0) ? learningStyles[0] : "Visual";

      systemPrompt = `You are AgentB generating learning content for a specific module.

Class: ${className || "the course"}
Topic: ${topic || "general"}
Module Type: ${moduleType || "lesson"}
Module Title: ${moduleTitle || "Module"}
Student's Primary Learning Style: ${learningStyleName}
${syllabusTopics}
${textbookContext}

${biasGuardrails}

CONTENT GENERATION RULES based on module type:

═══════════════════════════════════════
IF MODULE TYPE IS "lesson":
═══════════════════════════════════════

Generate a structured lesson with these EXACT sections:

## 1. Concept Overview
- Clear explanation of the topic
- Define key ideas in context (not just definitions)
- Why this concept matters

## 2. Intuition
- Explain WHY the concept works
- Use real-world or practical examples
- Connect to prior knowledge

## 3. Step-by-Step Example
- Walk through a FULL example problem
- Show each step clearly with reasoning
- Use LaTeX with $ delimiters for math

## 4. Key Takeaways
- Bullet points summarizing what to remember
- Common mistakes to avoid

## 5. Preparation for Practice
- Briefly explain how this concept will appear in problems
- What skills the student should be ready to apply

LEARNING STYLE ADAPTATION (CRITICAL — adapt the DELIVERY, not the content):

If student is "Visual":
- Describe diagrams, charts, labeled visuals
- Use step-by-step visual breakdowns
- Describe color-coded processes
- Use tables and structured layouts
- Help the student SEE how the concept works

If student is "Auditory":
- Write in a conversational, tutor-speaking style
- Use "talk-through" explanations ("Imagine I'm explaining this to you...")
- Include verbal reasoning chains
- Add discussion prompts and "think about it" moments
- Help the student HEAR and follow the logic

If student is "Reading/Writing":
- Use structured written explanations with clear headers
- Provide definitions in context
- Include note-friendly summaries
- Add written examples and bullet point takeaways
- Include reflection prompts or short written response ideas
- Help the student learn through TEXT and NOTES

If student is "Kinesthetic":
- Emphasize hands-on problem solving
- Include guided "do this now" activities
- Use interactive step-by-step tasks
- Frame learning through action and applied examples
- Help the student learn by DOING, not just reading

TEXTBOOK INTEGRATION:
- If textbooks are listed above, reference relevant chapters and use the textbook's terminology and notation
- Suggest specific textbook sections for deeper reading as supplementary (not replacement) references
- Frame examples using textbook notation conventions

CONSTRAINTS:
- Do NOT give definitions only — must prepare student for solving problems
- Keep content concise but instructional (800-1200 words ideal)
- Use LaTeX with $ delimiters for all math
- Use markdown formatting with proper headers

═══════════════════════════════════════
IF MODULE TYPE IS "practice":
═══════════════════════════════════════

Present 4-5 guided practice problems with PROGRESSIVE DIFFICULTY:

Start → basic application
Middle → multi-step problems
End → analysis / real-world scenarios

For EACH problem provide:
1. **Problem Statement** (clear, specific)
2. **Hint** (guide thinking without giving away the answer)
3. **Step-by-Step Solution** (show all work)

RULES:
- 80% must be application/problem-solving questions
- Maximum 20% conceptual (and even then, test understanding not recall)
- NEVER generate "What is X?" or "Define Y" problems
- Every problem must require: computing, applying formulas, multi-step reasoning, or analysis
- Use subject-aware formatting:
  Math → equations, derivatives, integrals
  CS → code snippets, debugging, algorithm tracing
  Chemistry → reactions, stoichiometry, calculations
  Physics → formulas with values, unit conversions

═══════════════════════════════════════
IF MODULE TYPE IS "quiz":
═══════════════════════════════════════
- Return: "This module contains the benchmark quiz. Click the quiz button to begin."

Use markdown formatting throughout. Be engaging and focused.`;

    } else if (requestType === "study-plan") {
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
      systemPrompt = `You are AgentB creating a mini-quiz to test APPLIED understanding.

Class: ${className || "the course"}
Focus Areas: ${focusAreas.join(", ") || "general review"}
${learningStyleContext}
${syllabusTopics}
${textbookContext}

QUESTION QUALITY RULES — MANDATORY:
- 80% of questions (4 out of 5) MUST be application/problem-solving questions
- Maximum 1 out of 5 may be conceptual (and even then, test understanding, not recall)
- NEVER generate basic definition questions like "What is X?" or "Define Y"
- Every question must require the student to: compute, solve, apply a formula, analyze a scenario, debug code, or work through steps

SUBJECT-AWARE FORMATTING:
- Math: Include actual equations, expressions, derivatives, integrals, word problems
- CS: Include code snippets, algorithm tracing, debugging scenarios, output prediction
- Chemistry: Include reactions, formula balancing, stoichiometry calculations
- Physics: Include formulas with values, unit conversions, applied force/energy problems
- General: Scenario-based questions requiring analysis and reasoning

VISUAL QUESTION GENERATION — IMPORTANT:
- For 30-50% of questions, include a visual component when applicable
- Set visual_required=true and provide visual_type + visual_data for rendering
- Supported visual_type values: "graph", "free_body_diagram", "molecule", "velocity_time_graph", "position_time_graph", "none"
- For graph visuals: provide { "function": "y = x^2 - 4x + 3", "range": [-2, 6] }
- For physics graphs: provide { "dataPoints": [...], "xLabel": "Time (s)", "yLabel": "Velocity (m/s)" }
- For free body diagrams: provide { "forces": [{ "label": "Gravity", "direction": "down" }, ...] }
- For molecule: provide { "formula": "H2O" }
- Only use visual types that match the subject matter

EXAMPLE TRANSFORMATIONS:
❌ "What is a derivative?" → ✅ "Find the derivative of f(x) = 3x² + 2x − 5"
❌ "What is a scalar?" → ✅ "A force of 10N is applied at 30°. Find the horizontal component."
❌ "Define polymorphism" → ✅ "Given class Animal with method speak(), what output does this code produce: ..."

Generate exactly 5 multiple-choice questions with 4 options each and clear explanations.

TRAP ANSWER FEEDBACK (CRITICAL):
- Each WRONG answer option must map to a specific misconception
- For each question, include a "misconception" field describing what concept the student is weak on if they get it wrong
- Include a "trap_explanation" field that explains: why common wrong answers are wrong, what thinking led to them, and how to rethink the problem
- Example: If the trap answer uses the wrong formula, explain which formula should be used and why

DIFFICULTY PROGRESSION within the quiz:
- Questions 1-2: Basic application
- Questions 3-4: Multi-step problems
- Question 5: Analysis / real-world scenario

IMPORTANT: Use LaTeX math notation with dollar sign delimiters for ALL mathematical expressions (e.g. $f(x) = 3x^2$, $\\theta = 30^\\circ$). This applies to questions, options, AND explanations.`;

      toolConfig = {
        tools: [
          {
            type: "function",
            function: {
              name: "generate_quiz",
              description: "Generate a mini quiz with exactly 5 questions including misconception tracking and trap answer feedback.",
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
                        explanation: { type: "string", description: "Brief explanation of why the answer is correct" },
                        misconception: { type: "string", description: "The specific concept the student is weak on if they get this wrong" },
                        trap_explanation: { type: "string", description: "Why common wrong answers are wrong, what thinking led to them, and how to rethink" },
                        visual_required: { type: "boolean", description: "Whether this question benefits from a visual representation" },
                        visual_type: { type: "string", enum: ["graph", "free_body_diagram", "molecule", "velocity_time_graph", "position_time_graph", "none"], description: "Type of visual to render" },
                        visual_data: {
                          type: "object",
                          description: "Structured data for rendering the visual.",
                          properties: {
                            function: { type: "string" },
                            range: { type: "array", items: { type: "number" } },
                            dataPoints: { type: "array", items: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } } } },
                            xLabel: { type: "string" },
                            yLabel: { type: "string" },
                            forces: { type: "array", items: { type: "object", properties: { label: { type: "string" }, direction: { type: "string" } } } },
                            formula: { type: "string" },
                            points: { type: "array", items: { type: "object", properties: { x: { type: "number" }, y: { type: "number" }, label: { type: "string" } } } }
                          }
                        }
                      },
                      required: ["id", "question", "options", "correctIndex", "explanation", "misconception", "trap_explanation"]
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
      systemPrompt = `You are AgentB creating interactive practice exercises requiring APPLIED problem solving.

Class: ${className || "the course"}
Focus Areas: ${focusAreas.join(", ") || "general practice"}
${learningStyleContext}
${syllabusTopics}

EXERCISE QUALITY RULES — MANDATORY:
- ALL exercises must require computation, multi-step reasoning, or hands-on problem solving
- NEVER create exercises that only ask to define, list, or recall terms
- Every problem must require the student to work through steps to arrive at an answer

SUBJECT-AWARE FORMATTING:
- Math: Provide equations to solve, proofs to complete, expressions to simplify, word problems with numerical answers
- CS: Provide code to debug, functions to implement, algorithm outputs to trace, complexity to analyze
- Chemistry: Provide reactions to balance, concentrations to calculate, molecular structures to analyze
- Physics: Provide scenarios with given values requiring formula application and numerical solutions

VISUAL EXERCISE GENERATION — IMPORTANT:
- For 30-50% of exercises, include a visual component when applicable
- Set visual_required=true and provide visual_type + visual_data for rendering
- Supported visual_type values: "graph", "free_body_diagram", "molecule", "velocity_time_graph", "position_time_graph", "none"
- For graph visuals: provide { "function": "y = x^2 - 4x + 3", "range": [-2, 6] }
- For physics: provide { "dataPoints": [...], "xLabel": "Time (s)", "yLabel": "Velocity (m/s)" } or { "forces": [...] }
- For molecules: provide { "formula": "H2O" }

Generate exactly 5 practice problems with varying difficulty (easy, medium, hard).
Each must include a helpful hint and a detailed step-by-step solution.
IMPORTANT: Use LaTeX math notation with dollar sign delimiters for ALL mathematical expressions (e.g. $f(x) = 3x^2$, $\\theta = 30^\\circ$). This applies to problems, hints, AND solutions.`;

      toolConfig = {
        tools: [
          {
            type: "function",
            function: {
              name: "generate_exercises",
              description: "Generate exactly 5 practice exercises with hints, solutions, and optional visual data",
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
                        difficulty: { type: "string", enum: ["easy", "medium", "hard"] },
                        visual_required: { type: "boolean", description: "Whether this exercise benefits from a visual" },
                        visual_type: { type: "string", enum: ["graph", "free_body_diagram", "molecule", "velocity_time_graph", "position_time_graph", "none"] },
                        visual_data: {
                          type: "object",
                          description: "Structured data for rendering the visual",
                          properties: {
                            function: { type: "string" },
                            range: { type: "array", items: { type: "number" } },
                            dataPoints: { type: "array", items: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } } } },
                            xLabel: { type: "string" },
                            yLabel: { type: "string" },
                            forces: { type: "array", items: { type: "object", properties: { label: { type: "string" }, direction: { type: "string" } } } },
                            formula: { type: "string" },
                            points: { type: "array", items: { type: "object", properties: { x: { type: "number" }, y: { type: "number" }, label: { type: "string" } } } }
                          }
                        }
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
    } else if (requestType === "topic-placement-quiz") {
      // Generate a quick 5-question placement quiz for a specific topic to assess initial mastery
      useToolCalling = true;
      const focusTopic = topic || "general";
      systemPrompt = `You are AgentB creating a TOPIC PLACEMENT QUIZ to assess a student's EXISTING knowledge of "${focusTopic}" in "${className || "the course"}".

${learningStyleContext}
${syllabusTopics}
${textbookContext}

PURPOSE: This is a DIAGNOSTIC quiz to determine if the student already knows this topic well enough to skip it.
Unlike benchmark quizzes (which test after learning), this tests PRIOR knowledge.

CRITICAL RULES:
- Generate exactly 5 multiple-choice questions about "${focusTopic}"
- Questions should use the TERMINOLOGY and NOTATION from the assigned textbook (if listed above)
- 80% application-based, max 20% conceptual
- Progressive difficulty: Q1-2 foundational, Q3-4 intermediate, Q5 advanced
- Each question must have 4 options with one correct answer
- Include an explanation for each correct answer
- Include misconception tracking for wrong answers
- Use LaTeX for math with $ delimiters
- Frame questions around the specific topic, not general course content

${biasGuardrails}`;

      toolConfig = {
        tools: [{
          type: "function",
          function: {
            name: "generate_quiz",
            description: "Generate a 5-question topic placement quiz with misconception tracking",
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
                      correctIndex: { type: "number" },
                      explanation: { type: "string" },
                      misconception: { type: "string" },
                      trap_explanation: { type: "string" },
                      visual_required: { type: "boolean" },
                      visual_type: { type: "string", enum: ["graph", "free_body_diagram", "molecule", "velocity_time_graph", "position_time_graph", "none"] },
                      visual_data: {
                        type: "object",
                        properties: {
                          function: { type: "string" },
                          range: { type: "array", items: { type: "number" } },
                          dataPoints: { type: "array", items: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } } } },
                          xLabel: { type: "string" },
                          yLabel: { type: "string" },
                          forces: { type: "array", items: { type: "object", properties: { label: { type: "string" }, direction: { type: "string" } } } },
                          formula: { type: "string" }
                        }
                      }
                    },
                    required: ["id", "question", "options", "correctIndex", "explanation", "misconception", "trap_explanation"]
                  }
                }
              },
              required: ["questions"]
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "generate_quiz" } }
      };
    } else if (requestType === "placement-quiz-interactive") {
      // Return structured JSON for interactive quiz
      useToolCalling = true;
      systemPrompt = `You are AgentB creating a rigorous placement quiz that assesses REAL understanding through application. Generate exactly 10 multiple-choice questions for: ${className || "the subject"}.

${learningStyleContext}
${syllabusTopics}
${textbookContext}

CRITICAL — QUESTION QUALITY RULES:
- 80% of questions (8 out of 10) MUST be application/problem-solving questions
- Maximum 20% (2 out of 10) may be conceptual — and even those must test understanding, NOT simple recall
- NEVER generate basic definition questions like "What is X?", "Define Y", or "Which term describes Z?"
- Every question must require the student to: compute, solve, apply a formula, analyze a scenario, debug, trace logic, or work through multi-step reasoning

SUBJECT-AWARE QUESTION FORMATTING (detect subject from course name/syllabus):
- Math: equations to solve, derivatives/integrals to compute, algebraic expressions to simplify, word problems
- CS: code snippets to trace, debugging questions, algorithm analysis, output prediction
- Chemistry: reactions to balance, stoichiometry calculations, molecular formula problems
- Physics: formulas with given values, unit-based problems, applied force/energy/motion scenarios
- General: scenario-based analysis requiring reasoning and application

VISUAL QUESTION GENERATION — IMPORTANT:
- For 30-50% of questions (3-5 out of 10), include a visual component when the subject supports it
- Set visual_required=true and provide visual_type + visual_data for rendering
- Supported visual_type values: "graph", "free_body_diagram", "molecule", "velocity_time_graph", "position_time_graph", "none"
- For graph visuals: provide { "function": "y = x^2 - 4x + 3", "range": [-2, 6] }
- For physics graphs: provide { "dataPoints": [{"x":0,"y":0},{"x":1,"y":5},...], "xLabel": "Time (s)", "yLabel": "Velocity (m/s)" }
- For free body diagrams: provide { "forces": [{ "label": "Gravity", "direction": "down" }, { "label": "Normal", "direction": "up" }] }
- For molecule: provide { "formula": "H2O" }
- Only use visual types that match the subject matter

SYLLABUS ALIGNMENT:
- If syllabus topics are provided above, derive ALL questions from those specific topics
- Do NOT invent topics outside the syllabus

Structure in 2 sections:
1. **Foundational Application (Questions 1-5)** - Apply basic concepts
2. **Advanced Problem Solving (Questions 6-10)** - Multi-step problems

Requirements for EACH question:
- Exactly 4 distinct options
- Include a brief explanation showing solution steps
- Cover different subtopics
- IMPORTANT: Use LaTeX math notation with dollar sign delimiters for ALL mathematical expressions. For example: $f(x) = 3x^2 + 2x - 5$, $\\mathbf{p} = [x, y]^T$, $\\theta = 90^\\circ$. This applies to questions, options, AND explanations.`;
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
      // Parse assignment, extract learning objectives, and auto-classify assessment type
      useToolCalling = true;
      systemPrompt = `You are AgentB analyzing a student's assignment to extract learning objectives and classify its assessment type.

Assignment: ${assignmentTitle || "Assignment"}
Class: ${className || "the course"}
${learningStyleContext}

Analyze this assignment and extract:
1. The main learning objectives the professor expects students to master
2. Key topics and concepts covered
3. Skills being assessed
4. The assessment type classification:
   - "summative": End-of-cycle evaluations (finals, midterms, capstone projects, final papers)
   - "formative": Ongoing feedback assignments (homework, in-class activities, drafts, weekly problem sets)
   - "pre_assessment": Diagnostic/baseline assessments (placement tests, pre-quizzes, prerequisite checks)
   - "benchmark": Periodic checkpoints (unit tests, progress checks, module exams)

Be specific and actionable. These objectives will be used to generate personalized study content.`;

      toolConfig = {
        tools: [
          {
            type: "function",
            function: {
              name: "extract_assignment_objectives",
              description: "Extract learning objectives, key topics, and assessment classification from an assignment",
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
                  },
                  assessmentType: {
                    type: "string",
                    enum: ["summative", "formative", "pre_assessment", "benchmark"],
                    description: "Classification of the assignment: summative (end-of-cycle), formative (ongoing feedback), pre_assessment (diagnostic), benchmark (periodic checkpoint)"
                  },
                  assessmentMetadata: {
                    type: "object",
                    properties: {
                      weight: { type: "string", description: "Estimated grade weight if mentioned (e.g. '20%')" },
                      estimatedDuration: { type: "string", description: "Estimated time to complete" },
                      isGroupWork: { type: "boolean", description: "Whether this is a group assignment" },
                      reasonForClassification: { type: "string", description: "Brief explanation of why this assessment type was chosen" }
                    },
                    description: "Additional metadata about the assessment"
                  }
                },
                required: ["learningObjectives", "keyTopics", "parsedContent", "assessmentType"]
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "extract_assignment_objectives" } }
      };
    } else if (requestType === "parse-syllabus") {
      // AI-driven Outline Builder: extract key components from a syllabus
      useToolCalling = true;
      systemPrompt = `You are AgentB analyzing a course syllabus to extract its key structural components and classify learning goals using Revised Bloom's Taxonomy (RBT).

Class: ${className || "the course"}
${learningStyleContext}

Carefully read the syllabus content and extract:
1. **Course Description**: A concise summary of what the course covers
2. **Learning Objectives**: Specific outcomes students should achieve
3. **Weekly Schedule**: Week-by-week breakdown of topics (if available)
4. **Grading Policy**: How grades are determined (exams, homework, participation percentages)
5. **Required Materials**: Textbooks, software, or other required items
6. **Bloom's Taxonomy Classification**: For EACH learning objective, classify it into the appropriate RBT cognitive level:
   - **Remember**: Recall facts, terms, basic concepts (verbs: define, list, identify, name)
   - **Understand**: Explain ideas, interpret meaning (verbs: describe, explain, summarize, classify)
   - **Apply**: Use information in new situations (verbs: apply, solve, demonstrate, use)
   - **Analyze**: Break information into parts, find patterns (verbs: analyze, compare, contrast, examine)
   - **Evaluate**: Justify decisions, make judgments (verbs: evaluate, justify, critique, assess)
   - **Create**: Produce new or original work (verbs: design, develop, create, construct)

Be thorough and precise. Extract exactly what the syllabus states — do not invent information not present in the document.
For Bloom classification, analyze the ACTION VERB in each objective to determine the correct level.`;

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
                  },
                  bloomClassifications: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        objective: { type: "string", description: "The learning objective text" },
                        bloomLevel: { 
                          type: "string", 
                          enum: ["Remember", "Understand", "Apply", "Analyze", "Evaluate", "Create"],
                          description: "The Revised Bloom's Taxonomy cognitive level"
                        },
                        actionVerb: { type: "string", description: "The key action verb that determined the classification" },
                        justification: { type: "string", description: "Brief explanation of why this level was assigned" }
                      },
                      required: ["objective", "bloomLevel", "actionVerb"]
                    },
                    description: "Bloom's Taxonomy classification for each learning objective"
                  }
                },
                required: ["courseDescription", "learningObjectives", "parsedSummary", "bloomClassifications"]
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

    // Append bias guardrails to all system prompts
    systemPrompt += "\n" + biasGuardrails;

    console.log(`AgentB request - Type: ${requestType || "chat"}, User: ${userId || "anonymous"}, Class: ${className || "none"}`);

    // Log AI parsing/generation events to audit trail
    if (requestType && requestType !== "chat") {
      logAuditEvent(
        requestType.startsWith("parse") ? "ai_parse" : "ai_quiz_generate",
        requestType,
        className || undefined,
        { requestType, className }
      ).catch(() => {}); // fire-and-forget
    }

    // For tool calling requests (quizzes, study plans)
    if (useToolCalling) {
      const quizTools = {
        tools: [
          {
            type: "function",
            function: {
              name: "generate_quiz",
              description: "Generate a structured placement quiz with multiple choice questions, including visual data when applicable",
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
                        explanation: { type: "string", description: "Brief explanation of why the answer is correct" },
                        visual_required: { type: "boolean", description: "Whether this question benefits from a visual" },
                        visual_type: { type: "string", enum: ["graph", "free_body_diagram", "molecule", "velocity_time_graph", "position_time_graph", "none"] },
                        visual_data: {
                          type: "object",
                          properties: {
                            function: { type: "string" },
                            range: { type: "array", items: { type: "number" } },
                            dataPoints: { type: "array", items: { type: "object", properties: { x: { type: "number" }, y: { type: "number" } } } },
                            xLabel: { type: "string" },
                            yLabel: { type: "string" },
                            forces: { type: "array", items: { type: "object", properties: { label: { type: "string" }, direction: { type: "string" } } } },
                            formula: { type: "string" },
                            points: { type: "array", items: { type: "object", properties: { x: { type: "number" }, y: { type: "number" }, label: { type: "string" } } } }
                          }
                        }
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

      // Read response as text first to handle potential truncation
      const responseText = await response.text();
      console.log("Quiz response length:", responseText.length, "first 500:", responseText.slice(0, 500));

      let data;
      try {
        data = JSON.parse(responseText);
      } catch (jsonError) {
        console.error("Failed to parse AI response as JSON, length:", responseText.length, "error:", jsonError);
        // Try to salvage truncated JSON from tool call arguments
        const argsMatch = responseText.match(/"arguments"\s*:\s*"([\s\S]*?)(?:"\s*}\s*]\s*}\s*}\s*]\s*}|$)/);
        if (argsMatch) {
          try {
            let argsStr = argsMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
            // Try to fix truncated JSON by closing arrays/objects
            let attempt = argsStr;
            for (let i = 0; i < 5; i++) {
              try {
                const parsed = JSON.parse(attempt);
                if (parsed.questions?.length > 0) {
                  console.log("Salvaged", parsed.questions.length, "questions from truncated response");
                  return new Response(JSON.stringify(parsed), {
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                  });
                }
                break;
              } catch {
                attempt += ']}';
              }
            }
          } catch { /* ignore salvage failure */ }
        }
        return new Response(JSON.stringify({ error: "AI response was truncated. Please try again." }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Extract questions from tool call
      const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        try {
          const argsStr = typeof toolCall.function.arguments === 'string' 
            ? toolCall.function.arguments 
            : JSON.stringify(toolCall.function.arguments);
          const quizData = JSON.parse(argsStr);
          return new Response(JSON.stringify(quizData), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        } catch (parseError) {
          console.error("Failed to parse quiz data:", parseError, "raw:", typeof toolCall.function.arguments === 'string' ? toolCall.function.arguments.slice(0, 200) : 'non-string');
          return new Response(JSON.stringify({ error: "Failed to parse quiz data" }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      // Fallback: check if the content itself contains JSON
      const content = data.choices?.[0]?.message?.content;
      if (content) {
        try {
          const jsonMatch = content.match(/\{[\s\S]*"questions"[\s\S]*\}/);
          if (jsonMatch) {
            const quizData = JSON.parse(jsonMatch[0]);
            if (quizData.questions?.length > 0) {
              return new Response(JSON.stringify(quizData), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              });
            }
          }
        } catch { /* ignore */ }
      }

      return new Response(JSON.stringify({ error: "No quiz data returned" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Non-streaming response for targeted review
    if (requestType === "targeted-review") {
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
        return new Response(JSON.stringify({ error: "Failed to generate review content" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "Review generation failed.";
      return new Response(JSON.stringify({ content }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Non-streaming response for module content
    if (requestType === "module-content") {
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
        return new Response(JSON.stringify({ error: "Failed to generate module content" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "Content generation failed.";
      return new Response(JSON.stringify({ content }), {
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

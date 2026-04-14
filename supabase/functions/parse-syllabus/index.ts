import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ParsedTopic = {
    title?: string;
    description?: string | null;
    order?: number;
    subtopics?: unknown;
    learning_objectives?: unknown;
    blooms_taxonomy_level?: string | null;
    textbook_chapters?: unknown;
    start_date?: string | null;
    end_date?: string | null;
    week_number?: number | null;
    module_title?: string | null;
};

type ParsedTextbook = {
    title?: string;
    author?: string | null;
    edition?: string | null;
    isbn?: string | null;
    is_required?: boolean;
};

type ParsedEvent = {
    event_type?: string;
    title?: string;
    description?: string | null;
    start_date?: string | null;
    end_date?: string | null;
};

type ParsedModule = {
    module_title?: string;
    topics?: ParsedTopic[];
};

type ParsedWeek = {
    week_number?: number;
    module_title?: string;
    modules?: ParsedModule[];
    topics?: ParsedTopic[];
};

type ParsedPayload = {
    topics?: ParsedTopic[];
    course_structure?: ParsedWeek[];
    textbooks?: ParsedTextbook[];
    events?: ParsedEvent[];
};

const parseAiJsonPayload = (raw: string): ParsedPayload => {
    const trimmed = raw.trim();
    if (!trimmed) return {};

    const stripCodeFence = (value: string) =>
        value
            .replace(/^```(?:json)?\s*\n?/, "")
            .replace(/\n?\s*```$/, "")
            .trim();

    const candidates: string[] = [];
    const noFence = stripCodeFence(trimmed);
    candidates.push(noFence);

    const firstBrace = noFence.indexOf("{");
    const lastBrace = noFence.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
        candidates.push(noFence.slice(firstBrace, lastBrace + 1));
    }

    for (const candidate of candidates) {
        try {
            return JSON.parse(candidate) as ParsedPayload;
        } catch {
            // continue trying other candidate shapes
        }
    }

    throw new Error("Failed to parse AI response as JSON");
};

type NormalizedTopic = {
    title: string;
    description: string | null;
    topic_order: number;
    subtopics: string[];
    learning_objectives: string[];
    blooms_taxonomy_level: string | null;
    textbook_chapters: string[];
    start_date: string | null;
    end_date: string | null;
    week_number: number | null;
    module_title: string | null;
};

const detectSyllabusLayoutType = (
    content: string,
): "table-based" | "heading-based" | "bullet-list" | "narrative" => {
    const stripHeadingMarker = (line: string) =>
        line.replace(/^\[\[HEADING\]\]\s*/i, "");
    const lines = content
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 6000);

    const weekRowCount = lines.filter((l) => {
        const s = stripHeadingMarker(l);
        return /^(?:week|wk)\s*\d{1,3}\b\s*[:\-–—]\s*.+/i.test(s);
    }).length;

    const headingAnchorCount = lines.filter((l) => {
        const s = stripHeadingMarker(l);
        return /^(?:unit|week|wk|module|chapter|topic)\s*\d{1,3}\b/i.test(s);
    }).length;

    const bulletCount = lines.filter((l) => /^[-*•]\s+.+/.test(stripHeadingMarker(l))).length;
    const numberedCount = lines.filter((l) => /^\d+[.)]\s+.+/.test(stripHeadingMarker(l))).length;

    const tableDelimiterCount = lines.filter((l) => stripHeadingMarker(l).includes("|")).length;
    const narrativeSectionCount = lines.filter((l) => {
        const s = stripHeadingMarker(l);
        return /(topics to be covered|course overview|course description|learning objectives?|course objectives?|student learning outcomes?)/i
            .test(s);
    }).length;

    if (weekRowCount >= 3 || tableDelimiterCount >= 2) return "table-based";
    if (headingAnchorCount >= 3 || narrativeSectionCount >= 2) {
        return headingAnchorCount >= bulletCount + numberedCount ? "heading-based" : "narrative";
    }
    if (bulletCount + numberedCount >= 8) return "bullet-list";
    return "narrative";
};

const toStringArray = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v.trim().length > 0) : [];

const coerceIsoDate = (value: unknown): string | null => {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    const timestamp = Date.parse(trimmed);
    if (Number.isNaN(timestamp)) return null;
    return new Date(timestamp).toISOString();
};

const coercePositiveInt = (value: unknown): number | null => {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.floor(value);
    if (typeof value === "string" && value.trim()) {
        const parsed = Number(value);
        if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
    }
    return null;
};

const normalizeTopic = (
    topic: ParsedTopic,
    index: number,
    defaults?: { week_number?: number | null; module_title?: string | null },
): NormalizedTopic => ({
    title: topic.title?.trim() || `Topic ${index + 1}`,
    description: typeof topic.description === "string" && topic.description.trim() ? topic.description : null,
    topic_order: coercePositiveInt(topic.order) ?? index + 1,
    subtopics: toStringArray(topic.subtopics),
    learning_objectives: toStringArray(topic.learning_objectives),
    blooms_taxonomy_level:
        typeof topic.blooms_taxonomy_level === "string" && topic.blooms_taxonomy_level.trim()
            ? topic.blooms_taxonomy_level
            : null,
    textbook_chapters: toStringArray(topic.textbook_chapters),
    start_date: coerceIsoDate(topic.start_date),
    end_date: coerceIsoDate(topic.end_date),
    week_number: coercePositiveInt(topic.week_number) ?? defaults?.week_number ?? null,
    module_title:
        typeof topic.module_title === "string" && topic.module_title.trim()
            ? topic.module_title.trim()
            : defaults?.module_title ?? null,
});

const buildNormalizedTopics = (payload: ParsedPayload): NormalizedTopic[] => {
    const flattened: NormalizedTopic[] = [];

    if (Array.isArray(payload.course_structure) && payload.course_structure.length > 0) {
        for (const week of payload.course_structure) {
            const weekNumber = coercePositiveInt(week.week_number);
            const weekModuleTitle = typeof week.module_title === "string" ? week.module_title.trim() : null;

            if (Array.isArray(week.modules) && week.modules.length > 0) {
                for (const module of week.modules) {
                    const moduleTitle = typeof module.module_title === "string" && module.module_title.trim()
                        ? module.module_title.trim()
                        : weekModuleTitle;
                    const moduleTopics = Array.isArray(module.topics) ? module.topics : [];
                    for (const topic of moduleTopics) {
                        flattened.push(
                            normalizeTopic(topic, flattened.length, {
                                week_number: weekNumber,
                                module_title: moduleTitle ?? null,
                            }),
                        );
                    }
                }
            }

            if (Array.isArray(week.topics) && week.topics.length > 0) {
                for (const topic of week.topics) {
                    flattened.push(
                        normalizeTopic(topic, flattened.length, {
                            week_number: weekNumber,
                            module_title: weekModuleTitle ?? null,
                        }),
                    );
                }
            }
        }
    }

    if (flattened.length > 0) {
        return flattened.map((topic, index) => ({
            ...topic,
            topic_order: index + 1,
        }));
    }

    const directTopics = Array.isArray(payload.topics) ? payload.topics : [];
    return directTopics.map((topic, index) => normalizeTopic(topic, index));
};

const buildFallbackTopicsFromText = (content: string): NormalizedTopic[] => {
    const lines = content
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

    const deriveObjectivesFromTitle = (title: string): string[] => {
        const cleaned = title
            .replace(/^(week|wk)\s*\d+\b\s*[:\-]?\s*/i, "")
            .replace(/^(module|unit|chapter)\s*\d+\b\s*[:\-]?\s*/i, "")
            .trim();
        const core = cleaned.length > 2 ? cleaned : title.trim();
        // Keep it short and generic; this is only used when the syllabus doesn't have explicit objectives.
        const sentences = [
            `Explain the core concepts and key terms related to ${core}.`,
            `Apply what you learned from ${core} to common course problems.`,
        ];
        // Deduplicate while preserving order.
        const unique: string[] = [];
        for (const s of sentences) {
            if (s.length > 10 && !unique.includes(s)) unique.push(s);
            if (unique.length >= 2) break;
        }
        return unique;
    };

    const objectiveHeaderRegex = /(learning objectives?|course objectives?|student learning outcomes?|outcomes?)/i;
    const objectiveLeadRegex = /^(students?\s+will|you\s+will|by\s+the\s+end\s+of|able\s+to|understand|identify|explain|analyze|apply|evaluate|create)\b/i;
    const bulletRegex = /^[-*•]\s+(.+)$/;
    const numberedRegex = /^\d+[.)]\s+(.+)$/;
    const logisticsRegex =
        /(lecture\s*slides?|in[- ]class\s*activities?|in[- ]class\s*activity|lab\s*(session)?|colab\s*notebook|google\s*classroom|submission(s)?|due\s*date|late\s*policy|grading\s*(policy|rubric)|attendance|participation|worksheet|required\s*reading|resources?)/i;
    const sectionHeaderRegex =
        /(topics to be covered|course overview|course description|learning objectives?|course objectives?|student learning outcomes?|course objectives?|assignments|grading|policies|required\s*material)/i;
    const extractObjectiveText = (line: string): string | null => {
        const bullet = line.match(bulletRegex);
        if (bullet?.[1]) return bullet[1].trim();
        const numbered = line.match(numberedRegex);
        if (numbered?.[1]) return numbered[1].trim();
        if (objectiveLeadRegex.test(line)) return line.trim();
        return null;
    };

    const globalObjectives: string[] = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!objectiveHeaderRegex.test(line)) continue;

        // Collect objective bullets/lines directly under objective-like headers.
        for (let j = i + 1; j < lines.length && j <= i + 12; j++) {
            const candidate = lines[j];
            if (!candidate) continue;
            if (/^(week|module|chapter|unit|topic)\b/i.test(candidate)) break;
            const objective = extractObjectiveText(candidate);
            if (objective && objective.length > 6 && !globalObjectives.includes(objective)) {
                globalObjectives.push(objective.slice(0, 220));
            }
        }
    }

    // Additional pass: capture standalone objective-lead statements.
    for (const line of lines) {
        const objective = extractObjectiveText(line);
        if (objective && objectiveLeadRegex.test(objective) && !globalObjectives.includes(objective)) {
            globalObjectives.push(objective.slice(0, 220));
        }
        if (globalObjectives.length >= 16) break;
    }

    const hasHeadingMarkers = lines.some((l) => l.startsWith("[[HEADING]]"));

    // Preserve original behavior when we don't have heading markers:
    // - look for week/module headers or numbered list items
    // - derive week/module from the title string
    if (!hasHeadingMarkers) {
        const candidates = lines.filter((line) =>
            /^(week\s*\d+|module\s*\d+|chapter\s*\d+|unit\s*\d+|topic\s*\d+|week\s*\d+\s*:|module\s*\d+\s*:)/i.test(line) ||
            /^(\d+[.)]\s+).+/.test(line)
        );

        const uniqueTitles: string[] = [];
        for (const raw of candidates) {
            const cleaned = raw.replace(/\s{2,}/g, " ").trim().slice(0, 140);
            if (cleaned && !uniqueTitles.includes(cleaned)) {
                uniqueTitles.push(cleaned);
            }
            if (uniqueTitles.length >= 20) break;
        }

        if (uniqueTitles.length === 0) {
            // Last-resort single topic to keep the course processable.
            const derived = deriveObjectivesFromTitle("Course Overview");
            return [{
                title: "Course Overview",
                description: "Auto-generated fallback topic because AI parsing was unavailable.",
                topic_order: 1,
                subtopics: [],
                learning_objectives:
                    globalObjectives.length > 0 ? globalObjectives.slice(0, 8) : derived,
                blooms_taxonomy_level: null,
                textbook_chapters: [],
                start_date: null,
                end_date: null,
                week_number: null,
                module_title: null,
            }];
        }

        return uniqueTitles.map((title, index) => {
            const weekMatch = title.match(/week\s*(\d+)/i);
            const moduleMatch = title.match(/module\s*\d+\s*[:-]?\s*(.+)$/i);
            const objectiveWindowStart = Math.max(0, index - 1);
            const objectiveWindowEnd = Math.min(globalObjectives.length, index + 2);
            const topicObjectives =
                globalObjectives.length > 0
                    ? globalObjectives.slice(objectiveWindowStart, objectiveWindowEnd)
                    : [];
            const derived = deriveObjectivesFromTitle(title);
            return {
                title,
                description: null,
                topic_order: index + 1,
                subtopics: [],
                learning_objectives: topicObjectives.length > 0 ? topicObjectives : derived,
                blooms_taxonomy_level: null,
                textbook_chapters: [],
                start_date: null,
                end_date: null,
                week_number: weekMatch ? Number(weekMatch[1]) : null,
                module_title: moduleMatch?.[1]?.trim() || null,
            };
        });
    }

    // Heading-marker-aware fallback:
    // - PDF extraction marks larger font lines as [[HEADING]]
    // - we treat those as week/module/topic boundaries
    const stripHeadingMarker = (line: string) =>
        line.replace(/^\[\[HEADING\]\]\s*/i, "");

    const weekHeaderWithTitleRegex = /^(week|wk)\s*(\d{1,3})\b\s*[:-]?\s*(.+)?$/i;
    const moduleHeaderWithTitleRegex = /^(module|unit|chapter)\s*(\d{1,3})\b\s*[:-]?\s*(.+)?$/i;
    const weekRowRegex = /^((?:week|wk)\s*(\d{1,3}))\s*[:|\u2013\u2014-]\s*(.+)$/i;

    const seenTitles = new Set<string>();
    const topicRows: NormalizedTopic[] = [];

    let currentWeek: number | null = null;
    let currentModuleTitle: string | null = null;

    for (const rawLine of lines) {
        const isHeading = rawLine.startsWith("[[HEADING]]");
        const line = stripHeadingMarker(rawLine).trim();
        if (!line) continue;

        const weekRowMatch = line.match(weekRowRegex);
        if (weekRowMatch?.[2] && weekRowMatch?.[3]) {
            currentWeek = Number(weekRowMatch[2]);
            const title = weekRowMatch[3].replace(/\s{2,}/g, " ").trim().slice(0, 140);
            if (title && !seenTitles.has(title) && title.length > 3) {
                seenTitles.add(title);
                topicRows.push({
                    title,
                    description: null,
                    topic_order: topicRows.length + 1,
                    subtopics: [],
                    learning_objectives: [],
                    blooms_taxonomy_level: null,
                    textbook_chapters: [],
                    start_date: null,
                    end_date: null,
                    week_number: currentWeek,
                    module_title: currentModuleTitle,
                });
            }
            continue;
        }

        if (isHeading) {
            const weekHeaderMatch = line.match(weekHeaderWithTitleRegex);
            if (weekHeaderMatch?.[2]) {
                currentWeek = Number(weekHeaderMatch[2]);
                currentModuleTitle = null;

                // If there is extra text after the week number, treat it as a topic.
                const afterWeek = (weekHeaderMatch[3] ?? "").trim();
                if (afterWeek && afterWeek.length > 3) {
                    const title = `${"Week"} ${currentWeek}${afterWeek ? `: ${afterWeek}` : ""}`
                        .replace(/\s{2,}/g, " ")
                        .trim()
                        .slice(0, 140);
                    if (!seenTitles.has(title)) {
                        seenTitles.add(title);
                        topicRows.push({
                            title,
                            description: null,
                            topic_order: topicRows.length + 1,
                            subtopics: [],
                            learning_objectives: [],
                            blooms_taxonomy_level: null,
                            textbook_chapters: [],
                            start_date: null,
                            end_date: null,
                            week_number: currentWeek,
                            module_title: currentModuleTitle,
                        });
                    }
                }
                continue;
            }

            const moduleHeaderMatch = line.match(moduleHeaderWithTitleRegex);
            if (moduleHeaderMatch) {
                const moduleTitle = (moduleHeaderMatch[3] ?? "").trim() || null;
                currentModuleTitle = moduleTitle;
                continue;
            }
        }

        // Topic candidates: heading-marked lines and common bullet/numbered items.
        const objectiveLead = extractObjectiveText(line);
        const isObjectiveLine = objectiveLead !== null && objectiveLead.length > 6;
        // If the line is marked as a structural heading, allow objective-like text to become a topic.
        // Otherwise we treat objective-like bullets/numbered rows as learning-objective statements (not topics).
        if (isObjectiveLine && !isHeading) continue;

        const bulletMatch = line.match(bulletRegex)?.[1];
        const numberedMatch = line.match(numberedRegex)?.[1];

        const isLikelyTopic =
            isHeading ||
            (!!numberedMatch && numberedMatch.length > 4) ||
            (!!bulletMatch && bulletMatch.length > 4);

        if (!isLikelyTopic) continue;
        if (objectiveHeaderRegex.test(line)) continue;

        const titleSource = (isHeading ? line : (numberedMatch || bulletMatch || line));
        const title = titleSource.replace(/\s{2,}/g, " ").trim().slice(0, 140);

        // Treat only "pure" anchors (e.g. "Week 3" with nothing else) as non-topics.
        // We still want "Week 3: Sorting Algorithms" to be kept as a topic.
        const looksAnchor =
            /^(?:week|wk)\s*\d{1,3}\b\s*[:\-–—]?\s*$/i.test(title) ||
            /^(?:unit|module|chapter)\s*\d{1,3}\b\s*[:\-–—]?\s*$/i.test(title);
        const isSectionHeader = sectionHeaderRegex.test(title);

        if (
            !title ||
            title.length < 5 ||
            !/[A-Za-z]/.test(title) ||
            looksAnchor ||
            isSectionHeader ||
            logisticsRegex.test(title) ||
            seenTitles.has(title)
        ) {
            continue;
        }
        seenTitles.add(title);

        topicRows.push({
            title,
            description: null,
            topic_order: topicRows.length + 1,
            subtopics: [],
            learning_objectives: [],
            blooms_taxonomy_level: null,
            textbook_chapters: [],
            start_date: null,
            end_date: null,
            week_number: currentWeek,
            module_title: currentModuleTitle,
        });

        if (topicRows.length >= 20) break;
    }

    if (topicRows.length === 0) {
        // If the PDF only has structural headings (Week/Module) and no real topic-level text,
        // use those anchors as topics so the UI can still render something useful.
        const weekAnchorOnlyRegex = /^(?:week|wk)\s*(\d{1,3})\b\s*[:\-–—]?\s*$/i;
        const moduleAnchorOnlyRegex = /^(?:module|unit|chapter)\s*(\d{1,3})\b\s*[:\-–—]?\s*$/i;

        let inferredModuleTitle: string | null = null;
        const seenAnchorTitles = new Set<string>();
        const anchorTopics: NormalizedTopic[] = [];

        for (const rawLine of lines) {
            if (!rawLine.startsWith("[[HEADING]]")) continue;
            const headingLine = stripHeadingMarker(rawLine).trim();
            if (!headingLine) continue;

            const weekMatch = headingLine.match(weekAnchorOnlyRegex);
            if (weekMatch?.[1]) {
                const wk = Number(weekMatch[1]);
                const t = `Week ${wk}`;
                if (!seenAnchorTitles.has(t)) {
                    seenAnchorTitles.add(t);
                    anchorTopics.push({
                        title: t,
                        description: null,
                        topic_order: anchorTopics.length + 1,
                        subtopics: [],
                        learning_objectives: deriveObjectivesFromTitle(t),
                        blooms_taxonomy_level: null,
                        textbook_chapters: [],
                        start_date: null,
                        end_date: null,
                        week_number: wk,
                        module_title: inferredModuleTitle,
                    });
                    if (anchorTopics.length >= 20) break;
                }
                continue;
            }

            const moduleMatch = headingLine.match(moduleAnchorOnlyRegex);
            if (moduleMatch?.[1]) {
                const modNum = Number(moduleMatch[1]);
                inferredModuleTitle = `Module ${modNum}`;
            }
        }

        if (anchorTopics.length > 0) return anchorTopics;

        // Last-resort single topic to keep the course processable.
        return [
            {
                title: "Course Overview",
                description: "Auto-generated fallback topic because AI parsing was unavailable.",
                topic_order: 1,
                subtopics: [],
                learning_objectives: globalObjectives.length > 0 ? globalObjectives.slice(0, 8) : deriveObjectivesFromTitle("Course Overview"),
                blooms_taxonomy_level: null,
                textbook_chapters: [],
                start_date: null,
                end_date: null,
                week_number: null,
                module_title: null,
            },
        ];
    }

    // Attach learning objectives near each topic by index (same as original heuristic).
    return topicRows.map((t, index) => {
        const objectiveWindowStart = Math.max(0, index - 1);
        const objectiveWindowEnd = Math.min(globalObjectives.length, index + 2);
        const topicObjectives =
            globalObjectives.length > 0
                ? globalObjectives.slice(objectiveWindowStart, objectiveWindowEnd)
                : [];
        const derived = deriveObjectivesFromTitle(t.title);
        return {
            ...t,
            learning_objectives: topicObjectives.length > 0 ? topicObjectives : derived,
        };
    });
};

serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const { syllabusId } = await req.json();

        if (!syllabusId) {
            return new Response(
                JSON.stringify({ error: "syllabusId is required" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Get the Authorization header to identify the user
        const authHeader = req.headers.get("Authorization");
        if (!authHeader) {
            return new Response(
                JSON.stringify({ error: "Authorization header is required" }),
                { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

        if (!LOVABLE_API_KEY) {
            throw new Error("LOVABLE_API_KEY is not configured");
        }

        // Create a client with the user's JWT to verify identity
        const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
            global: { headers: { Authorization: authHeader } },
        });

        const { data: { user }, error: userError } = await userClient.auth.getUser();
        if (userError || !user) {
            return new Response(
                JSON.stringify({ error: "Unauthorized" }),
                { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Use service role client for DB operations
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        // Fetch the syllabus
        const { data: syllabus, error: fetchError } = await supabase
            .from("syllabi")
            .select("*")
            .eq("id", syllabusId)
            .eq("user_id", user.id)
            .single();

        if (fetchError || !syllabus) {
            return new Response(
                JSON.stringify({ error: "Syllabus not found" }),
                { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Compact debug stats to understand why fallback produced few/no topics.
        const computeFallbackDebugSummary = (rawContent: string): string => {
            const stripHeadingMarker = (line: string) =>
                line.replace(/^\[\[HEADING\]\]\s*/i, "");

            const lines = rawContent
                .split("\n")
                .map((l) => l.trim())
                .filter(Boolean)
                .slice(0, 6000);

            const headingMarkerLines = lines.filter((l) => l.startsWith("[[HEADING]]")).length;
            const hasHeadingMarkers = headingMarkerLines > 0;

            // Mirror the fallback regex families (approx; this is just for visibility).
            const weekRowRegexLocal = /^((?:week|wk)\s*(\d{1,3}))\s*[:|\u2013\u2014-]\s*(.+)$/i;
            const weekAnchorOnlyRegexLocal = /^(?:week|wk)\s*(\d{1,3})\b\s*[:\-–—]?\s*$/i;
            const moduleAnchorOnlyRegexLocal = /^(?:module|unit|chapter)\s*(\d{1,3})\b\s*[:\-–—]?\s*$/i;

            const stripped = lines.map(stripHeadingMarker);
            const weekRows = stripped.filter((l) => weekRowRegexLocal.test(l)).length;
            const weekAnchorsOnly = stripped.filter((l) => weekAnchorOnlyRegexLocal.test(l)).length;
            const moduleAnchorsOnly = stripped.filter((l) => moduleAnchorOnlyRegexLocal.test(l)).length;

            const bulletCount = stripped.filter((l) => /^[-*•]\s+.+$/.test(l)).length;
            const numberedCount = stripped.filter((l) => /^\d+[.)]\s+.+$/.test(l)).length;

            return `markers=${hasHeadingMarkers ? "yes" : "no"} headingLines=${headingMarkerLines} weekRows=${weekRows} wkAnchorsOnly=${weekAnchorsOnly} moduleAnchorsOnly=${moduleAnchorsOnly} bullets=${bulletCount} numbered=${numberedCount}`;
        };

        // Truncate content to speed up parsing — most syllabi fit in 8k chars
        const contentForAI = syllabus.content.length > 8000
            ? syllabus.content.substring(0, 8000) + "\n\n[Content truncated for parsing speed]"
            : syllabus.content;

        const aiModels = [
            "anthropic/claude-3.5-sonnet",
            "google/gemini-2.5-flash",
            "openai/gpt-4o-mini",
        ];
        const modelAttempts: string[] = [];

        const aiRequestBodyForModel = (model: string) =>
            JSON.stringify({
                model,
                messages: [
                    {
                        role: "system",
                        content: `You are an academic syllabus parser. Extract a course structure by weeks/modules/topics from the syllabus.

Return ONLY valid JSON with keys: "course_structure", "topics", "textbooks", "events". No markdown fences.

"course_structure": [{"week_number":int|null, "module_title":string|null, "modules":[{"module_title":string, "topics":[{"title":string, "description":string, "subtopics":string[], "learning_objectives":string[], "blooms_taxonomy_level":string|null, "textbook_chapters":string[], "start_date":ISO|null, "end_date":ISO|null}]}], "topics":[{"title":string, "description":string, "subtopics":string[], "learning_objectives":string[], "blooms_taxonomy_level":string|null, "textbook_chapters":string[], "start_date":ISO|null, "end_date":ISO|null}]}]
"topics": [{"title":string, "description":string, "order":int, "subtopics":string[], "learning_objectives":string[], "blooms_taxonomy_level":string|null, "textbook_chapters":string[], "start_date":ISO|null, "end_date":ISO|null, "week_number":int|null, "module_title":string|null}]
"textbooks": [{"title":string, "author":string|null, "edition":string|null, "isbn":string|null, "is_required":bool}]
"events": [{"event_type":"homework"|"test"|"quiz"|"reading"|"other", "title":string, "description":string|null, "start_date":ISO|null, "end_date":ISO|null}]`
                    },
                    {
                        role: "user",
                        content: `Parse this syllabus:\n\n${contentForAI}`
                    }
                ],
                temperature: 0.1,
                max_tokens: 4000,
            });

        let aiResult: Record<string, unknown> | null = null;
        let aiServiceFailed = true;

        for (const model of aiModels) {
            const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${LOVABLE_API_KEY}`,
                    "Content-Type": "application/json",
                },
                body: aiRequestBodyForModel(model),
            });

            if (!aiResponse.ok) {
                const errorText = await aiResponse.text();
                modelAttempts.push(`${model} => ${aiResponse.status}`);
                console.error("AI gateway error:", model, aiResponse.status, errorText);
                continue;
            }

            try {
                aiResult = await aiResponse.json();
                aiServiceFailed = false;
                modelAttempts.push(`${model} => 200`);
                break;
            } catch (jsonErr) {
                modelAttempts.push(`${model} => invalid-json`);
                console.error("AI response JSON parse error:", model, jsonErr);
            }
        }

        if (aiServiceFailed || !aiResult) {
            const fallbackLayoutType = detectSyllabusLayoutType(syllabus.content);
            const fallbackTopics = buildFallbackTopicsFromText(syllabus.content);
            const fallbackDebugSummary = computeFallbackDebugSummary(syllabus.content);
            const topicRows = fallbackTopics.map((t) => ({
                syllabus_id: syllabusId,
                user_id: user.id,
                title: t.title,
                description: t.description,
                topic_order: t.topic_order,
                subtopics: t.subtopics,
                learning_objectives: t.learning_objectives,
                blooms_taxonomy_level: t.blooms_taxonomy_level,
                textbook_chapters: t.textbook_chapters,
                start_date: t.start_date,
                end_date: t.end_date,
                week_number: t.week_number,
                module_title: t.module_title,
                mastery_percent: 0,
            }));

            await supabase.from("syllabus_topics").delete().eq("syllabus_id", syllabusId);
            await supabase.from("course_textbooks").delete().eq("syllabus_id", syllabusId);
            await supabase.from("course_events").delete().eq("syllabus_id", syllabusId);

            if (topicRows.length > 0) {
                const { error: insertError } = await supabase.from("syllabus_topics").insert(topicRows);
                if (insertError) {
                    const fallbackRows = topicRows.map(({ week_number, module_title, ...rest }) => rest);
                    const { error: fallbackInsertError } = await supabase.from("syllabus_topics").insert(fallbackRows);
                    if (fallbackInsertError) {
                        console.error("Fallback topic insert error:", fallbackInsertError);
                        throw new Error("AI unavailable and fallback parsing failed");
                    }
                }
            }

            const { data: insertedTopics, error: insertedFetchError } = await supabase
                .from("syllabus_topics")
                .select("id")
                .eq("syllabus_id", syllabusId)
                .eq("user_id", user.id);

            const insertedTopicCount = Array.isArray(insertedTopics) ? insertedTopics.length : 0;
            if (insertedFetchError) {
                console.error("Inserted topic count fetch error:", insertedFetchError);
            }

            const fallbackTopicNames = topicRows.map((t) => t.title);
            await supabase
                .from("syllabi")
                .update({
                    processed: true,
                    topics_extracted: fallbackTopicNames,
                })
                .eq("id", syllabusId);

            return new Response(
                JSON.stringify({
                    success: true,
                    topics: topicRows,
                    parser_mode: "fallback",
                    fallback_layout_type: fallbackLayoutType,
                    inserted_topic_count: insertedTopicCount,
                    fallback_debug_summary: fallbackDebugSummary,
                    fallback_preview: topicRows.slice(0, 8).map((t) => ({
                        title: t.title,
                        week_number: t.week_number ?? null,
                        module_title: t.module_title ?? null,
                    })),
                    warning: `AI service unavailable. Used local fallback parser. Attempts: ${modelAttempts.join(", ")}`,
                }),
                { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }
        const rawContent = aiResult.choices?.[0]?.message?.content || "{}";

        let parsedData: ParsedPayload = {};
        let aiJsonParseFailed = false;
        try {
            parsedData = parseAiJsonPayload(rawContent);
        } catch (parseError) {
            aiJsonParseFailed = true;
            console.error("Failed to parse AI response as JSON:", rawContent);
            console.error(parseError);
            parsedData = {};
        }

        let normalizedTopics = buildNormalizedTopics(parsedData);

        // AI may return 200 with malformed JSON, empty object, or empty topic arrays — same as "no topics".
        // Use local text fallback so we never wipe data and return success with zero topics.
        let usedMalformedAiTopicFallback = false;
        const fallbackLayoutType = detectSyllabusLayoutType(syllabus.content);
        if (normalizedTopics.length === 0) {
            usedMalformedAiTopicFallback = true;
            normalizedTopics = buildFallbackTopicsFromText(syllabus.content);
        }

        const textbooks = Array.isArray(parsedData.textbooks) ? parsedData.textbooks : [];
        const events = Array.isArray(parsedData.events) ? parsedData.events : [];

        // Delete any existing data for this syllabus (in case of re-parse)
        await supabase.from("syllabus_topics").delete().eq("syllabus_id", syllabusId);
        await supabase.from("course_textbooks").delete().eq("syllabus_id", syllabusId);
        await supabase.from("course_events").delete().eq("syllabus_id", syllabusId);

        // Insert extracted topics
        const topicRows = normalizedTopics.map((t) => ({
            syllabus_id: syllabusId,
            user_id: user.id,
            title: t.title,
            description: t.description,
            topic_order: t.topic_order,
            subtopics: t.subtopics,
            learning_objectives: t.learning_objectives,
            blooms_taxonomy_level: t.blooms_taxonomy_level,
            textbook_chapters: t.textbook_chapters,
            start_date: t.start_date,
            end_date: t.end_date,
            week_number: t.week_number,
            module_title: t.module_title,
            mastery_percent: 0,
        }));

        if (topicRows.length > 0) {
            const { error: insertError } = await supabase.from("syllabus_topics").insert(topicRows);
            if (insertError) {
                const message = `${insertError.message || ""} ${insertError.details || ""}`.toLowerCase();
                const missingStructureColumns =
                    message.includes("week_number") || message.includes("module_title");

                if (missingStructureColumns) {
                    // Backward-compatible fallback if remote DB is missing new columns.
                    const fallbackRows = topicRows.map(({ week_number, module_title, ...rest }) => rest);
                    const { error: fallbackError } = await supabase.from("syllabus_topics").insert(fallbackRows);
                    if (fallbackError) {
                        console.error("Error inserting fallback topics:", fallbackError);
                        throw new Error("Failed to save extracted topics");
                    }
                } else {
                    console.error("Error inserting topics:", insertError);
                    throw new Error("Failed to save extracted topics");
                }
            }
        }

        // Insert extracted textbooks
        if (textbooks.length > 0) {
            const textbookRows = textbooks.map(tb => ({
                syllabus_id: syllabusId,
                user_id: user.id,
                title: tb.title || "Unknown Title",
                author: tb.author || null,
                edition: tb.edition || null,
                isbn: tb.isbn || null,
                is_required: !!tb.is_required,
            }));
            const { error: insertError } = await supabase.from("course_textbooks").insert(textbookRows);
            if (insertError) console.error("Error inserting textbooks:", insertError);
        }

        // Insert extracted events
        if (events.length > 0) {
            const eventRows = events.map(e => ({
                syllabus_id: syllabusId,
                user_id: user.id,
                event_type: e.event_type || "other",
                title: e.title || "Untitled Event",
                description: e.description || null,
                start_date: coerceIsoDate(e.start_date),
                end_date: coerceIsoDate(e.end_date),
            }));
            const { error: insertError } = await supabase.from("course_events").insert(eventRows);
            if (insertError) console.error("Error inserting events:", insertError);
        }

        // Update the syllabus record
        const topicNames = normalizedTopics.map((t) => t.title).filter(Boolean);
        const { error: updateError } = await supabase
            .from("syllabi")
            .update({
                processed: true,
                topics_extracted: topicNames,
            })
            .eq("id", syllabusId);

        if (updateError) {
            console.error("Error updating syllabus:", updateError);
        }

        return new Response(
            JSON.stringify({
                success: true,
                topics: topicRows,
                ...(usedMalformedAiTopicFallback
                    ? {
                        parser_mode: "fallback_malformed_ai",
                        fallback_layout_type: fallbackLayoutType,
                        fallback_debug_summary: computeFallbackDebugSummary(syllabus.content),
                        warning: aiJsonParseFailed
                            ? "AI response was not valid JSON. Topics were extracted using the local fallback parser."
                            : "AI returned no usable topic structure. Topics were extracted using the local fallback parser.",
                        fallback_preview: topicRows.slice(0, 8).map((t) => ({
                            title: t.title,
                            week_number: t.week_number ?? null,
                            module_title: t.module_title ?? null,
                        })),
                    }
                    : {}),
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    } catch (error) {
        console.error("Parse syllabus error:", error);
        return new Response(
            JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
            }),
            // Return 200 so the client can always read the structured error payload.
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});

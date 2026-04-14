import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import { BookMarked, ChevronRight, Layers } from "lucide-react";

interface SyllabusTopic {
    id: string;
    syllabus_id: string;
    title: string;
    description: string | null;
    topic_order: number;
    subtopics: string[];
    mastery_percent: number;
}

interface SyllabusWithTopics {
    syllabusId: string;
    syllabusTitle: string;
    topics: SyllabusTopic[];
}

export const TopicBreakdown = () => {
    const [courseTopics, setCourseTopics] = useState<SyllabusWithTopics[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        fetchTopics();
    }, []);

    const fetchTopics = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            setIsLoading(false);
            return;
        }

        // Fetch all topics for the user
        const { data: topics, error: topicsError } = await supabase
            .from("syllabus_topics")
            .select("*")
            .eq("user_id", session.user.id)
            .order("topic_order", { ascending: true });

        if (topicsError) {
            console.error("Error fetching topics:", topicsError);
            setIsLoading(false);
            return;
        }

        // Fetch syllabi to get course names
        const { data: syllabi, error: syllabiError } = await supabase
            .from("syllabi")
            .select("id, title")
            .eq("user_id", session.user.id)
            .eq("processed", true);

        if (syllabiError) {
            console.error("Error fetching syllabi:", syllabiError);
            setIsLoading(false);
            return;
        }

        // Group topics by syllabus
        const syllabiMap = new Map(syllabi?.map(s => [s.id, s.title]) || []);
        const grouped = new Map<string, SyllabusTopic[]>();

        (topics || []).forEach(t => {
            const mapped: SyllabusTopic = {
                id: t.id,
                syllabus_id: t.syllabus_id,
                title: t.title,
                description: t.description,
                topic_order: t.topic_order,
                subtopics: Array.isArray(t.subtopics) ? (t.subtopics as unknown as string[]) : [],
                mastery_percent: t.mastery_percent ?? 0,
            };
            const existing = grouped.get(t.syllabus_id) || [];
            existing.push(mapped);
            grouped.set(t.syllabus_id, existing);
        });

        const result: SyllabusWithTopics[] = [];
        grouped.forEach((topicList, syllabusId) => {
            result.push({
                syllabusId,
                syllabusTitle: syllabiMap.get(syllabusId) || "Untitled Course",
                topics: topicList.sort((a, b) => a.topic_order - b.topic_order),
            });
        });

        setCourseTopics(result);
        setIsLoading(false);
    };

    if (isLoading) {
        return (
            <div className="space-y-3">
                <div className="flex items-center gap-2">
                    <BookMarked className="w-5 h-5 text-accent" />
                    <h4 className="font-semibold text-foreground">Chapter Breakdowns</h4>
                </div>
                <div className="space-y-2">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="h-12 rounded-lg bg-muted/50 animate-pulse" />
                    ))}
                </div>
            </div>
        );
    }

    if (courseTopics.length === 0) {
        return (
            <div className="space-y-3">
                <div className="flex items-center gap-2">
                    <BookMarked className="w-5 h-5 text-accent" />
                    <h4 className="font-semibold text-foreground">Chapter Breakdowns</h4>
                </div>
                <div className="text-center py-6 text-muted-foreground">
                    <Layers className="w-10 h-10 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No topic breakdowns yet</p>
                    <p className="text-xs mt-1">Upload and parse a syllabus to see chapter breakdowns here</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2">
                <BookMarked className="w-5 h-5 text-accent" />
                <h4 className="font-semibold text-foreground">Chapter Breakdowns</h4>
            </div>
            {courseTopics.map(course => (
                <div key={course.syllabusId} className="space-y-2">
                    {courseTopics.length > 1 && (
                        <p className="text-sm font-medium text-foreground pl-1">
                            {course.syllabusTitle}
                        </p>
                    )}
                    <Accordion type="multiple" className="space-y-1">
                        {course.topics.map(topic => (
                            <AccordionItem
                                key={topic.id}
                                value={topic.id}
                                className="border-0"
                            >
                                <div className="p-2 rounded-lg bg-muted/50">
                                    <div className="flex items-center justify-between mb-1">
                                        <AccordionTrigger className="py-0 hover:no-underline flex-1">
                                            <span className="text-sm font-medium text-foreground text-left">
                                                {topic.topic_order}. {topic.title}
                                            </span>
                                        </AccordionTrigger>
                                        <span className="text-xs text-muted-foreground ml-2 flex-shrink-0">
                                            {topic.mastery_percent}%
                                        </span>
                                    </div>
                                    <Progress value={topic.mastery_percent} className="h-1.5" />
                                    <AccordionContent className="pt-3 pb-1">
                                        {topic.description && (
                                            <p className="text-xs text-muted-foreground mb-2">
                                                {topic.description}
                                            </p>
                                        )}
                                        {topic.subtopics.length > 0 && (
                                            <div className="flex flex-wrap gap-1">
                                                {topic.subtopics.map((sub, i) => (
                                                    <Badge
                                                        key={i}
                                                        variant="outline"
                                                        className="text-xs font-normal"
                                                    >
                                                        <ChevronRight className="w-3 h-3 mr-0.5" />
                                                        {sub}
                                                    </Badge>
                                                ))}
                                            </div>
                                        )}
                                    </AccordionContent>
                                </div>
                            </AccordionItem>
                        ))}
                    </Accordion>
                </div>
            ))}
        </div>
    );
};

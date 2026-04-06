import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, AlertTriangle, Clock } from "lucide-react";
import { format, differenceInDays, parseISO } from "date-fns";

interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  event_type: string | null;
}

const TEST_TYPES = ['test', 'exam', 'quiz', 'midterm', 'final'];

const isTestEvent = (eventType: string | null): boolean => {
  if (!eventType) return false;
  return TEST_TYPES.some(type => eventType.toLowerCase().includes(type));
};

const getUrgencyInfo = (eventDate: string): { color: string; bgColor: string; label: string; daysLeft: number } => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const eventDay = parseISO(eventDate);
  const daysLeft = differenceInDays(eventDay, today);

  if (daysLeft < 0) {
    return { color: 'text-muted-foreground', bgColor: 'bg-muted', label: 'Past', daysLeft };
  } else if (daysLeft === 0) {
    return { color: 'text-destructive', bgColor: 'bg-destructive/20 border-destructive', label: 'Today!', daysLeft };
  } else if (daysLeft <= 2) {
    return { color: 'text-destructive', bgColor: 'bg-destructive/15 border-destructive/50', label: `${daysLeft}d`, daysLeft };
  } else if (daysLeft <= 7) {
    return { color: 'text-orange-600 dark:text-orange-400', bgColor: 'bg-orange-500/15 border-orange-500/50', label: `${daysLeft}d`, daysLeft };
  } else if (daysLeft <= 14) {
    return { color: 'text-yellow-600 dark:text-yellow-400', bgColor: 'bg-yellow-500/15 border-yellow-500/50', label: `${daysLeft}d`, daysLeft };
  } else {
    return { color: 'text-green-600 dark:text-green-400', bgColor: 'bg-green-500/15 border-green-500/50', label: `${daysLeft}d`, daysLeft };
  }
};

export default function CalendarPage() {
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selectedDateEvents, setSelectedDateEvents] = useState<CalendarEvent[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [newEvent, setNewEvent] = useState({
    title: "",
    description: "",
    start_time: "",
    end_time: "",
    event_type: "other",
  });
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    checkAuthAndFetchEvents();
  }, []);

  useEffect(() => {
    if (date) {
      const dateStr = format(date, "yyyy-MM-dd");
      const dayEvents = events.filter((event) => event.event_date === dateStr);
      setSelectedDateEvents(dayEvents);
    }
  }, [date, events]);

  const checkAuthAndFetchEvents = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }
    fetchEvents();
  };

  const fetchEvents = async () => {
    const { data, error } = await supabase
      .from("calendar_events")
      .select("*")
      .order("event_date", { ascending: true });

    if (error) {
      console.error("Error fetching events:", error);
    } else {
      setEvents(data || []);
    }
  };

  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!date) return;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { error } = await supabase.from("calendar_events").insert({
      user_id: session.user.id,
      title: newEvent.title,
      description: newEvent.description || null,
      event_date: format(date, "yyyy-MM-dd"),
      start_time: newEvent.start_time || null,
      end_time: newEvent.end_time || null,
      event_type: newEvent.event_type,
    });

    if (error) {
      toast({
        title: "Error",
        description: "Failed to add event",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Success",
        description: "Event added successfully",
      });
      setNewEvent({ title: "", description: "", start_time: "", end_time: "", event_type: "other" });
      setIsDialogOpen(false);
      fetchEvents();
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    const { error } = await supabase
      .from("calendar_events")
      .delete()
      .eq("id", eventId);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to delete event",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Success",
        description: "Event deleted successfully",
      });
      fetchEvents();
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/")}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-2xl font-bold text-foreground">Campus Calendar</h1>
            <div className="ml-auto flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-4 py-2">
              <Clock className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium tabular-nums text-foreground">
                {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
              <span className="text-xs text-muted-foreground">
                {currentTime.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Calendar */}
          <Card className="p-6 shadow-[var(--shadow-medium)]">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-foreground">Select a Date</h2>
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-[image:var(--gradient-primary)]">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Event
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add New Event</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleAddEvent} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="title">Event Title</Label>
                      <Input
                        id="title"
                        value={newEvent.title}
                        onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="description">Description</Label>
                      <Textarea
                        id="description"
                        value={newEvent.description}
                        onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="start_time">Start Time</Label>
                        <Input
                          id="start_time"
                          type="time"
                          value={newEvent.start_time}
                          onChange={(e) => setNewEvent({ ...newEvent, start_time: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="end_time">End Time</Label>
                        <Input
                          id="end_time"
                          type="time"
                          value={newEvent.end_time}
                          onChange={(e) => setNewEvent({ ...newEvent, end_time: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="event_type">Event Type</Label>
                      <Select value={newEvent.event_type} onValueChange={(value) => setNewEvent({ ...newEvent, event_type: value })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="class">Class</SelectItem>
                          <SelectItem value="exam">Exam</SelectItem>
                          <SelectItem value="assignment">Assignment</SelectItem>
                          <SelectItem value="dining">Dining</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button type="submit" className="w-full bg-[image:var(--gradient-primary)]">
                      Add Event
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
            <Calendar
              mode="single"
              selected={date}
              onSelect={setDate}
              className="rounded-md border"
            />
          </Card>

          {/* Events for Selected Date */}
          <Card className="p-6 shadow-[var(--shadow-medium)]">
            <h2 className="text-xl font-semibold text-foreground mb-4">
              Events for {date ? format(date, "MMMM d, yyyy") : "Selected Date"}
            </h2>
            
            {/* Urgency Legend for Tests */}
            <div className="flex flex-wrap gap-3 mb-4 p-3 rounded-lg bg-muted/50">
              <span className="text-xs text-muted-foreground font-medium">Test Urgency:</span>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-destructive/40" />
                <span className="text-xs text-muted-foreground">≤2 days</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-orange-500/40" />
                <span className="text-xs text-muted-foreground">3-7 days</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-yellow-500/40" />
                <span className="text-xs text-muted-foreground">8-14 days</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 rounded bg-green-500/40" />
                <span className="text-xs text-muted-foreground">15+ days</span>
              </div>
            </div>

            {selectedDateEvents.length === 0 ? (
              <p className="text-muted-foreground">No events for this date</p>
            ) : (
              <div className="space-y-4">
                {selectedDateEvents.map((event) => {
                  const isTest = isTestEvent(event.event_type);
                  const urgency = isTest ? getUrgencyInfo(event.event_date) : null;
                  
                  return (
                    <Card 
                      key={event.id} 
                      className={`p-4 border transition-colors ${
                        isTest && urgency ? urgency.bgColor : 'border-border'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            {isTest && urgency && urgency.daysLeft >= 0 && urgency.daysLeft <= 2 && (
                              <AlertTriangle className={`h-4 w-4 ${urgency.color}`} />
                            )}
                            <h3 className="font-semibold text-foreground">{event.title}</h3>
                            {isTest && urgency && (
                              <span className={`text-xs font-medium ${urgency.color}`}>
                                {urgency.label}
                              </span>
                            )}
                          </div>
                          {event.description && (
                            <p className="text-sm text-muted-foreground mt-1">{event.description}</p>
                          )}
                          {event.start_time && event.end_time && (
                            <p className="text-sm text-muted-foreground mt-2">
                              {event.start_time} - {event.end_time}
                            </p>
                          )}
                          {event.event_type && (
                            <span className={`inline-block mt-2 px-2 py-1 text-xs rounded-full capitalize ${
                              isTest ? `${urgency?.bgColor} ${urgency?.color}` : 'bg-primary/10 text-primary'
                            }`}>
                              {event.event_type}
                            </span>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteEvent(event.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </main>
    </div>
  );
}

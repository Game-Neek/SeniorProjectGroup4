import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface DiningLocation {
  name: string;
  address: string;
  hours: string;
  status: string;
  image: string;
  directionsUrl: string;
}

interface DiningLocationsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const DiningLocations = ({ open, onOpenChange }: DiningLocationsProps) => {
  const [locations, setLocations] = useState<DiningLocation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "open">("all");

  useEffect(() => {
    if (open && locations.length === 0) {
      fetchLocations();
    }
  }, [open]);

  const fetchLocations = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("dining-scrape");
      if (fnError) throw fnError;
      if (data?.success && data.data) {
        setLocations(data.data);
      } else {
        setError(data?.error || "Failed to load dining locations");
      }
    } catch (err) {
      console.error("Error fetching dining locations:", err);
      setError("Could not load dining information. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const filtered = filter === "open"
    ? locations.filter((l) => l.status === "OPEN")
    : locations;

  const openCount = locations.filter((l) => l.status === "OPEN").length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            🍽️ Dining Locations
            {!loading && locations.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {openCount} open now
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {!loading && locations.length > 0 && (
          <Tabs value={filter} onValueChange={(v) => setFilter(v as "all" | "open")} className="mb-4">
            <TabsList>
              <TabsTrigger value="all">All ({locations.length})</TabsTrigger>
              <TabsTrigger value="open">Open Now ({openCount})</TabsTrigger>
            </TabsList>
          </Tabs>
        )}

        {loading && (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32 w-full rounded-lg" />
            ))}
          </div>
        )}

        {error && (
          <div className="text-center py-8">
            <p className="text-destructive mb-3">{error}</p>
            <Button variant="outline" onClick={fetchLocations}>
              Retry
            </Button>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <p className="text-center text-muted-foreground py-8">
            {filter === "open" ? "No locations are currently open." : "No dining locations found."}
          </p>
        )}

        <div className="space-y-3">
          {filtered.map((loc, i) => (
            <Card key={i} className="flex gap-4 p-4 border-border">
              {loc.image && (
                <img
                  src={loc.image}
                  alt={loc.name}
                  className="w-24 h-24 rounded-lg object-cover shrink-0"
                  loading="lazy"
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h4 className="font-semibold text-foreground truncate">{loc.name}</h4>
                  <Badge
                    variant={loc.status === "OPEN" ? "default" : "secondary"}
                    className={
                      loc.status === "OPEN"
                        ? "bg-green-500/10 text-green-600 border-green-500/20 shrink-0"
                        : "bg-red-500/10 text-red-600 border-red-500/20 shrink-0"
                    }
                  >
                    {loc.status}
                  </Badge>
                </div>
                {loc.address && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                    <MapPin className="w-3 h-3" /> {loc.address}
                  </p>
                )}
                <p className="text-xs text-muted-foreground flex items-center gap-1 mb-2">
                  <Clock className="w-3 h-3" /> {loc.hours}
                </p>
              </div>
            </Card>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export const useDiningOpenCount = () => {
  const [openCount, setOpenCount] = useState<number | null>(null);

  useEffect(() => {
    const fetch = async () => {
      try {
        const { data } = await supabase.functions.invoke("dining-scrape");
        if (data?.success && data.data) {
          setOpenCount(data.data.filter((l: DiningLocation) => l.status === "OPEN").length);
        }
      } catch {
        // silently fail
      }
    };
    fetch();
  }, []);

  return openCount;
};

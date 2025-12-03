import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useProfile } from "@/hooks/useProfile";
import { ArrowLeft, Plus, FileText, Lightbulb, Image as ImageIcon, ClipboardCheck, Upload, Trash2 } from "lucide-react";

interface UserClass {
  id: string;
  class_name: string;
  professor: string | null;
  semester: string | null;
  year: number | null;
}

interface Syllabus {
  id: string;
  class_name: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  uploaded_at: string;
}

interface Profile {
  full_name: string | null;
  email: string | null;
  university_id: string | null;
}

interface LearningResource {
  id: string;
  title: string;
  resource_type: "written_explanation" | "real_world_example" | "diagram" | "pre_quiz";
  content: string;
  subject: string | null;
  difficulty_level: "beginner" | "intermediate" | "advanced" | null;
}

export default function Profile() {
  const [classes, setClasses] = useState<UserClass[]>([]);
  const [syllabi, setSyllabi] = useState<Syllabus[]>([]);
  const [universities, setUniversities] = useState<{ id: string; name: string }[]>([]);
  const [learningResources, setLearningResources] = useState<LearningResource[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newClass, setNewClass] = useState({
    class_name: "",
    professor: "",
    semester: "",
    year: new Date().getFullYear(),
  });
  const navigate = useNavigate();
  const { toast } = useToast();
  const { profile, updateProfile, saveProfile, hasChanges } = useProfile();

  // Save profile when navigating away
  const handleNavigateBack = async () => {
    if (hasChanges) {
      const saved = await saveProfile();
      if (saved) {
        toast({
          title: "Profile saved",
          description: "Your profile has been automatically saved",
        });
      }
    }
    navigate("/");
  };

  useEffect(() => {
    checkAuthAndFetchData();
  }, []);

  const checkAuthAndFetchData = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      navigate("/auth");
      return;
    }

    // Fetch universities
    const { data: uniData } = await supabase
      .from("universities")
      .select("id, name")
      .order("name");
    
    if (uniData) {
      setUniversities(uniData);
    }

    // Fetch classes
    fetchClasses();
    
    // Fetch syllabi
    fetchSyllabi();
    
    // Fetch learning resources
    fetchLearningResources();
  };

  const fetchClasses = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data, error } = await supabase
      .from("user_classes")
      .select("*")
      .eq("user_id", session.user.id)
      .order("year", { ascending: false })
      .order("semester", { ascending: false });

    if (error) {
      console.error("Error fetching classes:", error);
    } else {
      setClasses(data || []);
    }
  };

  const fetchSyllabi = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data, error } = await supabase
      .from("syllabi")
      .select("*")
      .eq("user_id", session.user.id)
      .order("uploaded_at", { ascending: false });

    if (error) {
      console.error("Error fetching syllabi:", error);
    } else {
      setSyllabi(data || []);
    }
  };

  const handleDeleteSyllabus = async (syllabusId: string, filePath: string) => {
    // Delete from storage
    const { error: storageError } = await supabase.storage
      .from("syllabi")
      .remove([filePath]);

    if (storageError) {
      console.error("Error deleting file from storage:", storageError);
    }

    // Delete from database
    const { error } = await supabase
      .from("syllabi")
      .delete()
      .eq("id", syllabusId);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to delete syllabus",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Success",
        description: "Syllabus deleted successfully",
      });
      fetchSyllabi();
    }
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "Unknown size";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const saved = await saveProfile();
    if (!saved) {
      toast({
        title: "Error",
        description: "Failed to update profile",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Success",
        description: "Profile updated successfully",
      });
    }
  };

  const handleAddClass = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { error } = await supabase.from("user_classes").insert({
      user_id: session.user.id,
      class_name: newClass.class_name,
      professor: newClass.professor || null,
      semester: newClass.semester || null,
      year: newClass.year,
    });

    if (error) {
      toast({
        title: "Error",
        description: "Failed to add class",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Success",
        description: "Class added successfully",
      });
      setNewClass({ class_name: "", professor: "", semester: "", year: new Date().getFullYear() });
      setIsDialogOpen(false);
      fetchClasses();
    }
  };

  const handleDeleteClass = async (classId: string) => {
    const { error } = await supabase
      .from("user_classes")
      .delete()
      .eq("id", classId);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to delete class",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Success",
        description: "Class deleted successfully",
      });
      fetchClasses();
    }
  };

  const fetchLearningResources = async () => {
    const { data, error } = await supabase
      .from("learning_resources")
      .select("*")
      .order("resource_type")
      .order("title");

    if (error) {
      console.error("Error fetching learning resources:", error);
    } else {
      setLearningResources((data || []) as LearningResource[]);
    }
  };

  const getResourceIcon = (type: string) => {
    switch (type) {
      case "written_explanation":
        return <FileText className="w-5 h-5" />;
      case "real_world_example":
        return <Lightbulb className="w-5 h-5" />;
      case "diagram":
        return <ImageIcon className="w-5 h-5" />;
      case "pre_quiz":
        return <ClipboardCheck className="w-5 h-5" />;
      default:
        return <FileText className="w-5 h-5" />;
    }
  };

  const getResourceLabel = (type: string) => {
    switch (type) {
      case "written_explanation":
        return "Written Explanation";
      case "real_world_example":
        return "Real-World Example";
      case "diagram":
        return "Diagram";
      case "pre_quiz":
        return "Pre-Quiz";
      default:
        return type;
    }
  };

  const groupedResources = learningResources.reduce((acc, resource) => {
    if (!acc[resource.resource_type]) {
      acc[resource.resource_type] = [];
    }
    acc[resource.resource_type].push(resource);
    return acc;
  }, {} as Record<string, LearningResource[]>);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={handleNavigateBack}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-2xl font-bold text-foreground">Profile & Classes</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 space-y-8">
        {/* Profile Information */}
        <Card className="p-6 shadow-[var(--shadow-medium)]">
          <h2 className="text-xl font-semibold text-foreground mb-4">Profile Information</h2>
          <form onSubmit={handleUpdateProfile} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="full_name">Full Name</Label>
              <Input
                id="full_name"
                value={profile.full_name || ""}
                onChange={(e) => updateProfile({ full_name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={profile.email || ""}
                disabled
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="university">University</Label>
              <Select
                value={profile.university_id || ""}
                onValueChange={(value) => updateProfile({ university_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select your university" />
                </SelectTrigger>
                <SelectContent>
                  {universities.map((uni) => (
                    <SelectItem key={uni.id} value={uni.id}>
                      {uni.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button type="submit" className="bg-[image:var(--gradient-primary)]">
              Update Profile
            </Button>
          </form>
        </Card>

        {/* Classes */}
        <Card className="p-6 shadow-[var(--shadow-medium)]">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-foreground">My Classes</h2>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-[image:var(--gradient-primary)]">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Class
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add New Class</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleAddClass} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="class_name">Class Name</Label>
                    <Input
                      id="class_name"
                      value={newClass.class_name}
                      onChange={(e) => setNewClass({ ...newClass, class_name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="professor">Professor</Label>
                    <Input
                      id="professor"
                      value={newClass.professor}
                      onChange={(e) => setNewClass({ ...newClass, professor: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="semester">Semester</Label>
                      <Select
                        value={newClass.semester}
                        onValueChange={(value) => setNewClass({ ...newClass, semester: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select semester" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Spring">Spring</SelectItem>
                          <SelectItem value="Summer">Summer</SelectItem>
                          <SelectItem value="Fall">Fall</SelectItem>
                          <SelectItem value="Winter">Winter</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="year">Year</Label>
                      <Input
                        id="year"
                        type="number"
                        value={newClass.year}
                        onChange={(e) => setNewClass({ ...newClass, year: parseInt(e.target.value) })}
                      />
                    </div>
                  </div>
                  <Button type="submit" className="w-full bg-[image:var(--gradient-primary)]">
                    Add Class
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {classes.length === 0 ? (
            <p className="text-muted-foreground">No classes added yet</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {classes.map((cls) => (
                <Card key={cls.id} className="p-4 border-border">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <h3 className="font-semibold text-foreground">{cls.class_name}</h3>
                      {cls.professor && (
                        <p className="text-sm text-muted-foreground mt-1">Prof. {cls.professor}</p>
                      )}
                      <p className="text-sm text-muted-foreground mt-1">
                        {cls.semester} {cls.year}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteClass(cls.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </Card>

        {/* Uploaded Syllabi */}
        <Card className="p-6 shadow-[var(--shadow-medium)]">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-foreground">Uploaded Syllabi</h2>
            <Button 
              variant="outline" 
              onClick={() => navigate("/")}
              className="gap-2"
            >
              <Upload className="h-4 w-4" />
              Upload New
            </Button>
          </div>

          {syllabi.length === 0 ? (
            <p className="text-muted-foreground">No syllabi uploaded yet. Upload a syllabus from the dashboard to get started.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {syllabi.map((syllabus) => (
                <Card key={syllabus.id} className="p-4 border-border">
                  <div className="flex justify-between items-start">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="p-2 rounded-lg bg-primary/10 text-primary">
                        <FileText className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-foreground">{syllabus.class_name}</h3>
                        <p className="text-sm text-muted-foreground mt-1 truncate">{syllabus.file_name}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="secondary" className="text-xs">
                            {formatFileSize(syllabus.file_size)}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {new Date(syllabus.uploaded_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteSyllabus(syllabus.id, syllabus.file_path)}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </Card>

        {/* Available Learning Resources */}
        <Card className="p-6 shadow-[var(--shadow-medium)]">
          <h2 className="text-xl font-semibold text-foreground mb-6">Available Learning Resources</h2>
          {learningResources.length === 0 ? (
            <p className="text-muted-foreground">No learning resources available yet</p>
          ) : (
            <div className="space-y-6">
              {Object.entries(groupedResources).map(([type, resources]) => (
                <div key={type} className="space-y-3">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="p-2 rounded-lg bg-primary/10 text-primary">
                      {getResourceIcon(type)}
                    </div>
                    <h3 className="text-lg font-semibold text-foreground">
                      {getResourceLabel(type)}
                    </h3>
                    <Badge variant="secondary" className="ml-2">
                      {resources.length}
                    </Badge>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {resources.map((resource) => (
                      <Card key={resource.id} className="p-4 border-border hover:shadow-[var(--shadow-soft)] transition-[var(--transition-smooth)]">
                        <div className="flex justify-between items-start gap-3">
                          <div className="flex-1 space-y-2">
                            <h4 className="font-medium text-foreground">{resource.title}</h4>
                            {resource.subject && (
                              <Badge variant="outline" className="text-xs">
                                {resource.subject}
                              </Badge>
                            )}
                            {resource.difficulty_level && (
                              <Badge 
                                variant="secondary" 
                                className="text-xs ml-2"
                              >
                                {resource.difficulty_level}
                              </Badge>
                            )}
                            <p className="text-sm text-muted-foreground line-clamp-2">
                              {resource.content}
                            </p>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </main>
    </div>
  );
}

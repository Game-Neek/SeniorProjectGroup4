import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ConsentBanner } from "@/components/ConsentBanner";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import CalendarPage from "./pages/CalendarPage";
import Profile from "./pages/Profile";
import ReadAloudDemo from "./pages/ReadAloudDemo";
import CoursePage from "./pages/CoursePage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <ConsentBanner />
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/read-aloud" element={<ReadAloudDemo />} />
          <Route path="/course/:className" element={<CoursePage />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

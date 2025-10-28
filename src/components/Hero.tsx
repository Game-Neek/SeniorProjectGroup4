import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles } from "lucide-react";

interface HeroProps {
  onGetStarted: () => void;
}

export const Hero = ({ onGetStarted }: HeroProps) => {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden px-4">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-[image:var(--gradient-hero)]" />
      
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-20 left-10 w-72 h-72 bg-primary/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-secondary/10 rounded-full blur-3xl animate-pulse delay-1000" />
        <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-accent/10 rounded-full blur-3xl animate-pulse delay-500" />
      </div>

      {/* Content */}
      <div className="relative z-10 max-w-5xl mx-auto text-center space-y-8">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-card/80 backdrop-blur-sm shadow-[var(--shadow-soft)] border border-border">
          <Sparkles className="w-4 h-4 text-accent" />
          <span className="text-sm font-medium text-foreground">Your Personalized Learning Companion</span>
        </div>

        <h1 className="text-5xl md:text-7xl font-bold text-foreground leading-tight">
          Learn Smarter,
          <br />
          <span className="bg-clip-text text-transparent bg-[image:var(--gradient-primary)]">
            Not Harder
          </span>
        </h1>

        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          Meet AgentB—your AI-powered campus assistant. Get personalized learning tailored to your style, 
          instant access to campus resources, and support that adapts to your needs.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
          <Button 
            size="lg" 
            onClick={onGetStarted}
            className="bg-[image:var(--gradient-primary)] hover:opacity-90 text-primary-foreground shadow-[var(--shadow-medium)] transition-[var(--transition-smooth)] text-lg px-8"
          >
            Get Started
            <ArrowRight className="ml-2 h-5 w-5" />
          </Button>
          <Button 
            size="lg" 
            variant="outline"
            className="border-2 hover:bg-card/50 transition-[var(--transition-smooth)] text-lg px-8"
          >
            Learn More
          </Button>
        </div>

        {/* Feature highlights */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-16 max-w-4xl mx-auto">
          {[
            { title: "Adaptive Learning", desc: "Content that matches your learning style" },
            { title: "AgentB AI", desc: "24/7 intelligent campus assistant" },
            { title: "All-in-One Hub", desc: "Campus info, resources, and tools" }
          ].map((feature, i) => (
            <div 
              key={i}
              className="p-6 rounded-2xl bg-card/60 backdrop-blur-sm border border-border shadow-[var(--shadow-soft)] hover:shadow-[var(--shadow-medium)] transition-[var(--transition-smooth)]"
            >
              <h3 className="font-semibold text-lg text-foreground mb-2">{feature.title}</h3>
              <p className="text-sm text-muted-foreground">{feature.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

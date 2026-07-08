import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { AlertCircle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6 animate-in fade-in">
      <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center text-muted-foreground">
        <AlertCircle size={40} />
      </div>
      <div>
        <h1 className="text-4xl font-display font-bold">404</h1>
        <p className="text-lg text-muted-foreground mt-2 max-w-md">
          Strona, której szukasz, nie istnieje lub została przeniesiona.
        </p>
      </div>
      <Button asChild size="lg">
        <Link href="/">Wróć na Pulpit</Link>
      </Button>
    </div>
  );
}

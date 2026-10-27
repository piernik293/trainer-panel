import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2 items-center">
            <AlertCircle className="h-8 w-8 text-destructive" aria-hidden />
            <h1 className="text-2xl font-bold">Nie ma takiej strony</h1>
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Sprawdź adres albo wróć do swojego planu.
          </p>
          <a href={`${import.meta.env.BASE_URL}plan`} className="mt-4 inline-flex min-h-11 items-center text-sm font-medium text-primary underline underline-offset-2">
            Przejdź do planu
          </a>
        </CardContent>
      </Card>
    </div>
  );
}

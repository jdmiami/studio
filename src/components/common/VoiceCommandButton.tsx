"use client";

import { useState } from 'react';
import { Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { VoiceCommandDialog } from './VoiceCommandDialog';
import { cn } from '@/lib/utils';

export function VoiceCommandButton() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  return (
    <>
      <Button
        className={cn(
          "fixed bottom-6 right-6 z-50 h-16 w-16 rounded-full shadow-lg shadow-primary/30",
          "bg-primary hover:bg-primary/90 text-primary-foreground",
          "animate-pulse hover:animate-none"
        )}
        size="icon"
        onClick={() => setIsDialogOpen(true)}
      >
        <Mic className="h-8 w-8" />
      </Button>
      <VoiceCommandDialog open={isDialogOpen} onOpenChange={setIsDialogOpen} />
    </>
  );
}

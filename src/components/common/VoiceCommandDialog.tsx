"use client";

import { useState, useTransition } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { voiceControlledInvoiceCreation } from '@/ai/flows/voice-controlled-invoice-creation';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { Loader2, Zap } from 'lucide-react';

type VoiceCommandDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const placeholderCommand = "Create an invoice for Amara at Paraiso with 50 green coconuts for 6 dollars each.";

/**
 * A dialog component that accepts a text command (simulating voice input) to be processed by AI.
 *
 * @param props - The component props.
 * @param props.open - Whether the dialog is open.
 * @param props.onOpenChange - Callback when the open state changes.
 * @returns The VoiceCommandDialog component.
 */
export function VoiceCommandDialog({
  open,
  onOpenChange,
}: VoiceCommandDialogProps) {
  const [command, setCommand] = useState('');
  const [isProcessing, startTransition] = useTransition();
  const [result, setResult] = useState<any>(null);
  const { toast } = useToast();

  const handleProcessCommand = () => {
    if (!command) {
        setCommand(placeholderCommand);
    }
    const commandToProcess = command || placeholderCommand;
    
    startTransition(async () => {
      setResult(null);
      try {
        const response = await voiceControlledInvoiceCreation({ voiceCommand: commandToProcess });
        setResult(response);
        toast({
          title: "AI Command Processed",
          description: `Status: ${response.invoiceStatus}`,
        });
        // onOpenChange(false); // Optionally close dialog on success
      } catch (error) {
        console.error("AI command failed:", error);
        toast({
          variant: 'destructive',
          title: "Error",
          description: "Failed to process AI command.",
        });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="font-headline flex items-center gap-2">
            <Zap className="text-primary" /> Voice Command
          </DialogTitle>
          <DialogDescription>
            Enter a command to create an invoice or manage inventory. The AI will process it for you.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <Textarea
            id="command"
            placeholder={placeholderCommand}
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            className="h-28 text-base"
          />
           {result && (
            <Alert>
              <Zap className="h-4 w-4" />
              <AlertTitle>AI Response</AlertTitle>
              <AlertDescription>
                {JSON.stringify(result, null, 2)}
              </AlertDescription>
            </Alert>
          )}
        </div>
        <DialogFooter>
          <Button
            onClick={handleProcessCommand}
            disabled={isProcessing}
            className="w-full"
          >
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              'Process Command'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

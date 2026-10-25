import { Button } from '@nest/ui/components/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@nest/ui/components/sheet';
import { Bot } from 'lucide-react';

export function AgentPanel() {
  return (
    <Sheet>
      <SheetTrigger render={<Button variant="ghost" size="icon" aria-label="Open the agent panel" />}>
        <Bot />
      </SheetTrigger>
      <SheetContent className="w-full sm:max-w-[380px]">
        <SheetHeader>
          <SheetTitle>Agent</SheetTitle>
          <SheetDescription>
            The research agent isn't connected in this build. Research tables and forms work without it.
          </SheetDescription>
        </SheetHeader>
      </SheetContent>
    </Sheet>
  );
}

'use client';

import { Sheet, SheetContent } from '@seta/shared-ui';
import { useState } from 'react';
import { HiringComposer } from './chat-experience/hiring-composer';
import { HiringHeader } from './chat-experience/hiring-header';
import { HiringProvider } from './chat-experience/hiring-provider';
import { HiringTranscript } from './chat-experience/hiring-transcript';
import { ThreadList } from './chat-experience/thread-list';

export interface ChatScreenProps {
  threadId?: string;
}

function ChatScreenContent() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex h-full min-h-0 flex-1">
      {/* Desktop Sidebar */}
      <div className="hidden w-[280px] flex-shrink-0 lg:flex">
        <ThreadList />
      </div>

      {/* Mobile Sheet */}
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent
          side="left"
          hideClose
          className="w-[280px] border-r border-hairline bg-surface-1 p-0 sm:max-w-none lg:hidden"
        >
          <ThreadList />
        </SheetContent>
      </Sheet>

      {/* Main Content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <HiringHeader onOpenMobileNav={() => setMobileNavOpen(true)} />
        <HiringTranscript />
        <HiringComposer />
      </div>
    </div>
  );
}

export function ChatScreen() {
  return (
    <HiringProvider>
      <ChatScreenContent />
    </HiringProvider>
  );
}

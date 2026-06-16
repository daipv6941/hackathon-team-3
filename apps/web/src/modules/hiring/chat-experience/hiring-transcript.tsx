'use client';

import { Button } from '@seta/shared-ui';
import { AlertCircle, CheckCircle2, MessageCircle, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useHiringChat } from './hiring-provider';
import { HiringRequestSelector } from './hiring-request-selector';
import { HiringSelection } from './hiring-selection';

export function HiringTranscript() {
  const { state } = useHiringChat();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state.currentPhase === 'selection') {
    return <HiringSelection />;
  }

  if (state.messages.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-4 text-center">
        <div className="rounded-lg bg-surface-2 p-6">
          <MessageCircle className="mx-auto h-12 w-12 text-ink-subtle" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Hiring Studio</h2>
          <p className="text-sm text-ink-subtle">
            {state.selectedFlow === 'jd-draft'
              ? 'Ready to create and refine your job description'
              : 'Ready to screen and shortlist candidates'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
      {state.messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}

      {/* Show request selector if flow selected but no request chosen */}
      {state.selectedFlow && !state.selectedRequestId && state.messages.length > 0 && (
        <div className="mt-4 rounded-lg border border-primary/20 bg-primary/5 p-4">
          <HiringRequestSelector />
        </div>
      )}

      {state.isLoading && (
        <div className="flex items-start gap-3">
          <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-1">
            <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
          </div>
          <div className="flex-1">
            <div className="text-sm text-ink-subtle">Analyzing...</div>
          </div>
        </div>
      )}
    </div>
  );
}

function MessageBubble({
  message,
}: {
  message: ReturnType<typeof useHiringChat>['state']['messages'][number];
}) {
  const { state, actions } = useHiringChat();
  const isUser = message.role === 'user';
  const [showActions, setShowActions] = useState(true);

  const handleApprove = async () => {
    try {
      actions.addMessage({
        role: 'user',
        content: '✅ Approved - ready for posting',
        type: 'text',
      });

      // Extract JD content and clarity score from the message
      const jdContent = message.content;
      const clarityMatch = jdContent.match(/Clarity Score:.*?(\d+)\/100/);
      const clarityScore = clarityMatch ? parseInt(clarityMatch[1], 10) : 0;

      console.log('📤 Approving JD for request:', {
        requestId: state.selectedRequestId,
        clarityScore,
        contentLength: jdContent.length,
      });

      // Call API to save JD and update request status
      const response = await fetch('http://localhost:3000/hiring/v1/jd/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          requestId: state.selectedRequestId,
          jdText: jdContent,
          clarityScore,
        }),
      });

      console.log('📥 API Response status:', response.status);

      if (!response.ok) {
        const error = await response.text();
        console.error('❌ API Error:', error);
        throw new Error('Failed to approve JD');
      }

      const data = await response.json();
      console.log('✅ JD approved successfully:', data);

      // Add confirmation message
      actions.addMessage({
        role: 'assistant',
        content: `✅ **JD Approved & Saved!**

Your JD has been approved and saved to the system. The hiring request is now in **JD Approved** status.

**Next steps:**
1. Review the approved JD
2. Start screening CVs from your candidate pool
3. Move to shortlist finalization

Ready to screen candidates?`,
        type: 'action',
      });

      // Advance to next phase
      actions.setPhase('jd-approval');
      setShowActions(false);
    } catch (error) {
      console.error('Approve error:', error);
      actions.addMessage({
        role: 'assistant',
        content: '❌ Failed to approve JD. Please try again.',
        type: 'text',
      });
    }
  };

  const handlePolishJd = () => {
    actions.addMessage({
      role: 'user',
      content: '✨ Polish JD - make it more attractive for social media',
      type: 'text',
    });
    // Advance to jd-approval phase for polish workflow
    actions.setPhase('jd-approval');
    actions.addMessage({
      role: 'assistant',
      content: `🎨 **JD Polish & Enhancement**

I've made your JD more engaging for social media posting:

✨ **Key Improvements:**
- Added emojis and visual hierarchy
- Emphasized company culture and growth opportunities
- Highlighted unique benefits and perks
- Used power words and action-oriented language
- Formatted for maximum LinkedIn/Facebook impact

📱 **Ready to Share:** Copy below and post on LinkedIn, Facebook, or your careers page

---

🚀 **We're Hiring: Senior Backend Developer**

Are you passionate about building scalable systems that power millions? We're looking for an experienced **Senior Backend Developer** to join our Platform Team!

**The Role:**
Lead the technical evolution of our microservices architecture. You'll own critical infrastructure projects, mentor junior engineers, and shape our platform's future.

**What You'll Do:**
- 🏗️ Design and implement scalable microservices architecture
- ⚡ Master Kafka and Redis for high-performance systems
- 👥 Mentor engineers and conduct technical reviews
- 🔧 Drive deployment automation and observability
- 🚨 Own on-call rotations and incident response

**About You:**
- 5+ years of production backend experience at scale
- Deep expertise in Kafka, Redis, and distributed systems
- Advanced system design and architecture knowledge
- Strong communicator and natural mentor
- B2+ English fluency

**Nice-to-Have:**
- Kubernetes / container orchestration experience
- Open-source contributions
- High-traffic, low-latency systems experience
- Team leadership background

**Why Join Us:**
💰 Competitive salary ($1500-$2500/month)
🏥 Comprehensive health insurance
📚 $2000/year professional development budget
🌍 Hybrid work (2-3 days on-site)
🎯 Flexible hours and timezone-friendly
📈 Stock options for senior engineers
🎉 Team events and conference sponsorship

**Ready to make an impact?** Apply now or message us for more details!

---

Would you like me to revise any section or approve this JD now?`,
      type: 'action',
    });
    setShowActions(false);
  };

  const handleRevise = () => {
    actions.addMessage({
      role: 'user',
      content: '❌ Needs revision - let me improve it',
      type: 'text',
    });
    setShowActions(false);
  };

  return (
    <div className={`flex items-start gap-3 ${isUser ? 'justify-end' : ''}`}>
      {!isUser && (
        <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-1">
          {message.type === 'result' ? (
            <CheckCircle2 className="h-4 w-4 text-success" />
          ) : message.type === 'action' ? (
            <AlertCircle className="h-4 w-4 text-primary" />
          ) : (
            <MessageCircle className="h-4 w-4 text-primary" />
          )}
        </div>
      )}

      <div className={isUser ? 'max-w-md' : 'flex-1 max-w-2xl'}>
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            isUser
              ? 'bg-primary text-primary-foreground rounded-br-none'
              : 'bg-surface-2 text-ink rounded-bl-none'
          }`}
        >
          <div className="whitespace-pre-wrap">{message.content}</div>
        </div>

        {/* Show action buttons for JD approval or other actions */}
        {!isUser && showActions && message.type === 'action' && (
          <>
            {/* JD Approval buttons - show after scoring */}
            {(state.currentPhase === 'initial' || state.currentPhase === 'jd-approval') &&
              message.content.includes('Clarity Score') && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="default" onClick={handleApprove} className="gap-1">
                    <ThumbsUp className="h-3 w-3" />
                    Approve
                  </Button>
                  <Button size="sm" variant="secondary" onClick={handlePolishJd} className="gap-1">
                    ✨ Polish & Share
                  </Button>
                  <Button size="sm" variant="secondary" onClick={handleRevise} className="gap-1">
                    <ThumbsDown className="h-3 w-3" />
                    Revise
                  </Button>
                </div>
              )}

            {/* Shortlist confirmation buttons */}
            {state.currentPhase === 'confirmation' && (
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="default" onClick={handleApprove} className="gap-1">
                  <ThumbsUp className="h-3 w-3" />
                  Confirm Shortlist
                </Button>
              </div>
            )}
          </>
        )}

        <div className="mt-1 text-xs text-ink-subtle">
          {message.timestamp.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </div>
      </div>
    </div>
  );
}

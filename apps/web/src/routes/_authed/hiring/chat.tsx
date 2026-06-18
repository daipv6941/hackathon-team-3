import { createFileRoute } from '@tanstack/react-router';
import { ChatScreen } from '@/modules/hiring';

export const Route = createFileRoute('/_authed/hiring/chat')({
  component: ChatRoute,
});

function ChatRoute() {
  return <ChatScreen />;
}

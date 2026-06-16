import { type NavManifest, noNavExtensions } from '@seta/module-sdk';
import { Briefcase, MessageSquare, Users } from 'lucide-react';

export const hiringNavManifest: NavManifest = {
  id: 'hiring',
  label: 'Hiring Studio',
  icon: Briefcase,
  requiredPermissions: [],
  useNavExtensions: noNavExtensions,
  nav: [
    {
      label: 'Workspace',
      items: [
        {
          id: 'hiring.chat',
          icon: MessageSquare,
          label: 'Chat',
          to: '/hiring/chat',
        },
        {
          id: 'hiring.requests',
          icon: Users,
          label: 'Requests',
          to: '/hiring/requests',
        },
      ],
    },
  ],
};

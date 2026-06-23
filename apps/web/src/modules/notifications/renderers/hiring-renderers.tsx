import type { NotificationListItemNotification } from '@seta/shared-ui';
import { useNavigate } from '@tanstack/react-router';
import { ClipboardList } from 'lucide-react';
import type * as React from 'react';

type ShortlistOverduePayload = {
  request_id?: string;
};

export function useResolveHiringNotification(notification: NotificationListItemNotification): {
  icon?: React.ReactNode;
  onClick?: () => void;
} {
  const navigate = useNavigate();

  if (notification.event_type !== 'hiring.shortlist.overdue') return {};

  const payload = (notification.payload ?? {}) as ShortlistOverduePayload;
  const requestId = payload.request_id;

  return {
    icon: <ClipboardList className="size-4" aria-hidden />,
    onClick: requestId
      ? () => {
          void navigate({
            to: '/hiring/requests/$requestId',
            params: { requestId },
          } as never);
        }
      : undefined,
  };
}

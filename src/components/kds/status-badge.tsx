import { Badge } from "@/src/components/ui/badge";
import type {
  ItemStatus,
  OrderStatus,
  TicketStatus,
} from "@/src/domain/production";

type StatusKind = ItemStatus | TicketStatus | OrderStatus;

export function StatusBadge({
  status,
  label,
}: {
  status: StatusKind;
  label: string;
}) {
  const variant =
    status === "canceled"
      ? "danger"
      : status === "ready" || status === "ready_to_serve"
      ? "ready"
      : status === "in_preparation" || status === "in_progress"
        ? "active"
        : status === "partially_ready"
          ? "warning"
          : "neutral";

  return <Badge variant={variant}>{label}</Badge>;
}

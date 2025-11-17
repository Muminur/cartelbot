"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ISignal } from "@/types";
import { MoreVertical, Eye, Edit, XCircle, Play, Trash2, Eraser } from "lucide-react";

interface SignalActionsProps {
  signal: ISignal;
  onViewDetails: (signal: ISignal) => void;
  onEdit?: (signal: ISignal) => void;
  onCancel?: (signal: ISignal) => void;
  onExecute?: (signal: ISignal) => void;
  onDelete?: (signal: ISignal) => void;
  onCleanupPhantomOrders?: (signal: ISignal) => void;
}

export default function SignalActions({
  signal,
  onViewDetails,
  onEdit,
  onCancel,
  onExecute,
  onDelete,
  onCleanupPhantomOrders,
}: SignalActionsProps) {
  const canEdit = signal.status === "pending";
  const canCancel = signal.status === "pending" || signal.status === "parsed";
  const canExecute = signal.status === "parsed";
  const canDelete = signal.status === "executing" || signal.status === "completed" || signal.status === "failed";
  const canCleanup = signal.status === "failed" || signal.status === "executing";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/* Touch-friendly button: 48x48px minimum on mobile */}
        <Button variant="ghost" size="icon" className="h-12 w-12 md:h-8 md:w-8 p-0">
          <span className="sr-only">Open menu</span>
          <MoreVertical className="h-5 w-5 md:h-4 md:w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 md:w-48">
        <DropdownMenuItem 
          onClick={() => onViewDetails(signal)}
          className="py-3 md:py-2 text-base md:text-sm"
        >
          <Eye className="mr-3 md:mr-2 h-5 w-5 md:h-4 md:w-4" />
          <span>View Details</span>
        </DropdownMenuItem>

        {canEdit && onEdit && (
          <DropdownMenuItem 
            onClick={() => onEdit(signal)}
            className="py-3 md:py-2 text-base md:text-sm"
          >
            <Edit className="mr-3 md:mr-2 h-5 w-5 md:h-4 md:w-4" />
            <span>Edit Signal</span>
          </DropdownMenuItem>
        )}

        {canExecute && onExecute && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              onClick={() => onExecute(signal)}
              className="py-3 md:py-2 text-base md:text-sm"
            >
              <Play className="mr-3 md:mr-2 h-5 w-5 md:h-4 md:w-4" />
              <span>Execute Trade</span>
            </DropdownMenuItem>
          </>
        )}

        {canCancel && onCancel && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onCancel(signal)}
              className="text-red-600 focus:text-red-600 py-3 md:py-2 text-base md:text-sm"
            >
              <XCircle className="mr-3 md:mr-2 h-5 w-5 md:h-4 md:w-4" />
              <span>Cancel Signal</span>
            </DropdownMenuItem>
          </>
        )}

        {canCleanup && onCleanupPhantomOrders && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onCleanupPhantomOrders(signal)}
              className="text-yellow-600 focus:text-yellow-600 py-3 md:py-2 text-base md:text-sm"
            >
              <Eraser className="mr-3 md:mr-2 h-5 w-5 md:h-4 md:w-4" />
              <span>Cleanup Phantom Orders</span>
            </DropdownMenuItem>
          </>
        )}

        {canDelete && onDelete && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDelete(signal)}
              className="text-red-600 focus:text-red-600 py-3 md:py-2 text-base md:text-sm"
            >
              <Trash2 className="mr-3 md:mr-2 h-5 w-5 md:h-4 md:w-4" />
              <span>Delete Signal</span>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

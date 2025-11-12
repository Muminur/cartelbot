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
import { MoreVertical, Eye, Edit, XCircle, Play, Trash2 } from "lucide-react";

interface SignalActionsProps {
  signal: ISignal;
  onViewDetails: (signal: ISignal) => void;
  onEdit?: (signal: ISignal) => void;
  onCancel?: (signal: ISignal) => void;
  onExecute?: (signal: ISignal) => void;
  onDelete?: (signal: ISignal) => void;
}

export default function SignalActions({
  signal,
  onViewDetails,
  onEdit,
  onCancel,
  onExecute,
  onDelete,
}: SignalActionsProps) {
  const canEdit = signal.status === "pending";
  const canCancel = signal.status === "pending" || signal.status === "parsed";
  const canExecute = signal.status === "parsed";
  const canDelete = signal.status === "executing" || signal.status === "completed";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
          <span className="sr-only">Open menu</span>
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={() => onViewDetails(signal)}>
          <Eye className="mr-2 h-4 w-4" />
          <span>View Details</span>
        </DropdownMenuItem>

        {canEdit && onEdit && (
          <DropdownMenuItem onClick={() => onEdit(signal)}>
            <Edit className="mr-2 h-4 w-4" />
            <span>Edit Signal</span>
          </DropdownMenuItem>
        )}

        {canExecute && onExecute && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onExecute(signal)}>
              <Play className="mr-2 h-4 w-4" />
              <span>Execute Trade</span>
            </DropdownMenuItem>
          </>
        )}

        {canCancel && onCancel && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onCancel(signal)}
              className="text-red-600 focus:text-red-600"
            >
              <XCircle className="mr-2 h-4 w-4" />
              <span>Cancel Signal</span>
            </DropdownMenuItem>
          </>
        )}

        {canDelete && onDelete && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDelete(signal)}
              className="text-red-600 focus:text-red-600"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              <span>Delete Signal</span>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
